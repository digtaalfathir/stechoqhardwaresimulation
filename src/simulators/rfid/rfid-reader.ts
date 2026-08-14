import type { ActionDef, ActionState, ConfigField, SimulatorMeta } from '../core/types';
import { BASE_URLS, TagReader, sample, shuffle, type TagReaderState } from './tag-reader';

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

interface ReaderState extends TagReaderState {
  sweep: number;
  covered: number;
  total: number;
}

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
].join('\n');

/**
 * Fixed RFID gate reader.
 *
 * Unlike the handheld, a gate does not report a sweep as one complete list: it
 * publishes whatever its antennas picked up in the last interval. A tag may
 * appear on the second sweep instead of the first, and a tag still inside the
 * field is reported again. Everything in the list is read within a few sweeps —
 * which is exactly the timing and duplication your consumer has to tolerate.
 */
export class RfidReaderSimulator extends TagReader<ReaderState> {
  readonly meta: SimulatorMeta = {
    id: 'rfid-reader',
    name: 'RFID Reader',
    category: 'Identification',
    icon: 'antenna',
    tagline: 'Fixed gate reader that publishes partial, overlapping tag batches on an interval.',
    description:
      'Simulates a fixed RFID gate: instead of one complete list per trigger, each interval publishes only what the antennas caught in that window. Tags arrive spread over several sweeps and repeat while they are still in the field, so you can prove your consumer deduplicates and waits for the full set. Requests are really sent to the endpoint you configure.',
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
    { key: 'antenna', label: 'Antenna', type: 'select', default: '1', options: ANTENNAS },
    {
      key: 'interval',
      label: 'Scan Interval',
      type: 'number',
      default: 7000,
      min: 500,
      max: 60000,
      step: 500,
      hint: 'Milliseconds between gate reports',
    },
  ];

  readonly actions: ActionDef[] = [
    {
      id: 'start-scan',
      label: 'Start Scan',
      activeLabel: 'Scanning…',
      tone: 'primary',
      hint: 'Publish what the gate sees, every interval',
    },
    { id: 'stop-scan', label: 'Stop Scan', hint: 'Halt the gate' },
    { id: 'reset', label: 'Reset', tone: 'danger', hint: 'Back to a freshly connected reader' },
  ];

  actionState(id: string): ActionState {
    const { scanning } = this.state;
    switch (id) {
      case 'start-scan':
        return { active: scanning, disabled: scanning };
      case 'stop-scan':
        return { disabled: !scanning };
      default:
        return {};
    }
  }

  private loop: ReturnType<typeof setInterval> | null = null;
  /** Tags of the current run that have not been reported yet. */
  private pending: string[] = [];
  private reported: string[] = [];
  private sweepsPlanned = SWEEPS_TO_FULL_READ.min;

  protected initialState(): ReaderState {
    this.loop = null;
    this.pending = [];
    this.reported = [];
    return { ...this.baseState(DEFAULT_TAGS), sweep: 0, covered: 0, total: 0 };
  }

  protected identity() {
    return { reader_id: READER_ID, antenna: this.cfg('antenna') };
  }

  protected onAction(id: string) {
    if (id === 'start-scan') this.startScan();
    if (id === 'stop-scan') this.stopScan();
  }

  coverage() {
    return { covered: this.state.covered, total: this.state.total || this.tags().length };
  }

  /** The exact body published by the gate. */
  buildPayload(idHex: string[]) {
    return {
      reader_id: READER_ID,
      antenna: this.cfg('antenna'),
      id_hex: idHex,
      timestamp: new Date().toISOString(),
    };
  }

  private startScan() {
    if (this.state.scanning) return;
    const { min, max } = SWEEPS_TO_FULL_READ;
    this.pending = shuffle(this.tags());
    this.reported = [];
    this.sweepsPlanned = min + Math.floor(Math.random() * (max - min + 1));

    this.status = 'SIMULATING';
    this.setState({ scanning: true, sweep: 0, covered: 0, total: this.tags().length });
    this.emit(
      'SCAN_STARTED',
      {
        reader_id: READER_ID,
        antenna: this.cfg('antenna'),
        interval_ms: this.num('interval'),
        tags_in_field: this.tags().length,
      },
      { tone: 'active', summary: `Gate started — ${this.tags().length} tag(s) in the field` },
    );
    this.sweep();
    this.loop = this.every(Math.max(500, this.num('interval')), () => this.sweep());
  }

