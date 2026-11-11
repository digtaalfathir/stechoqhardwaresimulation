/**
 * Engine self-check: `npm run check`.
 *
 * Covers the logic the UI cannot: config validation, the state machines, event
 * envelopes and timer cleanup. Runs headless — the engine has no DOM deps.
 */
import { simulators, getSimulator, plannedSimulators, CATEGORIES } from './registry';
import { ANTENNA, BENCH, RfidHandheldSimulator, quality } from './rfid/rfid-handheld';
import type { MasterFetch } from './rfid/master-data';
import { LOAD_SIZE, RfidReaderSimulator } from './rfid/rfid-reader';
import { NutrunnerSimulator } from './nutrunner/nutrunner';
import { DigitalIoSimulator } from './digital-io/digital-io';
import { McPlcSimulator, parseRegister } from './plc/mc-plc';
import { httpPost, randomEpc, withResponse } from './core/wire';
import { MID_0061_FIELDS, NUL, describe, telegram, numField } from './nutrunner/open-protocol';
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

/** Master data as a host would serve it, without a host. */
const MASTER: MasterFetch = {
  ok: true,
  data: {
    rrTypes: ['T1B', 'T1R', 'SP3'],
    factories: [
      { id: 200, code: '5022', name: 'DENSO INDONESIA' },
      { id: 234, code: '721B', name: 'KUO' },
    ],
  },
  reports: [],
};

/** Every handheld in this check reads master data from the fixture, not the network. */
function offline(sim: RfidHandheldSimulator, fetchMaster: () => Promise<MasterFetch> = async () => MASTER) {
  sim.fetchMaster = fetchMaster;
  return sim;
}

