import type { ActionDef, ActionState, ConfigField, SimulatorMeta } from '../core/types';
import { randomEpc } from '../core/wire';
import { BASE_URLS, RFID_EVENTS, TagReader, sample, shuffle, type TagReaderState } from './tag-reader';

/** Fixed by the device — the gate always identifies itself as this reader. */
export const READER_ID = 'SIMULATOR-02';

export const ENDPOINTS = ['/api/v1/warehouse-management/jmp/log-rfids'];

const ANTENNAS = Array.from({ length: 8 }, (_, i) => String(i + 1));

/**
 * A gate rarely sees every tag on the first pass, but it does get them all
 * within a few sweeps. This is the window it aims for.
 */
const SWEEPS_TO_FULL_READ = { min: 2, max: 4 };
/** Chance that a sweep catches nothing new and only re-reports the field. */
const QUIET_SWEEP_CHANCE = 0.25;

/**
 * How many already-reported tags a sweep sees again: biased low, because most
 * of the time only a few are still in front of the antennas — but a crowded
 * gate occasionally re-reports nearly everything.
 */
function rereadCount(inField: number): number {
  return Math.floor(Math.random() ** 2 * (inField + 1));
}

/** One report the gate put on the wire, for the sweep timeline. */
export interface GateSweep {
  pass: number;
  n: number;
  at: string;
  /** First time this pass. */
  fresh: string[];
  /** Already reported this pass, still in the field. */
  again: string[];
  /** null while the request is in flight. */
  ok: boolean | null;
  status: number;
  durationMs: number;
  covered: number;
  total: number;
}

/** A forklift carrying one load through the gate. Times are epoch ms. */
export interface GatePass {
  n: number;
  epcs: string[];
  startedAt: number;
  /** The load reaches the antennas: first report. */
  enterAt: number;
  /** Last report; the load is through. */
  leaveAt: number;
  /** The forklift is out of sight. */
  endAt: number;
  sweepsPlanned: number;
}

interface ReaderState extends TagReaderState {
  sweep: number;
  covered: number;
  total: number;
  pass: GatePass | null;
  passes: number;
  /** Tags of the current pass already reported. */
  reported: string[];
  /** The last report's tags: what the antennas see right now. */
  readNow: string[];
  sweeps: GateSweep[];
}

/** One forklift load; anything up to this many RR is a single pass. */
export const LOAD_SIZE = 18;
const SWEEPS_KEPT = 12;

const DEFAULT_TAGS = [
  'E280689400004025A987A05A',
  'E280689400004025AD44841C',
  'E28068940000502B56E4B56D',
  'E28068940000402663B08D7A',
  'E28068940000402663B08E11',
  'E2806894000050317A2C4419',
  'E28068940000402663B0912F',
  'E280689400005029D1B7740E',
  'E28068940000402663B08C52',
  'E2806894000050317A2C43D8',
  'E280689400004025A987A1F3',
  'E28068940000502B56E4C02A',
  'E28068940000402663B08F64',
  'E2806894000050317A2C45B7',
  'E28068940000402663B09380',
  'E280689400005029D1B77591',
  'E28068940000402663B08DE5',
  'E2806894000050317A2C4626',
].join('\n');

/**
 * Fixed RFID gate: an 8-antenna portal at the warehouse door, reporting as one
 * reader on one antenna.
 *
 * A forklift drives a stack of RR through it. The gate does not report the
 * stack as one complete list: every interval it publishes whatever its
 * antennas caught in that window, so a tag may show up on the second report
 * instead of the first, and a tag still in the field is reported again. The
 * whole load is reported within a few reports of the forklift passing — which
 * is exactly the timing and duplication your consumer has to tolerate.
 */
export class RfidReaderSimulator extends TagReader<ReaderState> {
  readonly meta: SimulatorMeta = {
    id: 'rfid-reader',
    name: 'RFID Reader',
    category: 'Identification',
    icon: 'antenna',
    tagline: 'Warehouse gate with 8 antennas — a forklift drives a stack of RR through, the gate reports what it reads.',
    description:
      'Simulates a fixed RFID gate at the warehouse door: an 8-antenna portal that a forklift drives a stack of RR through. Instead of one complete list, each interval publishes only what the antennas caught in that window, so tags arrive spread over several reports and repeat while still in the field — prove your consumer deduplicates and waits for the full set. Requests are really sent to the endpoint you configure.',
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
    {
      key: 'antenna',
      label: 'Antenna',
      type: 'select',
      default: '1',
      options: ANTENNAS,
      hint: 'The gate has 8, but reports as one',
    },
    {
      key: 'interval',
      label: 'Report Interval',
      type: 'number',
      default: 3000,
      min: 500,
      max: 60000,
      step: 500,
      hint: 'Milliseconds between gate reports',
    },
  ];

