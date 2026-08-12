import { Simulator } from '../core/simulator';
import type { ActionDef, ConfigField, SimulatorMeta, StateRow } from '../core/types';
import { httpPost, randomEpc } from '../core/wire';

interface RfidState {
  scanning: boolean;
  lastTag: string | null;
  lastSeenAt: string | null;
  scanCount: number;
  uniqueTags: number;
  batteryPercent: number;
  /** Tags produced by "Generate Random Tag". Kept out of config so the
   *  configuration form is only ever written by the user. */
  generated: string[];
}

/**
 * RFID handheld scanner (Zebra FX/RFD-style).
 *
 * Reads tags either from a configured tag pool or generates EPC Gen2 ids, and
 * POSTs each read to the configured endpoint exactly as the physical reader's
 * middleware would.
 */
export class RfidHandheldSimulator extends Simulator<RfidState> {
  readonly meta: SimulatorMeta = {
    id: 'rfid-handheld',
    name: 'RFID Handheld Scanner',
    category: 'Identification',
    icon: 'rfid',
    tagline: 'Handheld UHF reader that pushes tag reads to an HTTP endpoint.',
    description:
      'Simulates a handheld UHF RFID reader: continuous or single-shot scanning, an antenna selector and a tag pool. Every read produces the same JSON body a physical reader would POST to your backend.',
    protocols: ['REST'],
  };

  readonly configFields: ConfigField[] = [
    { key: 'readerId', label: 'Reader ID', type: 'text', default: 'FX96006A57B4', mono: true, hint: 'Serial reported by the reader' },
    { key: 'antenna', label: 'Antenna', type: 'select', default: '1', options: ['1', '2', '3', '4'] },
    { key: 'endpoint', label: 'API Endpoint', type: 'text', default: 'http://localhost:3000/api/rfid/scan', mono: true, hint: 'Where each read is POSTed' },
    { key: 'interval', label: 'Scan Interval', type: 'number', default: 1200, min: 200, max: 10000, step: 100, hint: 'Milliseconds between reads while scanning' },
    { key: 'readRate', label: 'Read Success Rate', type: 'number', default: 90, min: 0, max: 100, step: 5, hint: '% of scan attempts that return a tag' },
    {
      key: 'tagPool',
      label: 'Tag List',
      type: 'textarea',
      default: 'E28068940000501234567890\nE28068940000501234567891',
      mono: true,
      hint: 'One EPC per line. Leave empty to generate random tags.',
    },
  ];

  readonly actions: ActionDef[] = [
    { id: 'start-scan', label: 'Start Scan', tone: 'primary', hint: 'Read continuously at the configured interval' },
    { id: 'stop-scan', label: 'Stop Scan', hint: 'Halt continuous scanning' },
    { id: 'scan-once', label: 'Scan Once', hint: 'Single trigger pull' },
    { id: 'random-tag', label: 'Generate Random Tag', hint: 'Add a new EPC to the tag pool' },
    { id: 'reset', label: 'Reset', tone: 'danger', hint: 'Back to a freshly connected reader' },
  ];

  private loop: ReturnType<typeof setInterval> | null = null;
  private seen = new Set<string>();

  protected initialState(): RfidState {
    this.loop = null;
    this.seen = new Set();
    return {
      scanning: false,
      lastTag: null,
      lastSeenAt: null,
      scanCount: 0,
      uniqueTags: 0,
      batteryPercent: 98,
      generated: [],
    };
  }

  protected identity() {
    return { reader_id: this.cfg('readerId'), antenna: this.cfg('antenna') };
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
        this.scanOnce();
        break;
      case 'random-tag':
        this.generateTag();
        break;
    }
  }

  private pool(): string[] {
    const configured = this.cfg('tagPool')
      .split('\n')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    return [...configured, ...this.state.generated];
  }

  private startScan() {
    if (this.state.scanning) return;
    this.status = 'SIMULATING';
    this.setState({ scanning: true });
    this.emit('SCAN_STARTED', { reader_id: this.cfg('readerId'), antenna: this.cfg('antenna'), interval_ms: this.num('interval') }, {
      tone: 'active',
      summary: 'Continuous scan started',
    });
    this.loop = this.every(Math.max(200, this.num('interval')), () => this.scanOnce());
  }

  private stopScan() {
    if (!this.state.scanning) return;
    this.stop(this.loop);
    this.loop = null;
    this.status = 'CONNECTED';
    this.setState({ scanning: false });
    this.emit('SCAN_STOPPED', { reader_id: this.cfg('readerId'), tags_read: this.state.scanCount }, {
      tone: 'neutral',
      summary: 'Continuous scan stopped',
    });
  }

  private scanOnce() {
    // A real reader misses tags. Reproducing that is the point of a simulator.
    if (Math.random() * 100 > this.num('readRate')) {
      this.emit('SCAN_NO_TAG', { reader_id: this.cfg('readerId'), antenna: this.cfg('antenna') }, {
        tone: 'warn',
        summary: 'Trigger pulled, no tag in field',
      });
      return;
    }

    const pool = this.pool();
    const idHex = pool.length ? pool[Math.floor(Math.random() * pool.length)] : randomEpc();
    const payload = {
      reader_id: this.cfg('readerId'),
      antenna: this.cfg('antenna'),
      idHex,
      timestamp: new Date().toISOString(),
    };

    this.seen.add(idHex);
    this.setState({
      lastTag: idHex,
      lastSeenAt: payload.timestamp,
      scanCount: this.state.scanCount + 1,
      uniqueTags: this.seen.size,
      batteryPercent: Math.max(0, this.state.batteryPercent - 0.05),
    });
    this.emit('RFID_SCANNED', payload, {
      tone: 'ok',
      summary: `Tag ${idHex.slice(-8)} on antenna ${payload.antenna}`,
      transport: httpPost(this.cfg('endpoint'), payload),
    });
  }

  private generateTag() {
    const idHex = randomEpc();
    this.setState({ generated: [...this.state.generated, idHex] });
    this.emit('TAG_GENERATED', { idHex, pool_size: this.pool().length }, {
      tone: 'neutral',
      summary: `Added ${idHex} to the tag pool`,
    });
  }

  stateRows(): StateRow[] {
    return [
      { label: 'Status', value: this.status, tone: this.status === 'SIMULATING' ? 'active' : this.status === 'CONNECTED' ? 'ok' : 'neutral' },
      { label: 'Reader ID', value: this.cfg('readerId'), mono: true },
      { label: 'Antenna', value: this.cfg('antenna') },
      { label: 'Scanning', value: this.state.scanning ? 'YES' : 'NO', tone: this.state.scanning ? 'active' : 'neutral' },
      { label: 'Last Tag', value: this.state.lastTag ?? '—', mono: true },
      { label: 'Last Read At', value: this.state.lastSeenAt ? this.state.lastSeenAt.slice(11, 19) + 'Z' : '—', mono: true },
      { label: 'Reads', value: String(this.state.scanCount), mono: true },
      { label: 'Unique Tags', value: String(this.state.uniqueTags), mono: true },
      { label: 'Tag Pool', value: `${this.pool().length} tag(s)`, mono: true },
      { label: 'Battery', value: `${this.state.batteryPercent.toFixed(0)}%`, tone: this.state.batteryPercent < 15 ? 'warn' : 'neutral' },
    ];
  }

  samplePayload() {
    return {
      reader_id: 'FX96006A57B4',
      antenna: '1',
      idHex: 'E28068940000501234567890',
      timestamp: '2026-08-13T01:32:10.000Z',
    };
  }
}
