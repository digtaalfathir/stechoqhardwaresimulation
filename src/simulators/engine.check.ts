/**
 * Engine self-check: `npm run check`.
 *
 * Covers the logic the UI cannot: config validation, the state machines, event
 * envelopes and timer cleanup. Runs headless — the engine has no DOM deps.
 */
import { simulators, getSimulator, plannedSimulators, CATEGORIES } from './registry';
import { RfidHandheldSimulator } from './rfid/rfid-handheld';
import { NutrunnerSimulator } from './nutrunner/nutrunner';
import { DigitalIoSimulator } from './digital-io/digital-io';
import { httpPost, randomEpc } from './core/wire';

// Deliberately not an `asserts cond` signature: TypeScript would narrow device
// status and phase permanently and then reject every later comparison.
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // --- registry contract ---
  assert(simulators.length >= 3, 'registry exposes the MVP simulators');
  assert(new Set(simulators.map((s) => s.meta.id)).size === simulators.length, 'simulator ids are unique');
  const allIds = [...simulators.map((s) => s.meta.id), ...plannedSimulators.map((s) => s.id)];
  assert(new Set(allIds).size === allIds.length, 'catalog ids do not collide with live ids');
  for (const s of [...simulators, ...plannedSimulators]) {
    const category = 'meta' in s ? s.meta.category : s.category;
    assert(CATEGORIES.includes(category), `${'meta' in s ? s.meta.id : s.id} has a known category`);
  }
  assert(getSimulator('nope') === undefined, 'unknown id resolves to undefined');
  for (const s of simulators) {
    assert(s.stateRows().length > 0, `${s.meta.id} reports state rows before any action`);
    assert(Object.keys(s.samplePayload()).length > 0, `${s.meta.id} documents a sample payload`);
    assert(s.actions.some((a) => a.id === 'reset'), `${s.meta.id} can be reset`);
  }

  // --- config validation is the trust boundary ---
  const rfid = new RfidHandheldSimulator();
  rfid.applyConfig({ interval: '50', readRate: '400', antenna: '9', readerId: 'TEST-READER' });
  assert(rfid.num('interval') === 200, 'below-minimum numbers clamp to the field minimum');
  assert(rfid.num('readRate') === 100, 'above-maximum numbers clamp to the field maximum');
  assert(rfid.cfg('antenna') === '1', 'a value outside a select option list is rejected');
  assert(rfid.cfg('readerId') === 'TEST-READER', 'valid values are applied');
  rfid.applyConfig({ interval: 'not-a-number' });
  assert(rfid.num('interval') === 200, 'unparseable numbers leave the previous value intact');
  assert(rfid.status === 'CONNECTED', 'applying configuration brings the device online');

  // --- rfid behaviour ---
  rfid.applyConfig({ readRate: 100, tagPool: 'AAAA\nBBBB' });
  rfid.run('scan-once');
  const scan = rfid.events.find((e) => e.name === 'RFID_SCANNED');
  assert(scan, 'a single scan produces RFID_SCANNED');
  assert(['AAAA', 'BBBB'].includes(String(scan!.payload.idHex)), 'the read tag comes from the tag pool');
  assert(scan!.payload.reader_id === 'TEST-READER', 'the payload carries the configured reader id');
  assert(!Number.isNaN(Date.parse(String(scan!.payload.timestamp))), 'the payload timestamp is ISO-8601');
  assert(scan!.transport?.protocol === 'REST', 'a scan produces a REST frame');
  assert(scan!.transport!.detail.includes('POST'), 'the frame contains the HTTP request line');

  rfid.applyConfig({ readRate: 0 });
  rfid.run('scan-once');
  assert(rfid.events[0].name === 'SCAN_NO_TAG', 'a 0% read rate reproduces a missed read');

  rfid.applyConfig({ readRate: 100, interval: 200 });
  rfid.run('start-scan');
  assert(rfid.status === 'SIMULATING', 'continuous scanning reports SIMULATING');
  await sleep(520);
  rfid.run('stop-scan');
  const readsWhileScanning = rfid.state.scanCount;
  assert(readsWhileScanning >= 2, `the scan loop read repeatedly (got ${readsWhileScanning})`);
  assert(rfid.status === 'CONNECTED', 'stopping the scan returns to CONNECTED');
  await sleep(320);
  assert(rfid.state.scanCount === readsWhileScanning, 'stopping the scan clears the interval');

  rfid.run('random-tag');
  assert(rfid.state.generated.length === 1, 'generated tags are stored in device state');
  assert(rfid.cfg('tagPool') === 'AAAA\nBBBB', 'generating a tag never rewrites user configuration');

  rfid.run('reset');
  assert(rfid.state.scanCount === 0 && !rfid.state.scanning, 'reset clears device state');
  assert(rfid.cfg('readerId') === 'TEST-READER', 'reset keeps the applied configuration');
  assert(rfid.events[0].name === 'DEVICE_RESET', 'reset is logged');

  // --- nutrunner state machine ---
  const nut = new NutrunnerSimulator();
  nut.applyConfig({ targetTorque: 40, tolerance: 10, protocol: 'Open Protocol' });
  nut.run('force-ok');
  assert(nut.state.phase === 'TIGHTENING', 'the cycle enters TIGHTENING');
  assert(nut.status === 'SIMULATING', 'a running cycle reports SIMULATING');
  await sleep(1800);
  assert(nut.state.phase === 'OK', `Force OK lands inside the accept window (got ${nut.state.phase})`);
  const okResult = nut.events.find((e) => e.name === 'TIGHTENING_RESULT');
  assert(okResult && okResult.payload.result === 'OK', 'the result payload reports OK');
  assert(Math.abs(Number(okResult!.payload.torque) - 40) <= 4, 'the OK torque is inside ±10%');
  assert(Number(okResult!.payload.angle) > 0, 'the result payload carries an angle');
  assert(nut.state.curve.length > 1, 'the cycle records a torque ramp for the visualisation');
  assert(okResult!.transport?.protocol === 'TCP', 'Open Protocol results are framed as TCP');
  assert(okResult!.transport!.detail.includes('0061'), 'the frame is a MID 0061 result');

  nut.run('force-ng');
  await sleep(1800);
  assert(nut.state.phase === 'NG', `Force NG lands outside the accept window (got ${nut.state.phase})`);
  assert(Math.abs(nut.state.torque - 40) > 4, 'the NG torque is outside ±10%');
  assert(nut.state.cycle === 2 && nut.state.okCount === 1 && nut.state.ngCount === 1, 'cycle counters track results');

  nut.applyConfig({ protocol: 'Modbus TCP' });
  nut.run('start-tightening');
  await sleep(1800);
  assert(nut.events.find((e) => e.name === 'TIGHTENING_RESULT')?.transport?.protocol === 'Modbus TCP', 'the protocol setting selects the frame builder');

  nut.run('trigger-error');
  assert(nut.state.phase === 'ERROR' && nut.status === 'ERROR', 'a tool fault puts the device in ERROR');
  assert(nut.events[0].name === 'DEVICE_ERROR', 'the fault is logged');
  nut.run('start-tightening');
  await sleep(1800);
  assert(nut.state.phase !== 'ERROR', 'the device runs again after a fault');
  nut.run('reset');
  assert(nut.state.phase === 'READY' && nut.status === 'CONNECTED', 'reset clears the fault');

  // --- digital i/o ---
  const dio = new DigitalIoSimulator();
  dio.applyConfig({ channels: '4', transport: 'Modbus TCP' });
  assert(dio.state.inputs.length === 4 && dio.state.outputs.length === 4, 'channel count follows configuration');
  dio.toggle('DI', 1);
  assert(dio.state.inputs[1] === true, 'toggling an input flips exactly that channel');
  assert(dio.state.inputs.filter(Boolean).length === 1, 'no other channel moved');
  const change = dio.events[0];
  assert(change.name === 'DI_CHANGED', 'an input change emits DI_CHANGED');
  assert(change.summary === 'DI02 changed: OFF → ON', `the log line reads like the spec (got ${change.summary})`);
  assert(change.payload.channel === 'DI02' && change.payload.value === 1, 'the payload identifies the channel');
  assert(change.transport?.summary.includes('10002'), 'inputs map to the discrete-input table');
  dio.toggle('DO', 2);
  assert(dio.events[0].transport?.summary.includes('FC05'), 'outputs map to a coil write');
  assert(dio.stateRows().some((r) => r.label === 'Output Word' && r.value === '0x0004'), 'the output register word packs bit 2');
  dio.toggle('DI', 99);
  assert(dio.events[0].name === 'DO_CHANGED', 'an out-of-range channel is ignored');

  dio.applyConfig({ channels: '8' });
  assert(dio.state.inputs.length === 8 && dio.state.inputs[1] === true, 'growing the block keeps existing channel states');
  dio.run('all-outputs-off');
  assert(!dio.state.outputs.some(Boolean), 'all outputs drop to OFF');
  dio.run('pulse-output');
  assert(dio.state.outputs[0] === true, 'a pulse raises DO01');
  await sleep(900);
  assert(dio.state.outputs[0] === false, 'a pulse drops DO01 again');
  dio.applyConfig({ transport: 'MQTT' });
  dio.toggle('DI', 0);
  assert(dio.events[0].transport?.protocol === 'MQTT', 'the transport setting selects the frame builder');

  // --- shared engine behaviour ---
  const probe = new DigitalIoSimulator();
  let notifications = 0;
  const off = probe.subscribe(() => notifications++);
  probe.toggle('DO', 0);
  assert(notifications > 0, 'subscribers are notified on state change');
  off();
  const before = notifications;
  probe.toggle('DO', 1);
  assert(notifications === before, 'unsubscribing stops notifications');
  probe.clearEvents();
  assert(probe.events.length === 0, 'the event log can be cleared');

  const spinner = new RfidHandheldSimulator();
  spinner.applyConfig({ interval: 200 });
  spinner.run('start-scan');
  spinner.clearTimers();
  const parked = spinner.state.scanCount;
  await sleep(450);
  assert(spinner.state.scanCount === parked, 'clearTimers stops every device timer');

  // --- wire builders ---
  const frame = httpPost('http://example.test:8080/api/x?y=1', { a: 1 });
  assert(frame.detail.includes('POST /api/x?y=1 HTTP/1.1'), 'the request line uses the endpoint path');
  assert(frame.detail.includes('Host: example.test:8080'), 'the Host header uses the endpoint host');
  assert(httpPost('/relative/path', {}).detail.includes('POST /relative/path'), 'a bare path is still framed');
  assert(/^E2806894[0-9A-F]{16}$/.test(randomEpc()), 'generated EPCs are 24 hex characters');

  console.log('engine self-check passed');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  // Rethrow: the unhandled rejection is what gives node a non-zero exit code
  // without pulling in @types/node just to call process.exit.
  throw err;
});