  readonly actions: ActionDef[] = [
    {
      id: 'pass',
      label: 'Drive Forklift Through',
      activeLabel: 'Passing…',
      tone: 'primary',
      hint: 'The loaded forklift drives through the gate',
    },
    { id: 'stop-pass', label: 'Stop', hint: 'Abort the pass' },
    { id: 'reset', label: 'Reset', tone: 'danger', hint: 'Back to a freshly connected reader' },
  ];

  actionState(id: string): ActionState {
    const busy = this.state.pass !== null;
    switch (id) {
      case 'pass':
        return { active: busy, disabled: busy };
      case 'stop-pass':
        return { disabled: !busy };
      default:
        return {};
    }
  }

  private loop: ReturnType<typeof setInterval> | null = null;
  /** Tags of the current pass that have not been reported yet. */
  private pending: string[] = [];

  protected initialState(): ReaderState {
    this.loop = null;
    this.pending = [];
    return {
      ...this.baseState(DEFAULT_TAGS),
      sweep: 0,
      covered: 0,
      total: 0,
      pass: null,
      passes: 0,
      reported: [],
      readNow: [],
      sweeps: [],
    };
  }

  protected identity() {
    return { reader_id: READER_ID, antenna: this.cfg('antenna') };
  }

  protected onAction(id: string) {
    if (id === 'pass') this.startPass();
    if (id === 'stop-pass') this.stopPass();
  }

  coverage() {
    return { covered: this.state.covered, total: this.state.total || this.tags().length };
  }

  /** The exact body published by the gate. */
  buildPayload(idHex: string[]) {
    return {
      reader_id: READER_ID,
      antenna: this.cfg('antenna'),
      idHex,
      timestamp: new Date().toISOString(),
    };
  }

  /** Fills the load with fresh RR, as many as one forklift carries. */
  randomLoad(count = LOAD_SIZE) {
    this.setTagsText(Array.from({ length: count }, () => randomEpc()).join('\n'));
  }

  /** Approach and exit take a moment either side of the reports. */
  private lead(interval: number): number {
    return Math.min(2500, Math.max(300, interval / 2));
  }

  /**
   * The forklift drives the current load through. The load is fixed when it
   * sets off: editing the list now loads the next forklift, not this one.
   */
  private startPass() {
    if (this.state.pass) return;
    const epcs = this.tags();
    if (epcs.length === 0) {
      this.emit('SCAN_NO_TAG', { reader_id: READER_ID, antenna: this.cfg('antenna') }, {
        tone: 'warn',
        summary: 'The forklift is empty — add RR to the load first',
      });
      return;
    }
    const { min, max } = SWEEPS_TO_FULL_READ;
    const planned = min + Math.floor(Math.random() * (max - min + 1));
    const interval = Math.max(500, this.num('interval'));
    const lead = this.lead(interval);
    const now = Date.now();
    const pass: GatePass = {
      n: this.state.passes + 1,
      epcs,
      startedAt: now,
      enterAt: now + lead,
      leaveAt: now + lead + (planned - 1) * interval,
      endAt: now + lead + (planned - 1) * interval + lead,
      sweepsPlanned: planned,
    };
    this.pending = shuffle(epcs);

    this.status = 'SIMULATING';
    this.setState({ scanning: true, pass, sweep: 0, covered: 0, total: epcs.length, reported: [], readNow: [], sweeps: [] });
    this.emit(
      'FORKLIFT_ENTERING',
      { pass: pass.n, rr: epcs.length, reader_id: READER_ID, interval_ms: interval },
      { tone: 'active', summary: `Pass #${pass.n} — forklift with ${epcs.length} RR heading for the gate` },
    );
    this.after(lead, () => {
      void this.sweep();
      if (pass.sweepsPlanned > 1) this.loop = this.every(interval, () => void this.sweep());
    });
  }

