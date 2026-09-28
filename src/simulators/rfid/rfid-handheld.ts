import type { ActionDef, ActionState, ConfigField, SimulatorMeta } from '../core/types';
import { randomEpc } from '../core/wire';
import { BASE_URLS, TagReader, type TagReaderState } from './tag-reader';

export { BASE_URLS };
export type { Sender } from './tag-reader';

/** Fixed by the device — this simulator always identifies itself as one reader. */
export const READER_ID = 'SIMULATOR-01';

export const ENDPOINTS = ['/api/v1/warehouse-management/jmp/log-rfids/components/handheld'];
export const REPLACE_ENDPOINTS = ['/api/v1/master/register-rfids/replace'];

/** The only two reasons a tag gets replaced on the line. */
export const REPLACEMENT_REMARKS = ['Tag damaged', 'Tag unreadable'];

/** Known RR types. Duplicates in the source list dropped, order kept. */
export const RR_TYPES = [
  'SM-A0', 'DFB', 'T5H', 'T2A', 'SP1', 'SP2', 'T1B', 'T1R', 'SP3', 'T1X',
  'T3A', 'T3M', 'T3N', 'T3P', 'T1F', 'T5B', '1HT', '1BT',
];

const YEARS = Array.from({ length: 31 }, (_, i) => String(2000 + i));
const ANTENNAS = Array.from({ length: 8 }, (_, i) => String(i + 1));

interface HandheldState extends TagReaderState {
  lastTagCount: number;
  /** Replacement asks for the old tag before anything is sent. */
  replacementOpen: boolean;
}

const DEFAULT_TAGS = [
  'E280689400004025A987A05A',
  'E280689400004025AD44841C',
  'E28068940000502B56E4B56D',
  'E28068940000402663B08D7A',
].join('\n');

/**
 * RFID handheld scanner.
 *
 * A trigger pull reports everything the operator swept in one go, so every
 * sweep — single or continuous — POSTs the whole tag list as one batch.
 */
