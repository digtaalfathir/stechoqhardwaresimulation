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
import { httpPost, randomEpc, withResponse } from './core/wire';
import type { TransportResponse } from './core/types';

/** Stand-in for the network: the check must never make a real request. */
const accepted: TransportResponse = {
  ok: true,
  status: 201,
  statusText: 'Created',
  message: 'log saved',
  durationMs: 12,
};
const rejected: TransportResponse = {
  ok: false,
  status: 422,
  statusText: 'Unprocessable Entity',
  message: 'rr_type is required',
  durationMs: 9,
};
const blocked: TransportResponse = {
  ok: false,
  status: 0,
  statusText: '',
  message: '',
  durationMs: 3,
  error: 'Could not reach example.test. The browser blocked the request.',
};

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
    const rows = s.stateRows();
    assert(Array.isArray(rows), `${s.meta.id} reports state rows as an array`);
    assert(
      rows.every((r) => typeof r.label === 'string' && typeof r.value === 'string'),
      `${s.meta.id} state rows are label/value pairs`,
    );
    assert(Object.keys(s.samplePayload()).length > 0, `${s.meta.id} documents a sample payload`);
    assert(s.actions.some((a) => a.id === 'reset'), `${s.meta.id} can be reset`);
  }

  // --- config validation is the trust boundary ---
  const rfid = new RfidHandheldSimulator();
  let lastSentTo = '';
  let lastSentBody: unknown = null;
  rfid.sender = async (url, body) => {
    lastSentTo = url;
    lastSentBody = body;
    return accepted;
  };
  rfid.applyConfig({
    interval: '50',
    antenna: '9',
    initial_year: '1999',
    mode: 'nonsense',
    rr_type: 'T1B',
    opname: false,
    baseUrl: 'https://my-own-host.test',
    reader_id: 'HACKED-READER',
  });
  assert(rfid.cfg('reader_id') === 'SIMULATOR-01', 'a read-only field ignores even a direct patch');
  assert(rfid.num('interval') === 200, 'below-minimum numbers clamp to the field minimum');
  assert(rfid.cfg('antenna') === '1', 'an antenna outside 1-8 is rejected');
  assert(rfid.cfg('initial_year') === '2026', 'a year outside the option list is rejected');
  assert(rfid.cfg('mode') === 'wo', 'a switch value outside its two options is rejected');
  assert(rfid.cfg('rr_type') === 'T1B', 'valid values are applied');
  rfid.applyConfig({ rr_type: 'NOT-IN-LIST' });
  assert(rfid.cfg('rr_type') === 'NOT-IN-LIST', 'RR type is a combo: values outside the list are allowed');
  rfid.applyConfig({ rr_type: 'T1B' });
  assert(rfid.bool('opname') === false, 'a checkbox stores a real boolean');
  assert(rfid.cfg('baseUrl') === 'https://my-own-host.test', 'a combo accepts a host outside its option list');
  rfid.applyConfig({ interval: 'not-a-number' });
  assert(rfid.num('interval') === 200, 'unparseable numbers leave the previous value intact');
  assert(rfid.status === 'CONNECTED', 'applying configuration brings the device online');

  // --- rfid batch behaviour ---
  rfid.applyConfig({
    baseUrl: 'https://wms.suite.stechoq-j.com',
    endpoint: '/api/v1/warehouse-management/jmp/log-rfids/components/handheld',
    antenna: '3',
    initial_year: '2027',
    mode: 'register',
    opname: true,
    maker_name: 'check',
    factory_code: '5022',
    interval: 200,
  });
  assert(
    rfid.url() === 'https://wms.suite.stechoq-j.com/api/v1/warehouse-management/jmp/log-rfids/components/handheld',
    `base url and endpoint join into one target (got ${rfid.url()})`,
  );

  rfid.setTagsText('AAAA\nBBBB\n\n  CCCC  ');
  assert(rfid.tags().length === 3, 'the tag list trims blanks and whitespace');
  assert(rfid.cfg('rr_type') === 'T1B', 'editing tags never touches configuration');

  rfid.run('scan-once');
  await sleep(30);
  const scan = rfid.events.find((e) => e.name === 'RFID_SENT');
  assert(scan, 'a delivered sweep produces RFID_SENT');
  assert(lastSentTo === rfid.url(), 'the request goes to the joined base URL + endpoint');
  assert(
    JSON.stringify((lastSentBody as Record<string, unknown>).idHex) === JSON.stringify(['AAAA', 'BBBB', 'CCCC']),
    'the body handed to the transport is the payload itself',
  );
  const body = scan!.payload;
  assert(Array.isArray(body.idHex), 'idHex is an array, not a single tag');
  assert(
    JSON.stringify(body.idHex) === JSON.stringify(['AAAA', 'BBBB', 'CCCC']),
    'one sweep sends the whole tag list at once',
  );
  assert(body.reader_id === 'SIMULATOR-01', 'the reader id is fixed to SIMULATOR-01');
  assert(body.antenna === '3' && body.initial_year === '2027', 'configured fields reach the payload');
  assert(body.mode === 'register' && body.opname === true, 'mode and opname reach the payload');
  assert(body.maker_name === 'check' && body.factory_code === '5022', 'free-text fields reach the payload');
  assert(!Number.isNaN(Date.parse(String(body.timestamp))), 'the payload timestamp is ISO-8601');
  assert(
    JSON.stringify(Object.keys(body)) ===
      JSON.stringify([
        'rr_type',
        'maker_name',
        'idHex',
        'initial_year',
        'reader_id',
        'antenna',
        'timestamp',
        'opname',
        'mode',
        'factory_code',
      ]),
    'the payload carries exactly the agreed keys',
  );
  assert(scan!.transport?.protocol === 'REST', 'a sweep produces a REST frame');
  assert(scan!.transport!.live === true, 'the frame is marked as really sent');
  assert(scan!.transport!.response?.status === 201, 'the frame carries the response status');
  assert(scan!.transport!.detail.includes('201 Created'), 'the frame shows the response line');
  assert(scan!.transport!.detail.includes('log saved'), 'the frame shows the response message');
  assert(scan!.summary?.includes('201 Created'), 'the event summary states the outcome');
  assert(rfid.state.okCount === 1 && rfid.state.failCount === 0, 'a delivered send counts as delivered');
  assert(rfid.state.lastResponse?.message === 'log saved', 'the response is kept for the result panel');
  assert(
    scan!.transport!.detail.includes('POST /api/v1/warehouse-management/jmp/log-rfids/components/handheld'),
    'the frame posts to the configured endpoint path',
  );
  assert(scan!.transport!.detail.includes('Host: wms.suite.stechoq-j.com'), 'the frame targets the configured host');

  const generated = rfid.tags().length;
  rfid.addRandomTag();
  assert(rfid.tags().length === generated + 1, 'Generate Random Tag appends to the live tag list');
  assert(/^E2806894[0-9A-F]{16}$/.test(rfid.tags()[generated]), 'the generated tag is a 24-char EPC');
  assert(rfid.events[0].name === 'TAG_GENERATED', 'generating a tag is logged');

  rfid.setTagsText('   \n  ');
  rfid.run('scan-once');
  assert(rfid.events[0].name === 'SCAN_NO_TAG', 'an empty tag list sends nothing and says so');

  rfid.setTagsText('AAAA\nBBBB');
  const sentBefore = rfid.state.sendCount;
  const seqBefore = rfid.events[0].seq;
  rfid.run('start-scan');
  assert(rfid.status === 'SIMULATING', 'continuous scanning reports SIMULATING');
  assert(rfid.state.sendCount === sentBefore + 1, 'starting a scan sends immediately, without waiting an interval');
  await sleep(30);
  await sleep(520);
  rfid.run('stop-scan');
  const sentWhileScanning = rfid.state.sendCount;
  assert(sentWhileScanning >= sentBefore + 3, `the scan loop keeps sending (got ${sentWhileScanning - sentBefore})`);
  assert(rfid.status === 'CONNECTED', 'stopping the scan returns to CONNECTED');
  const sweeps = rfid.events.filter((e) => e.name === 'RFID_SENT' && e.seq > seqBefore);
  assert(sweeps.length >= 3, 'the run produced several sweeps to compare');
  assert(
    new Set(sweeps.map((e) => JSON.stringify(e.payload.idHex))).size === 1,
    'every sweep in a run carries the same tag list',
  );
  await sleep(320);
  assert(rfid.state.sendCount === sentWhileScanning, 'stopping the scan clears the interval');

  // --- failure is reported, not swallowed ---
  rfid.sender = async () => rejected;
  rfid.run('scan-once');
  await sleep(30);
  assert(rfid.events[0].name === 'RFID_SEND_FAILED', 'a rejected send produces RFID_SEND_FAILED');
  assert(rfid.events[0].tone === 'error', 'a rejected send is logged as an error');
  assert(rfid.events[0].summary?.includes('422'), 'the summary carries the rejection status');
  assert(rfid.state.failCount === 1, 'a rejected send counts as failed');
  assert(rfid.state.lastResponse?.message === 'rr_type is required', "the server's own message is kept");

  rfid.sender = async () => blocked;
  rfid.run('scan-once');
  await sleep(30);
  assert(rfid.events[0].name === 'RFID_SEND_FAILED', 'a blocked request also fails loudly');
  assert(rfid.state.lastResponse?.error?.includes('blocked'), 'a blocked request explains itself');
  assert(rfid.state.lastResponse?.status === 0, 'a blocked request has no status code');
  assert(
    rfid.events[0].transport!.detail.includes('--- no response ---'),
    'the frame says plainly that no response arrived',
  );

  // A slow endpoint must not stack requests behind a fast interval.
  let release: (() => void) | null = null;
  rfid.sender = () =>
    new Promise<TransportResponse>((resolve) => {
      release = () => resolve(accepted);
    });
  rfid.run('scan-once');
  await sleep(10);
  const skippedBefore = rfid.state.skipped;
  rfid.run('scan-once');
  await sleep(10);
  assert(rfid.state.skipped === skippedBefore + 1, 'a second sweep is skipped while one is still in flight');
  release!();
  await sleep(20);
  rfid.sender = async () => accepted;

  const framed = withResponse(httpPost('http://x.test/y', { a: 1 }), rejected);
  assert(framed.summary.includes('422 Unprocessable Entity'), 'a framed response states its status');
  assert(framed.response?.ok === false, 'a framed response keeps its verdict');

  // --- controls report their own condition ---
  assert(rfid.actionState('start-scan').disabled !== true, 'Start Scan is available while idle');
  assert(rfid.actionState('start-scan').active !== true, 'Start Scan does not look running while idle');
  assert(rfid.actionState('stop-scan').disabled === true, 'Stop Scan is dead while idle');
  rfid.run('start-scan');
  assert(rfid.actionState('start-scan').active === true, 'Start Scan reads as running while scanning');
  assert(rfid.actionState('start-scan').disabled === true, 'Start Scan cannot be pressed twice');
  assert(rfid.actionState('stop-scan').disabled !== true, 'Stop Scan becomes available while scanning');
  rfid.run('stop-scan');
  assert(rfid.actionState('start-scan').active !== true, 'Start Scan stops reading as running after Stop');
  assert(rfid.actionState('stop-scan').disabled === true, 'Stop Scan goes dead again after stopping');
  await sleep(30);

  rfid.run('reset');
  assert(rfid.state.sendCount === 0 && !rfid.state.scanning, 'reset clears device state');
  assert(rfid.state.okCount === 0 && rfid.state.failCount === 0, 'reset clears the delivery counters');
  assert(rfid.cfg('maker_name') === 'check', 'reset keeps the applied configuration');
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

  nut.run('force-ok');
  assert(nut.actionState('start-tightening').active === true, 'Start Tightening reads as running mid-cycle');
  assert(nut.actionState('force-ng').disabled === true, 'a second cycle cannot be started mid-cycle');
  await sleep(1800);
  assert(nut.actionState('start-tightening').active !== true, 'the control clears when the cycle ends');

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
  const parked = spinner.state.sendCount;
  await sleep(450);
  assert(spinner.state.sendCount === parked, 'clearTimers stops every device timer');

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