  private stopPass() {
    const pass = this.state.pass;
    if (!pass) return;
    this.clearTimers();
    this.loop = null;
    this.status = 'CONNECTED';
    this.setState({ scanning: false, pass: null, readNow: [] });
    this.emit('PASS_STOPPED', { pass: pass.n, covered: this.state.covered, total: pass.epcs.length }, {
      tone: 'warn',
      summary: `Pass #${pass.n} stopped at ${this.state.covered}/${pass.epcs.length}`,
    });
  }

  private finishPass() {
    const pass = this.state.pass;
    if (!pass) return;
    this.status = 'CONNECTED';
    this.setState({ scanning: false, pass: null, passes: pass.n, readNow: [] });
    this.emit(
      'FORKLIFT_LEFT',
      { pass: pass.n, reported: this.state.covered, total: pass.epcs.length, reports: this.state.sweep },
      { tone: 'ok', summary: `Pass #${pass.n} done — ${this.state.covered}/${pass.epcs.length} RR reported in ${this.state.sweep} report(s)` },
    );
  }

  /** One interval of gate output: some new tags, some still-in-field re-reads. */
  private async sweep() {
    const pass = this.state.pass;
    if (!pass) return;
    const all = pass.epcs;
    const sweep = this.state.sweep + 1;
    const sweepsLeft = Math.max(1, pass.sweepsPlanned - sweep + 1);

    const fresh = this.pending.splice(0, this.freshCount(sweepsLeft, this.state.reported.length));
    const reported = [...this.state.reported, ...fresh];

    // Whatever is still in the field can be seen again — usually a handful,
    // occasionally most of it. That is what makes one report "3 new + 4 already
    // sent" and the next "1 + 0".
    const stillInField = this.state.reported;
    const again = sample(stillInField, rereadCount(stillInField.length));
    let batch = shuffle([...fresh, ...again]);
    if (batch.length === 0) batch = sample(reported, 1 + Math.floor(Math.random() * 3));

    const entry: GateSweep = {
      pass: pass.n,
      n: sweep,
      at: new Date().toISOString(),
      fresh,
      again: batch.filter((t) => !fresh.includes(t)),
      ok: null,
      status: 0,
      durationMs: 0,
      covered: reported.length,
      total: all.length,
    };
    this.setState({
      sweep,
      covered: reported.length,
      total: all.length,
      reported,
      readNow: batch,
      sweeps: [entry, ...this.state.sweeps].slice(0, SWEEPS_KEPT),
    });

    // The last planned report: stop the clock, then let the forklift drive off.
    if (sweep >= pass.sweepsPlanned) {
      this.stop(this.loop);
      this.loop = null;
      this.after(this.lead(Math.max(500, this.num('interval'))), () => this.finishPass());
    }

    const ok = await this.dispatch(this.buildPayload(batch), {
      label: `${batch.length} tag(s)`,
      note: `${reported.length}/${all.length} covered`,
      url: this.url(),
      events: RFID_EVENTS,
      coalesce: false,
    });
    const res = this.transmission.lastResponse;
    this.setState({
      sweeps: this.state.sweeps.map((s) =>
        s === entry ? { ...s, ok, status: res?.status ?? 0, durationMs: res?.durationMs ?? 0 } : s,
      ),
    });

    if (fresh.length > 0 && this.pending.length === 0) {
      this.emit(
        'TAG_LIST_COVERED',
        { reader_id: READER_ID, tag_count: all.length, sweeps: sweep, pass: pass.n },
        { tone: 'ok', summary: `All ${all.length} RR reported after ${sweep} report(s)` },
      );
    }
  }

  /**
   * How many *unseen* tags this report picks up.
   *
   * Anything from none to nearly all of them, so batch sizes and the new/old
   * mix keep changing — but never the whole remainder while reports are still
   * planned, and always the whole remainder on the last one, so the load is
   * fully reported before the forklift leaves.
   */
  private freshCount(sweepsLeft: number, reportedSoFar: number): number {
    const pending = this.pending.length;
    if (pending === 0) return 0;
    if (sweepsLeft <= 1) return pending;
    if (reportedSoFar > 0 && Math.random() < QUIET_SWEEP_CHANCE) return 0;
    const min = Math.ceil(pending / sweepsLeft);
    const cap = Math.max(min, Math.min(pending - 1, min * 2));
    return min + Math.floor(Math.random() * (cap - min + 1));
  }

  samplePayload() {
    return {
      reader_id: READER_ID,
      antenna: '1',
      idHex: ['E280689400004025A987A05A', 'E28068940000502B56E4B56D'],
      timestamp: '2026-08-11T01:29:51.482Z',
    };
  }
}
