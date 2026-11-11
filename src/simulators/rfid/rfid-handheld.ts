import type { ActionDef, ActionState, ConfigField, SimulatorMeta } from '../core/types';
import { httpGet, randomEpc } from '../core/wire';
import {
  factoryLabels,
  fetchMasterData,
  masterUrls,
  type Factory,
  type MasterData,
  type MasterFetch,
} from './master-data';
import { BASE_URLS, TagReader, type TagReaderState } from './tag-reader';

export { BASE_URLS };
export type { Sender } from './tag-reader';

/** Fixed by the device — this simulator always identifies itself as one reader. */
export const READER_ID = 'SIMULATOR-01';

export const ENDPOINTS = ['/api/v1/warehouse-management/jmp/log-rfids/components/handheld'];
/** Fixed by the API, not a per-run setting. */
export const REPLACE_PATH = '/api/v1/master/register-rfids/replace';

/** The only two reasons a tag gets replaced on the line (API values). */
export const REPLACEMENT_REMARKS = ['Tag damaged', 'Tag unreadable'];

/** Known RR types, until the host's own list is loaded. */
export const RR_TYPES = [
  'SM-A0', 'DFB', 'T5H', 'T2A', 'SP1', 'SP2', 'T1B', 'T1R', 'SP3', 'T1X',
  'T3A', 'T3M', 'T3N', 'T3P', 'T1F', 'T5B', '1HT', '1BT',
];

const YEARS = Array.from({ length: 31 }, (_, i) => String(2000 + i));
const ANTENNAS = Array.from({ length: 8 }, (_, i) => String(i + 1));

/** The app keeps the last 30 send attempts. */
export const LOG_MAX = 30;

// --- the bench the tags lie on ------------------------------------------------
//
// Tags have a position; the antenna has a range that follows the Power setting
// (0-300, as on the Zebra). A tag inside the range is read while the trigger is
// held, more often and stronger the closer it lies. Units are the bench's own
// pixels, so the view can draw it 1:1. The device stands at the bench's left
// edge, its antenna up top and tilted to aim down and to the right. The
// antenna is directional: it reads within a fan, not all around.
//
// The bench is as wide as the screen leaves room for (the view tells the
// device, setBenchWidth); full power always reaches its far end.

/** Minimum width, and the bench's height. */
export const BENCH = { width: 380, height: 700 };
export const ANTENNA = { x: 0, y: 232 };
/** Where the beam points: 35° below horizontal. */
export const AIM = (35 * Math.PI) / 180;
/** Half-angle of the beam (±45° around AIM). */
export const BEAM = (45 * Math.PI) / 180;
const TICK_MS = 100;

export interface BenchTag {
  epc: string;
  x: number;
  y: number;
}

/** One tag as the app lists it during a session. */
export interface ReadTag {
  epc: string;
  /** "R:" — how many times it was read this session. */
  reads: number;
  /** Strongest recent signal, dBm. */
  rssi: number;
  /** BARU: first read in the current run. LAMA: carried over by Lanjutkan. */
  isNew: boolean;
  firstSeen: string;
  lastSeen: string;
}

export type Quality = 'strong' | 'medium' | 'weak';

/**
 * Kuat / Sedang / Lemah from signal and read count combined, as the app does.
 * The app keeps its thresholds private; these give the same verdicts as the
 * manual's screenshots (R:339 Kuat, R:36 Sedang, R:3 Lemah).
 */
export function quality(t: Pick<ReadTag, 'reads' | 'rssi'>): Quality {
  if (t.reads < 5 || t.rssi < -66) return 'weak';
  if (t.reads >= 40 && t.rssi >= -58) return 'strong';
  return 'medium';
}

export type SendStatus = 'idle' | 'sending' | 'sent' | 'failed';

/** What the server (or the network) said when a send failed. */
export interface SendFailure {
  /** 0 = no response at all. */
  status: number;
  message: string;
}