  private stopScan() {
    if (!this.state.scanning) return;
    this.stop(this.loop);
    this.loop = null;
    this.status = 'CONNECTED';
    this.setState({ scanning: false });
    this.emit(
      'SCAN_STOPPED',
      { reader_id: READER_ID, payloads_sent: this.state.sendCount, covered: this.state.covered },
      { tone: 'neutral', summary: 'Gate stopped' },
    );
  }

  /** One interval of gate output: some new tags, some still-in-field re-reads. */
  private async sweep() {
    const all = this.tags();
    if (all.length === 0) {
      this.emit('SCAN_NO_TAG', { reader_id: READER_ID, antenna: this.cfg('antenna') }, {
        tone: 'warn',
        summary: 'Tag list is empty — nothing in the field',
      });
      return;
    }
    // Consuming the plan before knowing the request goes out would mark tags as
    // reported that were never sent.
    if (this.inFlight) {
      this.setState({ skipped: this.state.skipped + 1 });
      return;
    }

    this.syncWithTagList(all);
    const sweep = this.state.sweep + 1;
    const sweepsLeft = Math.max(1, this.sweepsPlanned - sweep + 1);

    const fresh = this.pending.splice(0, this.freshCount(sweepsLeft));
    this.reported.push(...fresh);

    // Whatever is still in the field can be seen again — usually a handful,
    // occasionally most of it. That is what makes one sweep "3 new + 4 already
    // sent" and the next "1 + 0".
    const stillInField = this.reported.filter((t) => !fresh.includes(t));
    const rereads = sample(stillInField, rereadCount(stillInField.length));
    let batch = shuffle([...fresh, ...rereads]);
    // Everything is covered but the gate keeps looking: report re-reads only.
    if (batch.length === 0) batch = sample(this.reported, 1 + Math.floor(Math.random() * 3));

    this.setState({ sweep, covered: this.reported.length, total: all.length });
    await this.dispatch(batch, this.buildPayload(batch), `${this.reported.length}/${all.length} covered`);

    if (fresh.length > 0 && this.pending.length === 0) {
      this.emit(
        'TAG_LIST_COVERED',
        { reader_id: READER_ID, tag_count: all.length, sweeps: sweep },
        { tone: 'ok', summary: `All ${all.length} tag(s) reported after ${sweep} sweep(s)` },
      );
    }
  }

  /**
   * How many *unseen* tags this sweep picks up.
   *
   * Anything from none to nearly all of them, so batch sizes and the new/old
   * mix keep changing — but never the whole remainder while sweeps are still
   * planned, and always the whole remainder on the last one, so the list is
   * still fully reported inside the promised window.
   */
  private freshCount(sweepsLeft: number): number {
    const pending = this.pending.length;
    if (pending === 0) return 0;
    if (sweepsLeft <= 1) return pending;
    if (this.reported.length > 0 && Math.random() < QUIET_SWEEP_CHANCE) return 0;
    // At least a fair share of what is left, at most double it: enough variety
    // to look like a gate, never so much that one sweep swallows the list.
    const min = Math.ceil(pending / sweepsLeft);
    const cap = Math.max(min, Math.min(pending - 1, min * 2));
    return min + Math.floor(Math.random() * (cap - min + 1));
  }

  /** The list is editable mid-run, so the plan follows it. */
  private syncWithTagList(all: string[]) {
    this.pending = this.pending.filter((t) => all.includes(t));
    this.reported = this.reported.filter((t) => all.includes(t));
    const known = new Set([...this.pending, ...this.reported]);
    for (const tag of all) {
      if (!known.has(tag)) this.pending.push(tag);
    }
  }

  samplePayload() {
    return {
      reader_id: READER_ID,
      antenna: '1',
      id_hex: ['E280689400004025A987A05A', 'E28068940000502B56E4B56D'],
      timestamp: '2026-08-11T01:29:51.482Z',
    };
  }
}