async function main() {
  // --- registry contract ---
  assert(simulators.length === 5, 'registry exposes the live devices');
  assert(
    simulators.map((s) => s.meta.id).join(',') === 'rfid-handheld,rfid-reader,nutrunner,digital-io,plc',
    'the live devices are the two readers, the nutrunner, the I/O block and the PLC',
  );
  assert(
    !plannedSimulators.some((p) => p.id === 'digital-io' || p.id === 'plc'),
    'a live device is no longer listed as planned',
  );
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

  // --- nothing runs before the configuration is applied ---
  for (const Device of [RfidHandheldSimulator, RfidReaderSimulator, NutrunnerSimulator, DigitalIoSimulator]) {
    const fresh = new Device();
    if (fresh instanceof RfidHandheldSimulator) offline(fresh);
    assert(fresh.status === 'OFFLINE', `${fresh.meta.id} starts offline`);
    const action = fresh.actions.find((a) => a.id !== 'reset')!;
    fresh.run(action.id);
    assert(fresh.status === 'OFFLINE', `${fresh.meta.id} stays offline when an action is attempted`);
    assert(fresh.events[0].name === 'DEVICE_OFFLINE', `${fresh.meta.id} says why the action was ignored`);
    assert(fresh.events.length === 1, `${fresh.meta.id} runs nothing else while offline`);
    fresh.applyConfig({});
    assert(fresh.status === 'CONNECTED', `${fresh.meta.id} comes online once configured`);
    fresh.clearTimers();
  }
  const offlineDio = new DigitalIoSimulator();
  offlineDio.toggle('DI', 0);
  assert(!offlineDio.state.inputs[0], 'an offline I/O channel cannot be toggled from the grid');
  assert(offlineDio.transmission.sent === 0, 'and it sends nothing');

  // --- config validation is the trust boundary ---
  const rfid = offline(new RfidHandheldSimulator());
  let lastSentTo = '';
  let lastSentBody: unknown = null;
  rfid.sender = async (url, body) => {
    lastSentTo = url;
    lastSentBody = body;
    return accepted;
  };
  rfid.applyConfig({
    power: '999',
    antenna: '9',
    initial_year: '1999',
    mode: 'nonsense',
    rr_type: 'T1B',
    opname: false,
    baseUrl: 'https://my-own-host.test',
    reader_id: 'HACKED-READER',
  });
  assert(rfid.cfg('reader_id') === 'SIMULATOR-01', 'a read-only field ignores even a direct patch');
  assert(rfid.num('power') === 300, 'power clamps to the Zebra maximum of 300');
  assert(rfid.cfg('antenna') === '1', 'an antenna outside 1-8 is rejected');
  assert(rfid.cfg('initial_year') === '2026', 'a year outside the option list is rejected');
  assert(rfid.cfg('mode') === 'wo', 'a switch value outside its two options is rejected');
  assert(rfid.cfg('rr_type') === 'T1B', 'valid values are applied');
  rfid.applyConfig({ rr_type: 'NOT-IN-LIST' });
  assert(rfid.cfg('rr_type') === 'NOT-IN-LIST', 'RR type is a combo: values outside the list are allowed');
  rfid.applyConfig({ rr_type: 'T1B' });
  assert(rfid.bool('opname') === false, 'a checkbox stores a real boolean');
  assert(rfid.cfg('baseUrl') === 'https://my-own-host.test', 'a combo accepts a host outside its option list');
  rfid.applyConfig({ power: 'not-a-number' });
  assert(rfid.num('power') === 300, 'unparseable numbers leave the previous value intact');
  assert(rfid.status === 'CONNECTED', 'applying configuration brings the device online');

  // --- hold the trigger, release to send ---
  rfid.applyConfig({
    baseUrl: 'https://wms.suite.stechoq-j.com',
    endpoint: '/api/v1/warehouse-management/jmp/log-rfids/components/handheld',
    antenna: '3',
    initial_year: '2027',
    mode: 'register',
    opname: true,
    maker_name: 'check',
    factory_code: '5022',
    power: 200,
  });
  assert(
    rfid.url() === 'https://wms.suite.stechoq-j.com/api/v1/warehouse-management/jmp/log-rfids/components/handheld',
    `base url and endpoint join into one target (got ${rfid.url()})`,
  );

  const near = { x: ANTENNA.x + 80, y: ANTENNA.y };
  const mid = { x: ANTENNA.x + 150, y: ANTENNA.y + 40 };
  const far = { x: BENCH.width - 70, y: BENCH.height - 40 };
  rfid.clearBench();
  assert(rfid.addBenchTag('aaaa', near) === 'AAAA', 'a placed EPC is upper-cased');
  rfid.addBenchTag('BBBB', mid);
  rfid.addBenchTag('CCCC', far);
  assert(rfid.addBenchTag('AAAA') === null, 'the same tag cannot lie on the bench twice');
  assert(rfid.addBenchTag('not hex!') === null, 'an EPC must be hex');
  const tagAt = (epc: string) => rfid.state.bench.find((t) => t.epc === epc)!;
  assert(rfid.inRange(tagAt('AAAA')) && rfid.inRange(tagAt('BBBB')), 'near and mid tags are within range');
  assert(!rfid.inRange(tagAt('CCCC')), 'a far tag is out of range');

  rfid.pressTrigger();
  assert(rfid.state.scanning && rfid.status === 'SIMULATING', 'holding the trigger scans');
  await sleep(600);
  const held = rfid.state.session;
  assert(
    JSON.stringify(held.map((t) => t.epc).sort()) === JSON.stringify(['AAAA', 'BBBB']),
    `only tags in range are read (got ${held.map((t) => t.epc)})`,
  );
  assert(held.every((t) => t.reads > 1 && t.isNew), 'tags are read again and again, and are BARU');
  assert(held.find((t) => t.epc === 'AAAA')!.rssi > held.find((t) => t.epc === 'BBBB')!.rssi, 'a nearer tag answers stronger');
  assert(rfid.transmission.sent === 0, 'nothing is sent while the trigger is held');
  rfid.releaseTrigger();
  await sleep(30);
  assert(!rfid.state.scanning && rfid.status === 'CONNECTED', 'releasing the trigger stops the scan');
  assert(rfid.transmission.sent === 1, 'releasing sends exactly once');
  assert(rfid.state.send === 'sent' && rfid.state.failure === null, 'a delivered send reads as Terkirim');
  assert(lastSentTo === rfid.url(), 'the request goes to the joined base URL + endpoint');
  const scan = rfid.events.find((e) => e.name === 'RFID_SENT')!;
  const body = scan.payload;
  assert(body === lastSentBody, 'the body handed to the transport is the payload itself');
  assert(
    JSON.stringify([...(body.idHex as string[])].sort()) === JSON.stringify(['AAAA', 'BBBB']),
    'the batch carries each unique tag once',
  );
  assert(body.reader_id === 'SIMULATOR-01', 'the reader id is fixed to SIMULATOR-01');
  assert(body.antenna === '3' && body.initial_year === '2027', 'configured fields reach the payload');
  assert(body.mode === 'register' && body.opname === true, 'mode and opname reach the payload');
  assert(body.maker_name === 'check' && body.factory_code === '5022', 'free-text fields reach the payload');
  assert(!Number.isNaN(Date.parse(String(body.timestamp))), 'the payload timestamp is ISO-8601');
  assert(
    JSON.stringify(Object.keys(body)) ===
      JSON.stringify(['rr_type', 'maker_name', 'idHex', 'initial_year', 'reader_id', 'antenna', 'timestamp', 'opname', 'mode', 'factory_code']),
    'the payload carries exactly the agreed keys',
  );
  assert(scan.transport?.protocol === 'REST' && scan.transport.live === true, 'the send is a live REST frame');
  assert(scan.transport!.response?.status === 201, 'the frame carries the response status');
  assert(scan.transport!.detail.includes('log saved'), 'the frame shows the response message');
  assert(
    scan.transport!.detail.includes('POST /api/v1/warehouse-management/jmp/log-rfids/components/handheld'),
    'the frame posts to the configured endpoint path',
  );
  assert(rfid.events.some((e) => e.name === 'TRIGGER_RELEASED'), 'the release is logged');
  assert(rfid.state.log[0].ok && rfid.state.log[0].count === 2, 'the send lands in Riwayat Log');

  assert(quality({ reads: 339, rssi: -50 }) === 'strong', 'R:339 near the reader is Kuat');
  assert(quality({ reads: 36, rssi: -62 }) === 'medium', 'R:36 at a middling signal is Sedang');
  assert(quality({ reads: 3, rssi: -45 }) === 'weak', 'R:3 is Lemah however strong the signal');

  // Power is the range: at 0 nothing answers, and an empty scan sends nothing.
  rfid.applyConfig({ power: 0 });
  assert(rfid.range() === 0 && !rfid.inRange(tagAt('AAAA')), 'power 0 reaches nothing');
  rfid.pressTrigger();
  await sleep(250);
  rfid.releaseTrigger();
  await sleep(20);
  assert(rfid.state.session.length === 0, 'the trigger with tags on screen starts a new scan (Scan Baru)');
  assert(rfid.transmission.sent === 1, 'a scan that read nothing sends nothing');
  rfid.applyConfig({ power: 300 });
  assert(rfid.inRange({ epc: 'X', x: BENCH.width - 5, y: ANTENNA.y }), 'full power reaches the far end of the bench');
  assert(!rfid.inRange({ epc: 'X', x: ANTENNA.x + 75, y: ANTENNA.y - 150 }), 'a tag above the beam is not read, however near');
  rfid.setBenchWidth(900);
  assert(rfid.inRange({ epc: 'X', x: 895, y: ANTENNA.y }), 'a wider bench is still reached end to end at full power');
  rfid.setBenchWidth(BENCH.width);
  assert(rfid.state.bench.every((t) => t.x <= BENCH.width - 70), 'narrowing the bench pulls tags back onto it');
  rfid.applyConfig({ power: 200 });
  rfid.setPowerPreview(50);
  assert(!rfid.inRange(tagAt('BBBB'), rfid.state.powerPreview!) && rfid.inRange(tagAt('BBBB')), 'a previewed power is drawn, not used to read');
  rfid.setPowerPreview(null);

  // Lanjutkan keeps what is on screen, and those tags become LAMA.
  rfid.pressTrigger();
  await sleep(250);
  rfid.releaseTrigger();
  await sleep(20);
  const readsBefore = rfid.detected();
  rfid.continueScan();
  assert(rfid.state.session.every((t) => !t.isNew), 'Lanjutkan marks the earlier tags LAMA');
  await sleep(250);
  rfid.stopButton();
  await sleep(20);
  assert(rfid.detected() > readsBefore, 'Lanjutkan keeps counting on top of the earlier reads');
  assert(rfid.state.send === 'sent', 'Stop sends, like releasing the trigger');

  // --- a failed send keeps the tags, and asks before throwing them away ---
  rfid.sender = async () => rejected;
  rfid.newScan();
  await sleep(250);
  rfid.stopButton();
  await sleep(30);
  assert(rfid.state.send === 'failed' && rfid.unsent(), 'a rejected send leaves the tags unsent');
  assert(rfid.state.failure?.status === 422, 'the failure keeps the HTTP status');
  assert(rfid.state.failure?.message === 'rr_type is required', "and the server's own message");
  assert(rfid.events[0].name === 'RFID_SEND_FAILED' && rfid.events[0].tone === 'error', 'the failure is logged as an error');
  const unsentCount = rfid.state.session.length;

  rfid.pressTrigger();
  assert(rfid.state.prompt === 'trigger' && !rfid.state.scanning, 'the trigger asks first instead of dropping unsent tags');
  rfid.answerPrompt('cancel');
  assert(rfid.state.prompt === null && rfid.state.session.length === unsentCount, 'Batal changes nothing');
  rfid.pressTrigger();
  rfid.answerPrompt('discard');
  assert(rfid.state.session.length === 0 && !rfid.state.scanning, 'from the trigger, Buang only empties the list');

  rfid.pressTrigger();
  await sleep(200);
  rfid.releaseTrigger();
  await sleep(30);
  rfid.newScan();
  assert(rfid.state.prompt === 'button', 'Scan Baru asks too');
  rfid.sender = async () => accepted;
  rfid.answerPrompt('send');
  await sleep(30);
  assert(rfid.state.send === 'sent' && rfid.state.session.length > 0, 'Kirim dulu resends and keeps the list');

  rfid.sender = async () => rejected;
  rfid.pressTrigger();
  await sleep(200);
  rfid.releaseTrigger();
  await sleep(30);
  rfid.newScan();
  rfid.sender = async () => accepted;
  rfid.answerPrompt('discard');
  assert(rfid.state.scanning, 'from Scan Baru, Buang & scan baru starts scanning at once');
  rfid.stopButton();
  await sleep(30);

  // Kirim Ulang sends the same tags again.
  rfid.sender = async () => blocked;
  rfid.newScan();
  await sleep(200);
  rfid.stopButton();
  await sleep(30);
  assert(rfid.state.failure?.status === 0, 'an unreachable server has no status');
  assert(rfid.transmission.lastResponse?.error?.includes('blocked'), 'and explains itself');
  assert(rfid.events[0].transport!.detail.includes('--- no response ---'), 'the frame says no response arrived');
  rfid.sender = async () => accepted;
  const unsentTags = rfid.tags().join();
  assert(await rfid.send(), 'Kirim Ulang goes through once the server answers');
  assert(rfid.tags().join() === unsentTags && rfid.state.send === 'sent', 'the same tags were sent');

  // While a send is in flight the trigger is ignored until the result is in.
  let finish: (() => void) | null = null;
  rfid.sender = () =>
    new Promise<TransportResponse>((resolve) => {
      finish = () => resolve(accepted);
    });
  rfid.pressTrigger();
  await sleep(150);
  rfid.releaseTrigger();
  await sleep(10);
  assert(rfid.state.send === 'sending', 'the send is in flight');
  rfid.pressTrigger();
  assert(!rfid.state.scanning && !rfid.canStart(), 'the trigger is ignored while sending');
  finish!();
  await sleep(20);
  assert(rfid.state.send === 'sent', 'and works again once the result is in');
  rfid.sender = async (url, b) => {
    lastSentTo = url;
    lastSentBody = b;
    return accepted;
  };

  // --- Riwayat Log ---
  const failedEntry = rfid.state.log.find((e) => !e.ok)!;
  assert(failedEntry && rfid.canResend(failedEntry), 'a failed scan can be resent from the log');
  assert(await rfid.resendLog(failedEntry.id), 'the resend goes through');
  assert(lastSentTo === failedEntry.url, 'a resend goes to the original address');
  assert(lastSentBody === failedEntry.payload, 'with the original data, unchanged');
  assert(rfid.state.log[0].resentFrom === failedEntry.at, 'and is logged as a resend of that entry');
  for (let i = 0; i < 32; i++) await rfid.send();
  assert(rfid.state.log.length === 30, 'the log keeps the last 30 attempts');

  // --- controls report their own condition ---
  assert(rfid.actionState('pull-trigger').disabled !== true, 'Pull Trigger is available while idle');
  rfid.pressTrigger();
  assert(rfid.actionState('pull-trigger').active === true, 'Pull Trigger reads as running while held');
  rfid.releaseTrigger();
  await sleep(30);

  const logBefore = rfid.state.log.length;
  rfid.run('reset');
  assert(rfid.transmission.sent === 0 && rfid.state.session.length === 0, 'reset clears the session and counters');
  assert(rfid.state.log.length === logBefore, 'reset keeps Riwayat Log: it is diagnostics, not settings');
  assert(rfid.state.bench.length === 3, 'reset keeps the tags on the bench');
  assert(rfid.cfg('maker_name') === 'check', 'reset keeps the applied configuration');
  assert(rfid.events[0].name === 'DEVICE_RESET', 'reset is logged');

  // --- master data drives the dropdowns ---
  const master = new RfidHandheldSimulator();
  let fetches: string[] = [];
  master.fetchMaster = async (base) => {
    fetches.push(base);
    return MASTER;
  };
  const rrField = () => master.configFields.find((f) => f.key === 'rr_type')!;
  const facField = () => master.configFields.find((f) => f.key === 'factory_code')!;

  assert(master.cfg('maker_name') === 'Stechoq', 'Maker Name has a default');
  await master.ensureMasterData();
  assert(fetches.length === 1, 'opening the workspace reads the master data once');
  assert(master.cfg('rr_type') === 'T1B' && master.cfg('factory_code') === '5022', 'an empty RR Type and Factory Code take the first host values');
  assert(master.state.master === 'ready', 'the device reports the lists as ready');
  assert(
    JSON.stringify(rrField().options) === JSON.stringify(['T1B', 'T1R', 'SP3']),
    'the RR type dropdown holds the host values, not the hardcoded list',
  );
  assert(
    JSON.stringify(facField().options) === JSON.stringify(['5022', '721B']),
    'the factory dropdown holds the codes',
  );
  assert(
    facField().optionLabels?.['5022'] === '5022 · DENSO INDONESIA',
    'a factory shows its name but stores its code',
  );

  // The same host is not read again and again.
  await master.ensureMasterData();
  assert(fetches.length === 1, 'the same base URL is not fetched twice');
  master.applyConfig({ antenna: '2' });
  await sleep(10);
  assert(fetches.length === 1, 'applying an unrelated change does not refetch');

  // A different host holds different master data, so it is read again.
  master.applyConfig({ baseUrl: 'https://product.suite.stechoq-j.com' });
  await sleep(10);
  assert(fetches.length === 2, 'changing the base URL reloads the lists');
  assert(fetches[1] === 'https://product.suite.stechoq-j.com', 'and reads from the new host');
  await master.ensureMasterData(true);
  assert(fetches.length === 3, 'a retry forces a reload');
  master.applyConfig({ factory_code: '721B' });
  await master.ensureMasterData(true);
  assert(master.cfg('factory_code') === '721B', 'a value already picked is never replaced by the default');

  // A failed read keeps whatever is usable and says what happened.
  const broken = new RfidHandheldSimulator();
  broken.fetchMaster = async () => ({
    ok: false,
    data: { rrTypes: [], factories: [] },
    reports: [
      {
        name: 'RR types',
        url: 'https://host.test/rr',
        ok: false,
        count: 0,
        status: 0,
        durationMs: 4,
        error: 'Could not reach host.test',
      },
    ],
    error: 'Could not reach host.test',
  });
  await broken.ensureMasterData();
  assert(broken.state.master === 'failed', 'a failed read is reported as failed');
  assert(broken.state.masterError?.includes('host.test'), 'and keeps the reason');
  assert(broken.events[0].name === 'MASTER_DATA_FAILED', 'the failure reaches the event log');
  assert(broken.events[0].transport?.summary.startsWith('GET '), 'the read shows up as a GET in the log');
  assert(
    broken.configFields.find((f) => f.key === 'rr_type')!.options!.length > 0,
    'the built-in RR types stay as a fallback when the host cannot be read',
  );

  // A failed refresh must not leave options on screen whose ids are gone.
  master.fetchMaster = async () => ({
    ok: false,
    data: { rrTypes: [], factories: [] },
    reports: [],
    error: 'host went away',
  });
  await master.ensureMasterData(true);
  assert(master.state.master === 'failed', 'the refresh failed');
  assert(facField().options!.length === 2, 'the previous factory options are still on screen');
  assert(master.factories().length === 2, 'and they are still usable, not just painted');
  master.applyConfig({ factory_code: '5022' });
  assert(master.factoryId() === 200, 'a factory picked from the stale list still resolves to its id');
  broken.clearTimers();
  master.clearTimers();

  // --- handheld replacement mode ---
  const repl = offline(new RfidHandheldSimulator());
  let replUrl = '';
  let replBody: Record<string, unknown> = {};
  repl.sender = async (url, body) => {
    replUrl = url;
    replBody = body as Record<string, unknown>;
    return accepted;
  };
  repl.applyConfig({ baseUrl: 'http://localhost:8000', mode: 'wo', replacement: true, opname: false });
  await sleep(10);
  assert(repl.state.master === 'ready', 'applying the configuration loads the master data');
  assert(repl.factories().length === 2, 'the factory list came from the host');
  assert(!repl.replacementActive(), 'replacement stays off outside register mode');
  assert(repl.bool('opname') === true, 'the replacement flag forces opname on even from a direct patch');

  repl.applyConfig({ mode: 'register', replacement: true, factory_code: '5022' });
  assert(repl.replacementActive(), 'register mode turns replacement on');
  assert(repl.factoryId() === 200, 'factory_id is the id from master data, not the code itself');
  assert(repl.selectedFactory()?.name === 'DENSO INDONESIA', 'the selected factory carries its name');
  assert(
    !repl.configFields.some((f) => f.key === 'factoryId' || f.key === 'replaceEndpoint'),
    'the replace endpoint and factory id are not configuration fields',
  );
  assert(
    repl.replaceUrl() === 'http://localhost:8000/api/v1/master/register-rfids/replace',
    `the replace endpoint joins onto the base URL (got ${repl.replaceUrl()})`,
  );

  // The first tag read stops the scan at once and asks for the old tag.
  repl.clearBench();
  repl.addBenchTag('E28068940000000000000703', { x: ANTENNA.x + 80, y: ANTENNA.y });
  repl.addBenchTag('E28068940000000000000704', { x: ANTENNA.x + 90, y: ANTENNA.y + 30 });
  const beforeOpen = repl.transmission.sent;
  repl.pressTrigger();
  await sleep(300);
  assert(repl.state.replacementOpen, 'a tag read in replacement mode opens the form');
  assert(!repl.state.scanning, 'the scanner stops when the form opens');
  assert(repl.state.session.length === 1, 'only the first tag is kept, not a bulk scan');
  assert(repl.newTag() === repl.state.session[0].epc, 'that tag is the new RFID');
  assert(repl.transmission.sent === beforeOpen, 'nothing is sent before the form is filled in');
  assert(repl.events[0].name === 'REPLACEMENT_SCANNED', 'the scan is logged as a replacement capture');
  repl.releaseTrigger();
  assert(repl.transmission.sent === beforeOpen, 'releasing the trigger does not send a scan batch');
  assert(!repl.canStart(), 'the trigger is ignored while the form is open');
  const newTag = repl.newTag();

  // An incomplete form is refused, not posted half-filled.
  assert((await repl.submitReplacement('', 'Tag damaged')) === false, 'an empty old tag is refused');
  assert(repl.events[0].name === 'REPLACEMENT_INCOMPLETE', 'the refusal says what is missing');
  assert(repl.events[0].payload.problem === 'no-old-tag', 'the refusal names the missing piece');
  assert(repl.transmission.sent === beforeOpen, 'a refused form sends nothing');
  assert(repl.replacementProblem('OLD', 'Tag damaged') === null, 'a complete form reports no problem');

  // A factory the host does not know has no id, so it cannot be posted.
  repl.applyConfig({ factory_code: 'NOT-IN-MASTER' });
  assert(repl.replacementProblem('OLD', 'Tag damaged') === 'unknown-factory', 'a factory outside the master data blocks it');
  assert(Number.isNaN(repl.factoryId()), 'and it has no id to guess at');
  assert((await repl.submitReplacement('OLD', 'Tag damaged')) === false, 'and it is refused, not sent as null');
  repl.applyConfig({ factory_code: '' });
  assert(repl.replacementProblem('OLD', 'Tag damaged') === 'no-factory', 'an empty factory blocks it too');
  repl.applyConfig({ factory_code: '5022' });

  // The real thing.
  assert(await repl.submitReplacement('  E2806894000050367572D095  ', 'Tag damaged'), 'a complete form is sent');
  assert(replUrl === repl.replaceUrl(), 'the replacement goes to the replace endpoint, not the scan endpoint');
  assert(
    JSON.stringify(Object.keys(replBody)) ===
      JSON.stringify(['old_rfid_number', 'new_rfid_number', 'replacement_remark', 'factory_id', 'opname']),
    `the replacement body carries exactly the agreed keys (got ${Object.keys(replBody)})`,
  );
  assert(replBody.old_rfid_number === 'E2806894000050367572D095', 'the old tag is trimmed');
  assert(replBody.new_rfid_number === newTag, 'the new tag is the scanned one');
  assert(replBody.replacement_remark === 'Tag damaged', 'the reason reaches the body');
  assert(replBody.factory_id === 200 && typeof replBody.factory_id === 'number', 'factory_id is the numeric id');
  assert(replBody.opname === true, 'opname rides along as a boolean');
  assert(repl.events[0].name === 'REPLACEMENT_SENT', 'a delivered replacement is logged as such');
  assert(!repl.state.replacementOpen && repl.state.session.length === 0, 'success closes the form and clears the list');
  assert(repl.state.log[0].kind === 'replacement' && repl.state.log[0].ok, 'the replacement lands in Riwayat Log');
  assert(!repl.canResend(repl.state.log[0]), 'a replacement that went through cannot be resent');

  // A rejected replacement keeps the form open so it can be retried without scanning again.
  repl.sender = async () => rejected;
  repl.pressTrigger();
  await sleep(300);
  assert(repl.state.replacementOpen, 'the form opens again on the next trigger pull');
  assert((await repl.submitReplacement('OLD-TAG', 'Tag unreadable')) === false, 'a rejected replacement reports failure');
  assert(repl.state.replacementOpen, 'a rejected replacement keeps the form open');
  assert(repl.state.replacementFailure?.status === 422, 'with the rejection to show');
  assert(repl.events[0].name === 'REPLACEMENT_FAILED', 'the rejection is logged');
  assert(repl.canResend(repl.state.log[0]), 'a failed replacement can be resent from the log');
  repl.closeReplacement();
  assert(!repl.state.replacementOpen && repl.state.session.length === 0, 'Batal closes the form and drops the tag');
  assert(repl.events[0].name === 'REPLACEMENT_CANCELLED', 'cancelling says nothing was sent');

  // Back in wo mode the handheld scans in bulk again.
  repl.sender = async () => accepted;
  repl.applyConfig({ mode: 'wo', replacement: false });
  const sweepBefore = repl.transmission.sent;
  repl.pressTrigger();
  await sleep(250);
  repl.releaseTrigger();
  await sleep(30);
  assert(repl.state.session.length === 2, 'a normal scan reads every tag in range');
  assert(repl.transmission.sent === sweepBefore + 1, 'and sends them once');
  assert(repl.events[0].name === 'RFID_SENT', 'a normal scan is still an RFID_SENT');
  assert(!repl.state.replacementOpen, 'no form appears outside replacement mode');
  repl.clearTimers();

  // --- rfid gate: a forklift drives a stack of RR through ---
  const gate = new RfidReaderSimulator();
  const batches: string[][] = [];
  gate.sender = async (_url, body) => {
    batches.push([...(body as { idHex: string[] }).idHex]);
    return accepted;
  };
  assert(gate.configFields.find((f) => f.key === 'interval')?.default === 7000, 'the gate defaults to a 7s interval');
  assert(
    gate.actions.map((a) => a.id).join(',') === 'pass,stop-pass,reset',
    'the gate offers a pass, stop and reset only',
  );
  assert(gate.tags().length === LOAD_SIZE, 'the default load is one full forklift');

  const gateTags = Array.from({ length: LOAD_SIZE }, (_, i) => `E2806894000040000000${String(i).padStart(4, '0')}`);
  gate.applyConfig({ baseUrl: 'https://wms.suite.stechoq-j.com', antenna: '4', interval: 500 });
  gate.setTagsText(gateTags.join('\n'));
  assert(batches.length === 0, 'an idle gate reports nothing: nothing is in the field');

  gate.run('pass');
  const pass = gate.state.pass!;
  assert(pass && gate.state.scanning && gate.status === 'SIMULATING', 'driving through starts a pass');
  assert(pass.sweepsPlanned >= 2 && pass.sweepsPlanned <= 4, `a pass plans 2-4 reports (got ${pass.sweepsPlanned})`);
  assert(pass.startedAt < pass.enterAt && pass.enterAt <= pass.leaveAt && pass.leaveAt < pass.endAt, 'in, through, out — in order');
  assert(gate.events[0].name === 'FORKLIFT_ENTERING', 'the forklift is announced');
  assert(gate.actionState('pass').disabled === true, 'a second forklift cannot drive in mid-pass');
  await sleep(100);
  assert(batches.length === 0, 'nothing is reported before the load reaches the antennas');

  // The load is fixed when the forklift sets off.
  gate.setTagsText([...gateTags, 'E28068940000400000009999'].join('\n'));
  await sleep(280);
  assert(batches.length === 1, 'the first report goes out as the load enters the field');
  const first = batches[0];
  assert(first.length > 0 && first.length < gateTags.length, `the first report is partial (got ${first.length}/${gateTags.length})`);

  const firstEvent = gate.events.find((e) => e.name === 'RFID_SENT')!;
  assert(
    JSON.stringify(Object.keys(firstEvent.payload)) === JSON.stringify(['reader_id', 'antenna', 'idHex', 'timestamp']),
    'the gate payload carries exactly reader_id, antenna, idHex and timestamp',
  );
  assert(firstEvent.payload.reader_id === 'SIMULATOR-02', 'the gate identifies itself as SIMULATOR-02');
  assert(firstEvent.payload.antenna === '4', 'the one configured antenna reaches the payload');
  assert(firstEvent.summary?.includes('covered'), 'the summary reports coverage progress');
  assert(gate.state.sweeps[0].fresh.length === first.length, 'the timeline records the report');

  await sleep(pass.endAt - Date.now() + 150);
  assert(gate.state.pass === null && !gate.state.scanning && gate.status === 'CONNECTED', 'the forklift drives off and the pass ends');
  assert(gate.events.some((e) => e.name === 'FORKLIFT_LEFT'), 'the pass end is announced');
  assert(batches.length === pass.sweepsPlanned, `one report per planned interval (${batches.length}/${pass.sweepsPlanned})`);
  const seen = new Set(batches.flat());
  assert(seen.size === gateTags.length, `every RR was reported before the forklift left (${seen.size}/${gateTags.length})`);
  assert(!seen.has('E28068940000400000009999'), 'a tag added mid-pass rides the next forklift, not this one');
  assert(batches.every((b) => new Set(b).size === b.length), 'a single report never lists the same tag twice');
  const coveredAt = batches.findIndex((_, i) => new Set(batches.slice(0, i + 1).flat()).size === gateTags.length);
  assert(batches.slice(0, coveredAt).every((b) => b.length < gateTags.length), 'no report before the last dumps the whole load');
  const covered = gate.events.find((e) => e.name === 'TAG_LIST_COVERED');
  assert(covered && Number(covered.payload.sweeps) === pass.sweepsPlanned, 'full coverage lands on the last planned report');
  const sweeps = gate.state.sweeps;
  assert(sweeps.every((s) => s.ok === true && s.status === 201), 'each report keeps its response for the timeline');
  assert(
    sweeps.every((s) => s.again.every((t) => !s.fresh.includes(t))),
    'a report splits cleanly into new and repeated tags',
  );

  // Over several passes the new/old mix moves and tags are repeated, or it is not a gate.
  gate.setTagsText(gateTags.join('\n'));
  const mixes: string[] = [];
  let repeats = 0;
  for (let i = 0; i < 3; i++) {
    gate.run('pass');
    const p = gate.state.pass!;
    await sleep(p.endAt - Date.now() + 120);
    mixes.push(...gate.state.sweeps.map((s) => `${s.fresh.length}+${s.again.length}`));
    repeats += gate.state.sweeps.reduce((n, s) => n + s.again.length, 0);
  }
  assert(gate.state.passes === 4, 'passes are counted');
  assert(new Set(mixes).size > 1, `the new/old mix varies between reports (got ${mixes.join(' ')})`);
  assert(repeats > 0, 'tags are re-reported while still in the field');

  // Stop aborts the pass; an empty forklift goes nowhere.
  gate.run('pass');
  gate.run('stop-pass');
  assert(gate.state.pass === null && gate.events[0].name === 'PASS_STOPPED', 'Stop aborts the pass');
  const sentBeforeStop = batches.length;
  await sleep(700);
  assert(batches.length === sentBeforeStop, 'a stopped pass reports nothing more');
  gate.setTagsText('');
  gate.run('pass');
  assert(gate.state.pass === null && gate.events[0].name === 'SCAN_NO_TAG', 'an empty forklift does not drive');
  gate.randomLoad();
  assert(gate.tags().length === LOAD_SIZE && gate.tags().every((t) => /^E2806894[0-9A-F]{16}$/.test(t)), 'a random load is 18 fresh EPCs');
  gate.clearTimers();

  // --- open protocol telegram format ---
  // The length field counts the header and the data but not the NUL.
  const empty = telegram({ mid: 1 });
  assert(empty.endsWith(NUL), 'a telegram is NUL terminated');
  assert(empty.length === 21, `an empty telegram is 20 bytes + NUL (got ${empty.length})`);
  assert(empty.slice(0, 4) === '0020', `the declared length excludes the NUL (got ${empty.slice(0, 4)})`);
  assert(empty.slice(4, 8) === '0001', 'the MID is zero padded to four digits');
  assert(empty.slice(8, 11) === '001', 'the revision defaults to 001');
  const withData = telegram({ mid: 5 }, '0060');
  assert(withData.slice(0, 4) === '0024', 'the length grows with the data');
  assert(
    describe(telegram({ mid: 61 }, numField(1, 7, 4)), [{ no: '01', label: 'Cell ID', width: 4 }]).some((l) =>
      l.includes('0007'),
    ),
    'the annotated view reads the field back out of the bytes',
  );
  assert(
    describe('0021' + '0061' + '001' + '0' + '01' + '01' + '    ', []).some((l) => l.includes('MISMATCH')),
    'a wrong length is reported, not hidden',
  );

  // --- nutrunner over open protocol ---
  const nut = new NutrunnerSimulator();
  assert(
    JSON.stringify(nut.meta.protocols) === JSON.stringify(['Open Protocol']),
    'the nutrunner speaks Open Protocol only',
  );
  nut.applyConfig({
    targetTorque: 40,
    tolerance: 10,
    targetAngle: 100,
    angleTolerance: 20,
    cellId: 3,
    channelId: 2,
    controllerName: 'STECHOQ NTR-01',
    psetId: 7,
    batchSize: 2,
    vin: 'JMP2026000123',
  });

  // Applying the configuration opens the session.
  const opened = nut.events.find((e) => e.name === 'SESSION_OPENED');
  assert(opened, 'applying the configuration opens an Open Protocol session');
  assert(opened!.transport?.protocol === 'Open Protocol', 'the session frame is Open Protocol');
  const handshake = opened!.transport!.detail;
  for (const mid of ['0001', '0002', '0060', '0005']) {
    assert(handshake.includes(`mid       ${mid}`), `the handshake includes MID ${mid}`);
  }
  assert(handshake.includes('STECHOQ NTR-01'), 'MID 0002 carries the controller name');
  assert(!handshake.includes('MISMATCH'), 'every handshake telegram is self-consistent');
  assert(nut.session() === 'SUBSCRIBED', 'the session reads as subscribed while online');

  // A cycle that lands inside both limits.
  nut.run('force-ok');
  assert(nut.state.phase === 'TIGHTENING', 'the cycle enters TIGHTENING');
  assert(nut.status === 'SIMULATING', 'a running cycle reports SIMULATING');
  assert(nut.actionState('start-tightening').active === true, 'Start Tightening reads as running mid-cycle');
  assert(nut.actionState('force-ng').disabled === true, 'a second cycle cannot be started mid-cycle');
  await sleep(1800);
  assert(nut.state.phase === 'OK', `Force OK lands inside both limits (got ${nut.state.phase})`);
  assert(nut.actionState('start-tightening').active !== true, 'the control clears when the cycle ends');

  const okResult = nut.events.find((e) => e.name === 'TIGHTENING_RESULT');
  assert(okResult, 'the cycle reports a result');
  const r = okResult!.payload;
  assert(r.tightening_status === 'OK', 'the payload reports OK');
  assert(r.torque_status === 'OK' && r.angle_status === 'OK', 'both limit statuses are OK');
  assert(r.cell_id === 3 && r.channel_id === 2, 'the configured cell and channel reach the payload');
  assert(r.pset_id === 7 && r.vin === 'JMP2026000123', 'pset and VIN reach the payload');
  assert(Number(r.torque) >= Number(r.torque_min) && Number(r.torque) <= Number(r.torque_max), 'the OK torque is inside its limits');
  assert(nut.state.curve.length > 1, 'the cycle records a torque ramp for the visualisation');

  // The MID 0061 telegram itself.
  const resultFrame = okResult!.transport!;
  assert(resultFrame.protocol === 'Open Protocol', 'the result is framed as Open Protocol');
  assert(resultFrame.live !== true, 'the telegram is generated, never claimed as sent');
  const detail = resultFrame.detail;
  assert(detail.includes('mid       0061'), 'the result telegram is MID 0061');
  assert(detail.includes('mid       0062'), 'the client acknowledges with MID 0062');
  assert(!detail.includes('MISMATCH'), 'the MID 0061 length and every field line up');
  assert(!detail.includes('TRAILING BYTES'), 'MID 0061 has no unaccounted bytes');
  assert(detail.includes('Tightening status') && detail.includes('(OK)'), 'the annotated view decodes the status');
  const torqueCenti = String(Math.round(Number(r.torque) * 100)).padStart(6, '0');
  assert(detail.includes(`Torque                       ${torqueCenti}`), `torque is carried x100 (expected ${torqueCenti})`);
  assert(detail.includes('<NUL>'), 'the raw line shows the terminator');
  assert(detail.includes('  0000  30'), 'the hex dump starts at offset 0000');

  // MID 0061 revision 1 is 231 bytes: 20 header + 211 data.
  const raw = detail.split('\n').find((l) => l.trim().startsWith('0231'));
  assert(raw, `the MID 0061 telegram declares 231 bytes (lines: ${detail.split('\n').slice(0, 3).join(' | ')})`);
  assert(
    MID_0061_FIELDS.reduce((sum, f) => sum + 2 + f.width, 20) === 231,
    'the field table itself adds up to 231 bytes',
  );

  // NG breaks a limit, and the failing limit is named.
  nut.run('force-ng');
  await sleep(1800);
  assert(nut.state.phase === 'NG', `Force NG breaks a limit (got ${nut.state.phase})`);
  const ng = nut.events.find((e) => e.name === 'TIGHTENING_RESULT')!.payload;
  assert(ng.tightening_status === 'NG', 'the payload reports NG');
  assert(
    ng.torque_status !== 'OK' || ng.angle_status !== 'OK',
    'an NG names which limit failed',
  );
  assert(nut.state.cycle === 2 && nut.state.okCount === 1 && nut.state.ngCount === 1, 'cycle counters track results');
  assert(nut.state.tighteningId === 2, 'the tightening id increments for every reported fastening');

  // The batch counts OK fastenings and completes at the configured size.
  const beforeBatch = nut.state.batchCounter;
  nut.run('force-ok');
  await sleep(1800);
  assert(nut.state.batchCounter === beforeBatch + 1 || nut.state.batchCounter === 0, 'an OK fastening advances the batch');
  const completed = nut.events.find((e) => e.name === 'BATCH_COMPLETED');
  assert(completed, 'the batch completes at the configured size');
  assert(nut.state.batchCounter === 0, 'the batch counter rolls over once complete');

  // A tool alarm is a MID 0071 telegram, not a silent failure.
  nut.run('trigger-error');
  assert(nut.state.phase === 'ERROR' && nut.status === 'ERROR', 'a tool alarm puts the device in ERROR');
  const alarm = nut.events[0];
  assert(alarm.name === 'DEVICE_ERROR', 'the alarm is logged');
  assert(alarm.transport!.detail.includes('mid       0071'), 'the alarm is reported as MID 0071');
  assert(alarm.transport!.detail.includes('Tool ready status'), 'the alarm telegram carries the tool ready flag');
  assert(!alarm.transport!.detail.includes('MISMATCH'), 'the alarm telegram is self-consistent');
  assert(String(alarm.payload.error_code).startsWith('E'), 'the alarm carries a controller error code');

  nut.run('start-tightening');
  await sleep(1800);
  assert(nut.state.phase !== 'ERROR', 'the controller runs again after an alarm');
  nut.run('reset');
  assert(nut.state.phase === 'READY' && nut.status === 'CONNECTED', 'reset clears the alarm');
  assert(nut.state.batchCounter === 0 && nut.state.tighteningId === 0, 'reset clears the batch and the tightening id');
  nut.clearTimers();

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
  assert(change.transport!.live !== true, 'a Modbus frame is generated, never claimed as sent');
  assert(dio.transmission.sent === 0, 'Modbus puts nothing on the network');
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
  assert(dio.transmission.sent === 0, 'MQTT is generated too');

  // --- digital i/o over REST really sends ---
  const rest = new DigitalIoSimulator();
  const posted: { url: string; body: Record<string, unknown> }[] = [];
  rest.sender = async (url, body) => {
    posted.push({ url, body: body as Record<string, unknown> });
    return accepted;
  };
  rest.applyConfig({ channels: '4', transport: 'REST', endpoint: 'http://localhost:8123/api/io/state' });
  assert(rest.restMode(), 'REST transport is recognised');
  assert(
    rest.configFields.find((f) => f.key === 'endpoint')?.visibleWhen?.equals === 'REST',
    'the endpoint field only shows for REST',
  );

  rest.toggle('DO', 2);
  await sleep(30);
  assert(posted.length === 1, 'a toggle on REST is really sent');
  assert(posted[0].url === 'http://localhost:8123/api/io/state', 'it goes to the configured endpoint');
  assert(
    JSON.stringify(Object.keys(posted[0].body)) ===
      JSON.stringify(['device_id', 'channel', 'direction', 'from', 'to', 'value', 'timestamp']),
    `the change payload carries the agreed keys (got ${Object.keys(posted[0].body)})`,
  );
  assert(posted[0].body.channel === 'DO03' && posted[0].body.value === 1, 'the toggled channel reaches the body');
  assert(rest.events[0].name === 'DO_CHANGED', 'a delivered change keeps its own event name');
  assert(rest.events[0].summary?.includes('201 Created'), 'the summary carries the response');
  assert(rest.events[0].transport?.live === true, 'the frame is marked as really sent');
  assert(rest.transmission.delivered === 1 && rest.transmission.failed === 0, 'the counters follow the response');

  // Clicks must never be dropped, even while another request is in flight.
  let releaseIo: (() => void) | null = null;
  rest.sender = () =>
    new Promise((resolve) => {
      releaseIo = () => resolve(accepted);
    });
  rest.toggle('DI', 0);
  rest.toggle('DI', 1);
  await sleep(20);
  assert(rest.transmission.sent === 3, 'a second toggle is not coalesced away');
  assert(rest.transmission.skipped === 0, 'nothing was skipped');
  releaseIo!();
  await sleep(30);

  // A rejected change says so instead of looking like a success.
  rest.sender = async () => rejected;
  rest.toggle('DO', 0);
  await sleep(30);
  assert(rest.events[0].name === 'IO_SEND_FAILED', 'a rejected change is logged as a failure');
  assert(rest.transmission.failed === 1, 'the failure is counted');
  assert(rest.state.outputs[0] === true, 'the channel still moved — the module changed, the report did not land');

  rest.run('reset');
  assert(rest.transmission.sent === 0 && rest.transmission.failed === 0, 'reset clears the transmission record');
  rest.clearTimers();

  // --- shared engine behaviour ---
  const probe = new DigitalIoSimulator();
  probe.applyConfig({});
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

  const spinner = new RfidReaderSimulator();
  spinner.applyConfig({ interval: 500 });
  spinner.run('pass');
  spinner.clearTimers();
  const parked = spinner.transmission.sent;
  await sleep(450);
  assert(spinner.transmission.sent === parked, 'clearTimers stops every device timer');

  // --- plc: one session per browser, and it survives the session expiring ---
  assert(parseRegister(' d 11 ') === 'D11' && parseRegister('w1a') === 'W1A' && parseRegister('M5') === null, 'register addresses parse');
  let bridge = { session: 'B', mode: 'online', mcPort: 8213, mcHost: 'plc.example.test', clients: ['10.0.0.9:5000'],
    registers: <Record<string, unknown>>{ D11: { value: 3, reads: 1, writes: 0, lastRead: null, lastWrite: null } },
    seq: 1, log: [] as unknown[] };
  const sessionAsks: unknown[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      sessionAsks.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(bridge), { status: 201 });
    }
    return url.includes(`/sessions/${bridge.session}/`)
      ? new Response(JSON.stringify(bridge))
      : new Response('{"error":"session expired"}', { status: 404 });
  }) as typeof fetch;
  const pushed: { url: string; body: unknown }[] = [];
  const plc = new McPlcSimulator();
  plc.sender = async (url, body) => (pushed.push({ url, body }), accepted);
  plc.applyConfig({});
  await sleep(50);
  assert(sessionAsks.length === 1 && plc.endpoint() === 'plc.example.test:8213', 'opening the workspace opens a session and shows its endpoint');
  assert(plc.state.registers.D11?.value === 3 && plc.status === 'SIMULATING', 'the view adopts the session memory');
  bridge = { ...bridge, seq: 2, log: [{ seq: 2, at: '', op: 'read', client: '10.0.0.9:5000', device: 'D11', count: 1, values: [3], end: 0, req: '50 00', res: 'D0 00' }] };
  await sleep(600);
  assert(plc.events.some((e) => e.name === 'MC_READ' && e.transport?.live), 'a client read becomes a live MC event');
  plc.setRegister('D61', 70000);
  const last = () => pushed[pushed.length - 1];
  assert(plc.state.registers.D61.value === 4464 && JSON.stringify(last().body) === '{"D61":4464}', 'edits wrap to int16 and are pushed');
  assert(last().url.endsWith('/sessions/B/registers'), 'edits go to this browser\'s own session');
  bridge = { ...bridge, session: 'C', registers: {}, seq: 0, log: [] }; // B expired
  await sleep(1300);
  assert(JSON.stringify(sessionAsks[sessionAsks.length - 1]) === '{"port":8213}', 'a lost session asks for its old port back');
  assert(JSON.stringify(last().body) === '{"D11":3,"D61":4464}', 'a new session gets the registers back');
  plc.clearTimers();
  globalThis.fetch = realFetch;

  // --- wire builders ---
  const framed = withResponse(httpPost('http://x.test/y', { a: 1 }), rejected);
  assert(framed.summary.includes('422 Unprocessable Entity'), 'a framed response states its status');
  assert(framed.response?.ok === false, 'a framed response keeps its verdict');
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