/** One line of Riwayat Log. */
export interface SendLog {
  id: number;
  at: string;
  kind: 'rfid' | 'replacement';
  mode: string;
  opname: boolean;
  ok: boolean;
  count: number;
  url: string;
  payload: Record<string, unknown>;
  status: number;
  /** The server's answer, or the technical error — the detail the scan screen hides. */
  result: string;
  rrType: string;
  factoryCode: string;
  /** Set when this entry is a resend of an earlier one. */
  resentFrom?: string;
}

/** What is stopping a replacement from being sent. */
export type ReplacementProblem = 'no-old-tag' | 'no-new-tag' | 'no-remark' | 'no-factory' | 'unknown-factory';

const PROBLEM_SUMMARY: Record<ReplacementProblem, string> = {
  'no-old-tag': 'the old tag is empty',
  'no-new-tag': 'no new tag was scanned',
  'no-remark': 'no reason was picked',
  'no-factory': 'no factory is selected',
  'unknown-factory': 'the factory is not in the host master data, so its id is unknown',
};

export type MasterStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface HandheldState extends TagReaderState {
  bench: BenchTag[];
  session: ReadTag[];
  /** What started the scan: the trigger stops on release, the screen button on Stop. */
  holdSource: 'trigger' | 'button' | null;
  scanStartedAt: string | null;
  lastScanAt: string | null;
  send: SendStatus;
  failure: SendFailure | null;
  /** "Tag belum terkirim" is asked, and whether a trigger or the button asked it. */
  prompt: 'trigger' | 'button' | null;
  replacementOpen: boolean;
  replacementTag: string;
  replacementSending: boolean;
  replacementFailure: SendFailure | null;
  /** Power being dragged in Pengaturan, not saved yet: the bench shows its range live. */
  powerPreview: number | null;
  /** How wide the bench is drawn; full power reaches its far end. */
  benchWidth: number;
  master: MasterStatus;
  masterError: string | null;
  masterFrom: string | null;
  factories: Factory[];
  log: SendLog[];
}

// Four within reach at the default power (near, near, mid, edge); one past the
// range and one above the beam.
const DEFAULT_BENCH: BenchTag[] = [
  { epc: 'E280689400004025A987A05A', x: 128, y: 255 },
  { epc: 'E280689400004025AD44841C', x: 96, y: 347 },
  { epc: 'E28068940000502B56E4B56D', x: 79, y: 427 },
  { epc: 'E28068940000402663B08D7A', x: 227, y: 317 },
  { epc: 'E2806894000050367572D095', x: 286, y: 397 },
  { epc: 'E28068940000502B56E5EEF0', x: 246, y: 60 },
];

/**
 * RFID handheld scanner, behaving like the WMS RFID Suite app on a Zebra MC33.
 *
 * Holding the trigger reads every tag in range, again and again; releasing it
 * stops and posts the unique tags once, as one batch. A failed send keeps the
 * tags on screen until they are sent or deliberately thrown away. Replacement
 * mode stops at the first tag and asks which tag it replaces.
 */
export class RfidHandheldSimulator extends TagReader<HandheldState> {
  readonly meta: SimulatorMeta = {
    id: 'rfid-handheld',
    name: 'RFID Handheld Scanner',
    category: 'Identification',
    icon: 'rfid',
    tagline: 'Zebra MC33 handheld running the WMS RFID Suite app — hold the trigger, release to post.',
    description:
      'A Zebra MC33-style handheld running a faithful copy of the WMS RFID Suite app. Hold the trigger and every tag within the antenna range is read, more often and stronger the closer it lies; release and the unique tags are posted to your warehouse API in one request, for real. Failed sends stay on screen with Kirim Ulang, the send history can be resent from Riwayat Log, and replacement mode stops at the first tag and asks which tag it replaces.',
    protocols: ['REST'],
  };