export class RfidHandheldSimulator extends TagReader<HandheldState> {
  readonly meta: SimulatorMeta = {
    id: 'rfid-handheld',
    name: 'RFID Handheld Scanner',
    category: 'Identification',
    icon: 'rfid',
    tagline: 'Handheld UHF reader that really posts a batch of tag reads to your warehouse API.',
    description:
      'Simulates a handheld UHF RFID reader: single-shot or continuous sweeps, each one POSTing the whole tag list in a single request to the endpoint you configure. The request is genuinely sent, so the response — status, message and timing — tells you whether your backend accepted it. The tag list is editable live, without re-applying the configuration.',
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
      key: 'rr_type',
      label: 'RR Type',
      type: 'combo',
      default: '',
      options: RR_TYPES,
      mono: true,
      placeholder: 'Pick or type',
    },
    { key: 'maker_name', label: 'Maker Name', type: 'text', default: '', placeholder: 'e.g. check' },
    { key: 'factory_code', label: 'Factory Code', type: 'text', default: '', mono: true, placeholder: 'e.g. 5022' },
    { key: 'initial_year', label: 'Initial Year', type: 'select', default: '2026', options: YEARS },
    { key: 'antenna', label: 'Antenna', type: 'select', default: '1', options: ANTENNAS },
    { key: 'mode', label: 'Mode', type: 'switch', default: 'wo', options: ['register', 'wo'] },
    {
      key: 'opname',
      label: 'Opname',
      type: 'checkbox',
      default: true,
      hint: 'Sent as a boolean',
      // A replacement is always an opname, so the flag stops being a choice.
      forcedWhen: { key: 'replacement', equals: true, value: true },
    },
    {
      key: 'replacement',
      label: 'Replacement',
      type: 'checkbox',
      default: false,
      visibleWhen: { key: 'mode', equals: 'register' },
      hint: 'Swap one tag for another instead of logging a sweep',
    },
    {
      key: 'replaceEndpoint',
      label: 'Replace Endpoint',
      type: 'combo',
      default: REPLACE_ENDPOINTS[0],
      options: REPLACE_ENDPOINTS,
      mono: true,
      visibleWhen: { key: 'replacement', equals: true },
      hint: 'Where the replacement is posted',
    },
    {
      key: 'factoryId',
      label: 'Factory ID',
      type: 'number',
      default: 382,
      min: 0,
      max: 999999,
      step: 1,
      visibleWhen: { key: 'replacement', equals: true },
      hint: 'Sent as a number',
    },
    {
      key: 'interval',
      label: 'Scan Interval',
      type: 'number',
      default: 1200,
      min: 200,
      max: 10000,
      step: 100,
      hint: 'Milliseconds between sweeps while scanning',
    },
  ];

  readonly actions: ActionDef[] = [
    {
      id: 'start-scan',
      label: 'Start Scan',
      activeLabel: 'Scanning…',
      tone: 'primary',
      hint: 'Send the batch repeatedly at the interval',
    },
    { id: 'stop-scan', label: 'Stop Scan', hint: 'Halt continuous scanning' },
    { id: 'scan-once', label: 'Scan Once', activeLabel: 'Sending…', hint: 'Send the whole tag list once' },
    { id: 'reset', label: 'Reset', tone: 'danger', hint: 'Back to a freshly connected reader' },
  ];

  actionState(id: string): ActionState {
    const { scanning, sending, replacementOpen } = this.state;
    // A replacement is a single exchange: continuous scanning has no meaning.
    if (this.replacementActive()) {
      switch (id) {
        case 'start-scan':
        case 'scan-once':
          return { disabled: replacementOpen || sending };
        case 'stop-scan':
          return { disabled: true };
        default:
          return {};
      }
    }
    switch (id) {
      case 'start-scan':
        return { active: scanning, disabled: scanning };
      case 'stop-scan':
        return { disabled: !scanning };
      case 'scan-once':
        return { active: sending && !scanning, disabled: scanning || sending };
      default:
        return {};
    }
  }

  private loop: ReturnType<typeof setInterval> | null = null;

  protected initialState(): HandheldState {
    this.loop = null;
    return { ...this.baseState(DEFAULT_TAGS), lastTagCount: 0, replacementOpen: false };
  }

  /** Replacement only exists in register mode, whatever the stored flag says. */
  replacementActive(): boolean {
    return this.cfg('mode') === 'register' && this.bool('replacement');
  }

  /** In replacement mode the list holds exactly one tag: the new one. */
  newTag(): string {
    return this.tags()[0] ?? '';
  }

  replaceUrl(): string {
    const base = this.cfg('baseUrl').replace(/\/+$/, '');
    const path = this.cfg('replaceEndpoint');
    if (!path) return base;
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  protected identity() {
    return { reader_id: READER_ID, antenna: this.cfg('antenna') };
  }

  protected onAction(id: string) {
    switch (id) {
      case 'start-scan':
        this.startScan();
        break;
      case 'stop-scan':
        this.stopScan();
        break;
      case 'scan-once':
        if (this.replacementActive()) this.openReplacement();
        else this.sweep();
        break;
    }
  }

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

  private startScan() {
    if (this.replacementActive()) return this.openReplacement();
    if (this.state.scanning) return;
    this.status = 'SIMULATING';
    this.setState({ scanning: true });
    this.emit(
      'SCAN_STARTED',
      { reader_id: READER_ID, antenna: this.cfg('antenna'), interval_ms: this.num('interval') },
      { tone: 'active', summary: 'Continuous scan started' },
    );
    this.sweep();
    this.loop = this.every(Math.max(200, this.num('interval')), () => this.sweep());
  }

  private stopScan() {
    if (!this.state.scanning) return;
    this.stop(this.loop);
    this.loop = null;
    this.status = 'CONNECTED';
    this.setState({ scanning: false });
    this.emit(
      'SCAN_STOPPED',
      { reader_id: READER_ID, payloads_sent: this.state.sendCount },
      { tone: 'neutral', summary: 'Continuous scan stopped' },
    );
  }

  // --- replacement ----------------------------------------------------------

  /** A trigger pull in replacement mode halts the scan and asks for the old tag. */
  private openReplacement() {
    if (this.state.scanning) this.stopScan();
    if (this.state.replacementOpen) return;
    this.setState({ replacementOpen: true });
    const newTag = this.newTag();
    this.emit(
      'REPLACEMENT_SCANNED',
      { new_rfid_number: newTag, factory_id: this.num('factoryId') },
      {
        tone: newTag ? 'active' : 'warn',
        summary: newTag
          ? `New tag ${newTag} scanned — waiting for the old tag`
          : 'Scanned tag is empty — enter the new tag first',
      },
    );
  }

  closeReplacement() {
    if (!this.state.replacementOpen) return;
    this.setState({ replacementOpen: false });
    this.emit('REPLACEMENT_CANCELLED', { new_rfid_number: this.newTag() }, {
      tone: 'neutral',
      summary: 'Replacement cancelled — nothing was sent',
    });
  }

  /** The exact body posted to the replacement endpoint. */
  buildReplacement(oldTag: string, remark: string) {
    return {
      old_rfid_number: oldTag,
      new_rfid_number: this.newTag(),
      replacement_remark: remark,
      factory_id: this.num('factoryId'),
      opname: this.bool('opname'),
    };
  }

  /**
   * Sends the replacement. Refuses an incomplete form rather than posting a
   * half-filled body, and leaves the form open when the endpoint rejects it.
   */
  async submitReplacement(oldTag: string, remark: string): Promise<boolean> {
    const old = oldTag.trim();
    const newTag = this.newTag();
    if (!old || !newTag || !remark) {
      this.emit(
        'REPLACEMENT_INCOMPLETE',
        { old_rfid_number: old, new_rfid_number: newTag, replacement_remark: remark },
        { tone: 'warn', summary: 'Replacement needs the old tag, the new tag and a reason' },
      );
      return false;
    }
    const delivered = await this.dispatch(this.buildReplacement(old, remark), {
      label: `Replacement ${old} → ${newTag}`,
      url: this.replaceUrl(),
      events: { ok: 'REPLACEMENT_SENT', fail: 'REPLACEMENT_FAILED' },
    });
    if (delivered) this.setState({ replacementOpen: false });
    return delivered;
  }

  /** In replacement mode the generated tag replaces the one in the list. */
  addRandomTag() {
    if (!this.replacementActive()) return super.addRandomTag();
    const idHex = randomEpc();
    this.setTagsText(idHex);
    this.emit('TAG_GENERATED', { idHex, tag_count: 1 }, {
      tone: 'neutral',
      summary: `New tag ${idHex} ready for replacement`,
    });
  }

  /** One sweep = one real POST carrying every tag currently in the list. */
  private async sweep() {
    const idHex = this.tags();
    if (idHex.length === 0) {
      this.emit('SCAN_NO_TAG', { reader_id: READER_ID, antenna: this.cfg('antenna') }, {
        tone: 'warn',
        summary: 'Tag list is empty — nothing to send',
      });
      return;
    }
    this.setState({ lastTagCount: idHex.length });
    await this.dispatch(this.buildPayload(idHex), { label: `${idHex.length} tag(s)` });
  }

  samplePayload() {
    return {
      rr_type: 'T1B',
      maker_name: 'check',
      idHex: [
        'E280689400004025A987A05A',
        'E280689400004025AD44841C',
        'E28068940000502B56E4B56D',
      ],
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