  readonly configFields: ConfigField[] = [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'combo',
      default: BASE_URLS[0],
      options: BASE_URLS,
      mono: true,
      hint: 'Pick one or type your own host',
    },
    {
      key: 'endpoint',
      label: 'Endpoint',
      type: 'combo',
      default: ENDPOINTS[0],
      options: ENDPOINTS,
      mono: true,
      hint: 'Path appended to the base URL',
    },
    {
      key: 'reader_id',
      label: 'Reader ID',
      type: 'text',
      default: READER_ID,
      readonly: true,
      mono: true,
      hint: 'Fixed by the device',
    },
    // Options are replaced with the host's own lists once master data loads.
    { key: 'rr_type', label: 'RR Type', type: 'combo', default: '', options: [...RR_TYPES], mono: true },
    { key: 'maker_name', label: 'Maker Name', type: 'text', default: 'Stechoq' },
    { key: 'factory_code', label: 'Factory Code', type: 'combo', default: '', options: [], mono: true },
    { key: 'initial_year', label: 'Initial Year', type: 'select', default: '2026', options: YEARS },
    { key: 'antenna', label: 'Antenna', type: 'select', default: '1', options: ANTENNAS },
    { key: 'mode', label: 'Mode', type: 'switch', default: 'wo', options: ['register', 'wo'] },
    {
      key: 'opname',
      label: 'Opname',
      type: 'checkbox',
      default: true,
      // A replacement is always an opname, so the flag stops being a choice.
      forcedWhen: { key: 'replacement', equals: true, value: true },
    },
    { key: 'replacement', label: 'Replacement', type: 'checkbox', default: false },
    { key: 'power', label: 'Power', type: 'number', default: 200, min: 0, max: 300, step: 1 },
    { key: 'sound', label: 'Sound', type: 'checkbox', default: true },
    { key: 'volume', label: 'Volume', type: 'number', default: 100, min: 0, max: 100, step: 1 },
    { key: 'lang', label: 'Language', type: 'select', default: 'id', options: ['en', 'id'] },
  ];

  readonly actions: ActionDef[] = [
    { id: 'pull-trigger', label: 'Pull Trigger', tone: 'primary', hint: 'Hold for 1.5 s, then release and send' },
    { id: 'reset', label: 'Reset', tone: 'danger', hint: 'Back to a freshly connected reader' },
  ];

  actionState(id: string): ActionState {
    if (id === 'pull-trigger') return { active: this.state.scanning, disabled: !this.canStart() };
    return {};
  }

  private ticker: ReturnType<typeof setInterval> | null = null;
  private logSeq = 0;

  protected initialState(): HandheldState {
    this.ticker = null;
    return {
      ...this.baseState(''),
      bench: DEFAULT_BENCH.map((t) => ({ ...t })),
      session: [],
      holdSource: null,
      scanStartedAt: null,
      lastScanAt: null,
      send: 'idle',
      failure: null,
      prompt: null,
      replacementOpen: false,
      replacementTag: '',
      replacementSending: false,
      replacementFailure: null,
      powerPreview: null,
      benchWidth: BENCH.width,
      master: 'idle',
      masterError: null,
      masterFrom: null,
      factories: [],
      log: [],
    };
  }

  /** The log is diagnostics, not settings: a reset of the device keeps it. */
  reset() {
    const log = this.state.log;
    const bench = this.state.bench;
    const master = { master: this.state.master, masterFrom: this.state.masterFrom, factories: this.state.factories };
    super.reset();
    this.state = { ...this.state, log, bench, ...master };
  }

  // --- master data ----------------------------------------------------------

  /** Overridable so tests never hit the network, exactly like `sender`. */
  fetchMaster: (baseUrl: string) => Promise<MasterFetch> = fetchMasterData;

  private get rrTypeField(): ConfigField {
    return this.configFields.find((f) => f.key === 'rr_type')!;
  }

  private get factoryField(): ConfigField {
    return this.configFields.find((f) => f.key === 'factory_code')!;
  }

  /**
   * Loads the dropdown values from a host. Settings asks for the host being
   * typed in, before it is saved, so `base` defaults to the applied one.
   */
  async ensureMasterData(force = false, base = this.cfg('baseUrl')): Promise<void> {
    if (!base) return;
    if (this.state.master === 'loading') return;
    if (!force && this.state.master === 'ready' && this.state.masterFrom === base) return;

    this.setState({ master: 'loading', masterError: null });
    const result = await this.fetchMaster(base);

    // Keep whatever came back: one list failing must not blank the other.
    this.loadMasterData(result.data, base);
    this.setState({
      master: result.ok ? 'ready' : 'failed',
      masterError: result.error ?? null,
      masterFrom: base,
    });

    for (const report of result.reports) {
      this.emit(
        report.ok ? 'MASTER_DATA_LOADED' : 'MASTER_DATA_FAILED',
        {
          list: report.name,
          url: report.url,
          items: report.count,
          status: report.status,
          duration_ms: report.durationMs,
          ...(report.error ? { error: report.error } : {}),
        },
        {
          tone: report.ok ? 'ok' : 'error',
          summary: report.ok
            ? `${report.count} ${report.name} loaded from the host`
            : `${report.name} could not be loaded — ${report.error}`,
          transport: {
            ...httpGet(report.url),
            live: true,
            response: {
              ok: report.ok,
              status: report.status,
              statusText: report.ok ? 'OK' : '',
              message: report.ok ? `${report.count} usable value(s)` : '',
              durationMs: report.durationMs,
              error: report.error,
            },
          },
        },
      );
    }
  }

  /**
   * Applies master data. An empty list is never applied: a failed refresh must
   * leave the previous values alone, or every option would lose its id.
   */
  loadMasterData(data: MasterData, from = this.cfg('baseUrl')) {
    const patch: Partial<HandheldState> = { master: 'ready', masterFrom: from };
    if (data.rrTypes.length) this.rrTypeField.options = data.rrTypes;
    if (data.factories.length) {
      this.factoryField.options = data.factories.map((f) => f.code);
      this.factoryField.optionLabels = factoryLabels(data.factories);
      patch.factories = data.factories;
    }
    this.state = { ...this.state, ...patch };
    this.fillDefaults();
    this.setState({});
  }

  /**
   * A fresh device is usable at once: an empty RR Type or Factory Code takes
   * the first value the host lists. A value already chosen is never touched.
   */
  private fillDefaults() {
    const rr = this.rrTypes();
    const factories = this.state.factories;
    if (!this.cfg('rr_type').trim() && rr.length) this.config.rr_type = rr[0];
    if (!this.cfg('factory_code').trim() && factories.length) this.config.factory_code = factories[0].code;
  }

  masterUrls() {
    return masterUrls(this.cfg('baseUrl'));
  }

  rrTypes(): string[] {
    return this.rrTypeField.options ?? [];
  }

  factories(): Factory[] {
    return this.state.factories;
  }

  selectedFactory(code = this.cfg('factory_code')): Factory | undefined {
    return this.state.factories.find((f) => f.code === code.trim());
  }

  /** Replacement only exists in register mode, whatever the stored flag says. */
  replacementActive(): boolean {
    return this.cfg('mode') === 'register' && this.bool('replacement');
  }

  newTag(): string {
    return this.state.replacementTag;
  }

  replaceUrl(): string {
    return `${this.cfg('baseUrl').replace(/\/+$/, '')}${REPLACE_PATH}`;
  }

  /** DENSO is code 5022 but id 200: only master data knows, so no guessing. */
  factoryId(): number {
    return this.selectedFactory()?.id ?? NaN;
  }

  replacementProblem(oldTag: string, remark: string): ReplacementProblem | null {
    if (!oldTag.trim()) return 'no-old-tag';
    if (!this.newTag()) return 'no-new-tag';
    if (!remark) return 'no-remark';
    if (!this.cfg('factory_code').trim()) return 'no-factory';
    if (!this.selectedFactory()) return 'unknown-factory';
    return null;
  }

  protected identity() {
    return { reader_id: READER_ID, antenna: this.cfg('antenna') };
  }

  /** A new base URL means a different host, so the dropdowns are reloaded. */
  protected onConfigApplied() {
    void this.ensureMasterData();
  }

  // --- bench ------------------------------------------------------------------

  /** Read range in bench pixels; follows Power like the real RF output. */
  range(power = this.num('power')): number {
    return (this.maxRange() * Math.min(300, Math.max(0, power))) / 300;
  }

  /** Full power: the beam's upper edge just reaches the bench's far end. */
  maxRange(): number {
    return this.state.benchWidth / Math.cos(AIM - BEAM);
  }

  distance(t: BenchTag): number {
    return Math.hypot(t.x - ANTENNA.x, t.y - ANTENNA.y);
  }

  /** Within reach and inside the beam: a tag beside or behind the antenna is not read. */
  inRange(t: BenchTag, power?: number): boolean {
    const angle = Math.atan2(t.y - ANTENNA.y, t.x - ANTENNA.x);
    return Math.abs(angle - AIM) <= BEAM && this.distance(t) <= this.range(power);
  }

  /** The bench previews a Power value while it is dragged; null drops the preview. */
  /**
   * The view's room for the bench. The range grows with it, so the tags are
   * spread across in proportion: what was near stays near, what was out of
   * reach stays out, on any screen.
   */
  setBenchWidth(width: number) {
    const w = Math.max(BENCH.width, Math.round(width));
    const was = this.state.benchWidth;
    if (Math.abs(w - was) < 2) return;
    const k = w / was;
    this.state = { ...this.state, benchWidth: w };
    this.setState({ bench: this.state.bench.map((t) => ({ ...t, ...this.clamp(t.x * k, t.y) })) });
  }

  setPowerPreview(power: number | null) {
    if (power === this.state.powerPreview) return;
    this.setState({ powerPreview: power });
  }

  /** The tags the API would receive: the unique EPCs of this session. */
  tags(): string[] {
    return this.state.session.map((t) => t.epc);
  }

  /** A tag's centre stays far enough in that the whole label is on the bench. */
  private clamp(x: number, y: number) {
    return {
      x: Math.round(Math.min(this.state.benchWidth - 70, Math.max(70, x))),
      y: Math.round(Math.min(BENCH.height - 32, Math.max(32, y))),
    };
  }

  /** Adds a tag; without a position it lands somewhere inside the range. */
  addBenchTag(epc: string = randomEpc(), at?: { x: number; y: number }): string | null {
    const id = epc.trim().toUpperCase();
    if (!/^[0-9A-F]{4,64}$/.test(id)) return null;
    if (this.state.bench.some((t) => t.epc === id)) return null;
    let pos = at;
    if (!pos) {
      const r = this.range() * (0.3 + Math.random() * 0.55);
      const a = AIM + BEAM * (Math.random() * 1.2 - 0.6);
      pos = { x: ANTENNA.x + r * Math.cos(a), y: ANTENNA.y + r * Math.sin(a) };
    }
    this.setState({ bench: [...this.state.bench, { epc: id, ...this.clamp(pos.x, pos.y) }] });
    this.emit('TAG_PLACED', { idHex: id }, { tone: 'neutral', summary: `Tag ${id} placed on the bench` });
    return id;
  }

  /** TagReader's "generate" button: a fresh tag, within reach. */
  addRandomTag() {
    this.addBenchTag();
  }

  moveBenchTag(epc: string, x: number, y: number) {
    this.setState({ bench: this.state.bench.map((t) => (t.epc === epc ? { epc, ...this.clamp(x, y) } : t)) });
  }

  removeBenchTag(epc: string) {
    this.setState({ bench: this.state.bench.filter((t) => t.epc !== epc) });
  }

  clearBench() {
    this.setState({ bench: [] });
  }

  // --- scanning -----------------------------------------------------------------

  /** Unsent tags are never dropped silently: they wait for Kirim Ulang or a decision. */
  unsent(): boolean {
    return this.state.send === 'failed' && this.state.session.length > 0;
  }

  /** While a send is in flight, the trigger is ignored until the result is in. */
  canStart(): boolean {
    const s = this.state;
    return this.status !== 'OFFLINE' && !s.scanning && s.send !== 'sending' && !s.replacementOpen && !s.prompt;
  }

  /** Physical trigger (or yellow key, side keys) pressed. */
  pressTrigger() {
    if (!this.canStart()) return;
    if (this.state.session.length) {
      // Holding the trigger with tags on screen is Scan Baru.
      if (this.unsent()) return this.setState({ prompt: 'trigger' });
      this.clearSession();
    }
    this.beginScan('trigger');
  }

  /** Releasing the trigger is the same as pressing Stop. */
  releaseTrigger() {
    if (this.state.scanning && this.state.holdSource === 'trigger') this.endScan();
  }

  /** On-screen Mulai Scan: tap to start, tap Stop to stop. */
  startButton() {
    if (!this.canStart()) return;
    this.beginScan('button');
  }

  stopButton() {
    if (this.state.scanning) this.endScan();
  }

  /** Scan Baru: drop the previous results and start over — after asking, if unsent. */
  newScan() {
    if (!this.canStart()) return;
    if (this.unsent()) return this.setState({ prompt: 'button' });
    this.clearSession();
    this.beginScan('button');
  }

  /** Lanjutkan: keep what is on screen and read on; those tags become LAMA. */
  continueScan() {
    if (!this.canStart()) return;
    this.setState({ session: this.state.session.map((t) => ({ ...t, isNew: false })) });
    this.beginScan('button');
  }

  /** The "Tag belum terkirim" dialog. */
  answerPrompt(answer: 'send' | 'discard' | 'cancel') {
    const from = this.state.prompt;
    if (!from) return;
    this.setState({ prompt: null });
    if (answer === 'send') void this.send();
    if (answer === 'discard') {
      this.emit('TAGS_DISCARDED', { count: this.state.session.length }, {
        tone: 'warn',
        summary: `${this.state.session.length} unsent tag(s) discarded — still resendable from Riwayat Log`,
      });
      this.clearSession();
      // From the trigger the list is only emptied; hold the trigger again to scan.
      if (from === 'button') this.beginScan('button');
    }
  }

  private clearSession() {
    this.setState({ session: [], send: 'idle', failure: null });
  }

  private beginScan(source: 'trigger' | 'button') {
    this.status = 'SIMULATING';
    this.setState({ scanning: true, holdSource: source, scanStartedAt: new Date().toISOString() });
    this.emit(
      source === 'trigger' ? 'TRIGGER_PRESSED' : 'SCAN_STARTED',
      { reader_id: READER_ID, power: this.num('power'), tags_in_range: this.state.bench.filter((t) => this.inRange(t)).length },
      { tone: 'active', summary: source === 'trigger' ? 'Trigger held — reading' : 'Mulai Scan — reading' },
    );
    this.tick();
    this.ticker = this.every(TICK_MS, () => this.tick());
  }

  private endScan() {
    this.stop(this.ticker);
    this.ticker = null;
    this.status = 'CONNECTED';
    const s = this.state;
    const held = s.scanStartedAt ? (Date.now() - Date.parse(s.scanStartedAt)) / 1000 : 0;
    this.setState({ scanning: false, holdSource: null, lastScanAt: new Date().toISOString() });
    this.emit(
      s.holdSource === 'trigger' ? 'TRIGGER_RELEASED' : 'SCAN_STOPPED',
      { seconds: Math.round(held * 10) / 10, unique: s.session.length, detected: this.detected() },
      { tone: 'neutral', summary: `${held.toFixed(1)} s · ${s.session.length} unique` },
    );
    if (s.session.length) void this.send();
  }

  /** Total reads across all tags — "terdeteksi". */
  detected(): number {
    return this.state.session.reduce((n, t) => n + t.reads, 0);
  }

  /**
   * One antenna cycle: each tag in range answers with a chance and a strength
   * that fall with distance. Near tags rack up reads quickly, edge tags now and
   * then, which is what makes the app's Kualitas meaningful.
   */
  private tick() {
    const range = this.range();
    if (range <= 0) return;
    const now = new Date().toISOString();
    const session = [...this.state.session];
    let fresh: string | null = null;
    for (const tag of this.state.bench) {
      if (!this.inRange(tag)) continue;
      const f = this.distance(tag) / range;
      if (Math.random() > 1 - 0.8 * f * f) continue;
      // A UHF reader answers a near tag a few hundred times a second.
      const reads = 1 + Math.floor(Math.random() * 30 * (1 - f));
      const rssi = Math.round(-30 - 40 * f + (Math.random() * 4 - 2));
      const i = session.findIndex((t) => t.epc === tag.epc);
      if (i === -1) {
        session.push({ epc: tag.epc, reads, rssi, isNew: true, firstSeen: now, lastSeen: now });
        fresh ??= tag.epc;
        this.emit('TAG_READ', { idHex: tag.epc, rssi }, { tone: 'active', summary: `${tag.epc} · ${rssi} dBm` });
      } else {
        const t = session[i];
        session[i] = { ...t, reads: t.reads + reads, rssi: Math.round((t.rssi * 3 + rssi) / 4), lastSeen: now };
      }
    }
    this.setState({ session });

    // Replacement: the first tag stops the scan at once and opens the form.
    if (fresh && this.replacementActive()) {
      this.stop(this.ticker);
      this.ticker = null;
      this.status = 'CONNECTED';
      this.setState({
        scanning: false,
        holdSource: null,
        session: session.filter((t) => t.epc === fresh),
        replacementOpen: true,
        replacementTag: fresh,
        replacementFailure: null,
      });
      this.emit('REPLACEMENT_SCANNED', { new_rfid_number: fresh, factory_id: this.factoryId() }, {
        tone: 'active',
        summary: `New tag ${fresh} scanned — waiting for the old tag`,
      });
    }
  }

  // --- sending ------------------------------------------------------------------

  /** The exact body posted to the warehouse API. */
  buildPayload(idHex: string[] = this.tags()) {
    return {
      rr_type: this.cfg('rr_type'),
      maker_name: this.cfg('maker_name'),
      idHex,
      initial_year: this.cfg('initial_year'),
      reader_id: READER_ID,
      antenna: this.cfg('antenna'),
      timestamp: new Date().toISOString(),
      opname: this.bool('opname'),
      mode: this.cfg('mode'),
      factory_code: this.cfg('factory_code'),
    };
  }

  /** Posts the session's unique tags. Also Kirim Ulang and "Kirim dulu". */
  async send(): Promise<boolean> {
    const idHex = this.tags();
    if (!idHex.length || this.state.send === 'sending') return false;
    this.setState({ send: 'sending', failure: null });
    const payload = this.buildPayload(idHex);
    const url = this.url();
    const ok = await this.dispatch(payload, {
      label: `${idHex.length} tag(s)`,
      url,
      events: { ok: 'RFID_SENT', fail: 'RFID_SEND_FAILED' },
      coalesce: false,
    });
    const failure = ok ? null : this.failureOf();
    this.setState({ send: ok ? 'sent' : 'failed', failure });
    this.record({ kind: 'rfid', ok, count: idHex.length, url, payload });
    return ok;
  }

  private failureOf(): SendFailure {
    const res = this.transmission.lastResponse;
    return { status: res?.status ?? 0, message: res?.error ? '' : res?.message ?? '' };
  }

  private record(e: { kind: SendLog['kind']; ok: boolean; count: number; url: string; payload: Record<string, unknown>; resentFrom?: string }) {
    const res = this.transmission.lastResponse;
    const result = res?.error
      ? res.error
      : `${res?.status ?? ''} ${res?.statusText ?? ''}`.trim() + (res?.message ? ` — ${res.message}` : '');
    const entry: SendLog = {
      id: ++this.logSeq,
      at: new Date().toISOString(),
      mode: String(e.payload.mode ?? this.cfg('mode')),
      opname: Boolean(e.payload.opname ?? this.bool('opname')),
      status: res?.status ?? 0,
      result,
      rrType: String(e.payload.rr_type ?? this.cfg('rr_type')),
      factoryCode: String(e.payload.factory_code ?? this.cfg('factory_code')),
      ...e,
    };
    this.setState({ log: [entry, ...this.state.log].slice(0, LOG_MAX) });
  }

  /** Riwayat Log → Kirim ulang: the original data, unchanged, to the original address. */
  async resendLog(id: number): Promise<boolean> {
    const entry = this.state.log.find((e) => e.id === id);
    if (!entry || !this.canResend(entry)) return false;
    const ok = await this.dispatch(entry.payload, {
      label: `Resend of ${entry.at}`,
      url: entry.url,
      events: { ok: 'RESEND_SENT', fail: 'RESEND_FAILED' },
      coalesce: false,
    });
    this.record({ kind: entry.kind, ok, count: entry.count, url: entry.url, payload: entry.payload, resentFrom: entry.at });
    return ok;
  }

  /** A replacement that went through already swapped the tag on the server. */
  canResend(entry: SendLog): boolean {
    return !(entry.kind === 'replacement' && entry.ok);
  }

  // --- replacement ----------------------------------------------------------

  /** Batal: the scanned tag is simply dropped. */
  closeReplacement() {
    if (!this.state.replacementOpen) return;
    this.setState({ replacementOpen: false, replacementTag: '', replacementFailure: null, session: [] });
    this.emit('REPLACEMENT_CANCELLED', { new_rfid_number: this.newTag() }, {
      tone: 'neutral',
      summary: 'Replacement cancelled — nothing was sent',
    });
  }

  buildReplacement(oldTag: string, remark: string) {
    return {
      old_rfid_number: oldTag,
      new_rfid_number: this.newTag(),
      replacement_remark: remark,
      factory_id: this.factoryId(),
      opname: this.bool('opname'),
    };
  }

  /**
   * Refuses an incomplete form rather than posting half of it; a rejection
   * keeps the form open so it can be retried without scanning again.
   */
  async submitReplacement(oldTag: string, remark: string): Promise<boolean> {
    const old = oldTag.trim();
    const problem = this.replacementProblem(old, remark);
    if (problem) {
      this.emit(
        'REPLACEMENT_INCOMPLETE',
        { old_rfid_number: old, new_rfid_number: this.newTag(), replacement_remark: remark, factory_code: this.cfg('factory_code'), problem },
        { tone: 'warn', summary: `Replacement refused — ${PROBLEM_SUMMARY[problem]}` },
      );
      return false;
    }
    const newTag = this.newTag();
    const payload = this.buildReplacement(old, remark);
    this.setState({ replacementSending: true, replacementFailure: null });
    const ok = await this.dispatch(payload, {
      label: `Replacement ${old} → ${newTag}`,
      url: this.replaceUrl(),
      events: { ok: 'REPLACEMENT_SENT', fail: 'REPLACEMENT_FAILED' },
      coalesce: false,
    });
    this.record({ kind: 'replacement', ok, count: 1, url: this.replaceUrl(), payload });
    this.setState({
      replacementSending: false,
      replacementFailure: ok ? null : this.failureOf(),
      ...(ok ? { replacementOpen: false, replacementTag: '', session: [] } : {}),
    });
    return ok;
  }

  // --- generic controls (explorer, docs) ------------------------------------

  protected onAction(id: string) {
    if (id === 'pull-trigger') {
      this.pressTrigger();
      this.after(1500, () => this.releaseTrigger());
    }
  }

  samplePayload() {
    return {
      rr_type: 'T1B',
      maker_name: 'check',
      idHex: ['E280689400004025A987A05A', 'E280689400004025AD44841C', 'E28068940000502B56E4B56D'],
      initial_year: '2027',
      reader_id: READER_ID,
      antenna: '1',
      timestamp: '2026-08-11T01:29:51.482Z',
      opname: true,
      mode: 'wo',
      factory_code: '5022',
    };
  }
}
