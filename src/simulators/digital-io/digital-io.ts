import { Simulator } from '../core/simulator';
import type { ActionDef, ConfigField, SimulatorMeta, StateRow, Tone, TransportFrame } from '../core/types';
import { modbusWrite, mqttPublish } from '../core/wire';

export type ChannelKind = 'DI' | 'DO';

/** A Modbus TCP ADU as it would sit on the wire, MBAP header first. */
export interface ModbusAdu {
  fc: number;
  /** What this frame is, for people: "FC05 write DO03 ON". */
  note: string;
  bytes: number[];
}

interface DioState {
  inputs: boolean[];
  outputs: boolean[];
  changes: number;
  /** Per channel: how many times it changed, and when it last did. */
  hits: Record<ChannelKind, number[]>;
  at: Record<ChannelKind, (string | null)[]>;
  /** The last Modbus frame and the transaction id it used. */
  adu: ModbusAdu | null;
  tid: number;
}

/** The Modbus unit id the module answers to. */
export const UNIT_ID = 1;

/** Channel states packed LSB first, eight to a byte, as FC02 / FC15 carry them. */
export function packBits(bits: boolean[]): number[] {
  const out = Array<number>(Math.ceil(bits.length / 8)).fill(0);
  bits.forEach((on, i) => {
    if (on) out[i >> 3] |= 1 << (i & 7);
  });
  return out;
}

/** MBAP header (transaction, protocol 0, length, unit) in front of a PDU. */
export function modbusAdu(tid: number, pdu: number[]): number[] {
  const len = pdu.length + 1;
  return [(tid >> 8) & 0xff, tid & 0xff, 0, 0, len >> 8, len & 0xff, UNIT_ID, ...pdu];
}

/**
 * Digital I/O controller.
 *
 * A block of discrete inputs and outputs — the shape shared by an ESP32 board,
 * a W5500 I/O module, a Modbus TCP coupler or a remote I/O rack. Toggling a
 * channel emits the same change notification the real module would push.
 */
export class DigitalIoSimulator extends Simulator<DioState> {
  readonly meta: SimulatorMeta = {
    id: 'digital-io',
    name: 'Digital I/O Controller',
    category: 'Industrial Tools',
    icon: 'io',
    tagline: 'An ESP32 + W5500 I/O box with field sensors and actuators wired to it, its Modbus map and every frame.',
    description:
      'Simulates a discrete I/O module: toggle any input or output and watch the change notification your backend receives. The same model covers an ESP32 board, a W5500 module or a Modbus TCP coupler — only the transport differs. On REST the change is really posted to your endpoint and the response is shown; Modbus and MQTT frames are generated, because a browser cannot open those sockets.',
    protocols: ['Modbus TCP', 'REST', 'MQTT'],
  };

  readonly configFields: ConfigField[] = [
    { key: 'deviceId', label: 'Device ID', type: 'text', default: 'DIO-01', mono: true },
    { key: 'channels', label: 'Channel Count', type: 'select', default: '8', options: ['4', '8', '16'], hint: 'Inputs and outputs per block' },
    { key: 'transport', label: 'Transport', type: 'select', default: 'Modbus TCP', options: ['Modbus TCP', 'REST', 'MQTT'] },
    {
      key: 'ip',
      label: 'IP Address',
      type: 'text',
      default: '192.168.1.60',
      mono: true,
      visibleWhen: { key: 'transport', equals: 'Modbus TCP' },
    },
    {
      key: 'port',
      label: 'Port',
      type: 'number',
      default: 502,
      min: 1,
      max: 65535,
      step: 1,
      visibleWhen: { key: 'transport', equals: 'Modbus TCP' },
    },
    {
      key: 'endpoint',
      label: 'REST Endpoint',
      type: 'text',
      default: 'http://localhost:3000/api/io/state',
      mono: true,
      visibleWhen: { key: 'transport', equals: 'REST' },
      hint: 'Each change is really posted here',
    },
    {
      key: 'topic',
      label: 'MQTT Topic',
      type: 'text',
      default: 'factory/line1/io/DIO-01',
      mono: true,
      visibleWhen: { key: 'transport', equals: 'MQTT' },
      hint: 'Frame is generated, not published',
    },
  ];

  readonly actions: ActionDef[] = [
    { id: 'randomize-inputs', label: 'Randomize Inputs', tone: 'primary', hint: 'Simulate field sensors changing at once' },
    { id: 'pulse-output', label: 'Pulse DO01', hint: 'Turn DO01 on for 600 ms' },
    { id: 'all-outputs-off', label: 'All Outputs OFF', hint: 'Drop every output' },
    { id: 'reset', label: 'Reset', tone: 'danger', hint: 'All channels back to OFF' },
  ];

  protected initialState(): DioState {
    const n = this.channelCount();
    return {
      inputs: Array(n).fill(false),
      outputs: Array(n).fill(false),
      changes: 0,
      hits: { DI: Array(n).fill(0), DO: Array(n).fill(0) },
      at: { DI: Array(n).fill(null), DO: Array(n).fill(null) },
      adu: null,
      tid: 0,
    };
  }

  private channelCount(): number {
    const n = Number(this.config.channels ?? 8);
    return Number.isFinite(n) && n > 0 ? n : 8;
  }

  /** Channel count is config-driven, so the state arrays have to follow it. */
  protected onConfigApplied() {
    const n = this.channelCount();
    const fit = <T,>(arr: T[], empty: T) => Array.from({ length: n }, (_, i) => arr[i] ?? empty);
    const st = this.state;
    this.state = {
      ...st,
      inputs: fit(st.inputs, false),
      outputs: fit(st.outputs, false),
      hits: { DI: fit(st.hits.DI, 0), DO: fit(st.hits.DO, 0) },
      at: { DI: fit(st.at.DI, null), DO: fit(st.at.DO, null) },
    };
  }

  /** Count the change on each channel that moved and stamp it. */
  private mark(kind: ChannelKind, moved: number[]) {
    if (!moved.length) return;
    const now = new Date().toISOString();
    const hits = [...this.state.hits[kind]];
    const at = [...this.state.at[kind]];
    for (const i of moved) {
      hits[i]++;
      at[i] = now;
    }
    this.setState({ hits: { ...this.state.hits, [kind]: hits }, at: { ...this.state.at, [kind]: at } });
  }

  /** Keep the Modbus frame this change puts on the wire, whatever the transport. */
  private frameAdu(fc: number, note: string, pdu: number[]) {
    const tid = (this.state.tid + 1) & 0xffff;
    this.setState({ tid, adu: { fc, note, bytes: modbusAdu(tid, [fc, ...pdu]) } });
  }

  /** FC02 response: the whole input block, as the master reads it after a change. */
  private inputsAdu(note: string) {
    const data = packBits(this.state.inputs);
    this.frameAdu(0x02, note, [data.length, ...data]);
  }

  protected identity() {
    return { device_id: this.cfg('deviceId'), channels: this.channelCount() };
  }

  protected onAction(id: string) {
    switch (id) {
      case 'randomize-inputs':
        this.randomizeInputs();
        break;
      case 'pulse-output':
        this.pulseOutput();
        break;
      case 'all-outputs-off':
        this.allOutputsOff();
        break;
    }
  }

  /** Public: the channel grid in the workspace calls this directly. */
  toggle(kind: ChannelKind, index: number) {
    const key = kind === 'DI' ? 'inputs' : 'outputs';
    const list = this.state[key];
    if (index < 0 || index >= list.length) return;
    if (this.status === 'OFFLINE') return;
    const next = [...list];
    next[index] = !next[index];
    this.setState({ [key]: next } as Partial<DioState>);
    this.setState({ changes: this.state.changes + 1 });
    this.mark(kind, [index]);
    const name = this.channelName(kind, index);
    if (kind === 'DI') this.inputsAdu(`FC02 response · ${name} ${next[index] ? 'ON' : 'OFF'}`);
    else this.frameAdu(0x05, `FC05 write ${name} ${next[index] ? 'ON' : 'OFF'}`, [0, index, next[index] ? 0xff : 0, 0]);
    this.emitChange(kind, index, list[index], next[index]);
  }

  /** Drive a channel to a level: a push button held down, then let go. */
  set(kind: ChannelKind, index: number, on: boolean) {
    const list = kind === 'DI' ? this.state.inputs : this.state.outputs;
    if (list[index] !== undefined && list[index] !== on) this.toggle(kind, index);
  }

  channelName(kind: ChannelKind, index: number): string {
    return `${kind}${String(index + 1).padStart(2, '0')}`;
  }

  private emitChange(kind: ChannelKind, index: number, from: boolean, to: boolean) {
    const channel = this.channelName(kind, index);
    const payload = {
      device_id: this.cfg('deviceId'),
      channel,
      direction: kind === 'DI' ? 'input' : 'output',
      from: from ? 'ON' : 'OFF',
      to: to ? 'ON' : 'OFF',
      value: to ? 1 : 0,
      timestamp: new Date().toISOString(),
    };
    this.report(
      kind === 'DI' ? 'DI_CHANGED' : 'DO_CHANGED',
      payload,
      `${channel} changed: ${payload.from} → ${payload.to}`,
      to ? 'ok' : 'neutral',
      // Modbus: inputs live in the discrete-input table, outputs are coils.
      {
        fn: kind === 'DI' ? 'FC02 Read Discrete Inputs' : 'FC05 Write Single Coil',
        address: (kind === 'DI' ? 10001 : 1) + index,
        value: to ? 1 : 0,
      },
    );
  }

  restMode(): boolean {
    return this.cfg('transport') === 'REST';
  }

  /**
   * On REST the change is a real request, so the outcome comes from the server.
   * The other transports need a socket a browser does not have, so their frames
   * are generated and the event says what would have gone out.
   */
  private report(
    name: string,
    payload: Record<string, unknown>,
    summary: string,
    tone: Tone,
    modbus: { fn: string; address: number; value: number },
  ) {
    if (this.restMode()) {
      // A toggle is a click: never drop it just because another is in flight.
      void this.dispatch(payload, {
        label: summary,
        url: this.cfg('endpoint'),
        events: { ok: name, fail: 'IO_SEND_FAILED' },
        coalesce: false,
      });
      return;
    }
    this.emit(name, payload, { tone, summary, transport: this.frame(payload, modbus) });
  }

  /** The frame a non-REST transport would have put on the wire. */
  private frame(
    payload: Record<string, unknown>,
    modbus: { fn: string; address: number; value: number },
  ): TransportFrame {
    if (this.cfg('transport') === 'MQTT') return mqttPublish(this.cfg('topic'), payload);
    return modbusWrite(this.cfg('ip'), this.num('port'), modbus.fn, modbus.address, modbus.value);
  }

  private randomizeInputs() {
    const before = this.state.inputs;
    const after = before.map(() => Math.random() < 0.4);
    this.setState({ inputs: after, changes: this.state.changes + 1 });
    this.mark('DI', after.flatMap((v, i) => (v !== before[i] ? [i] : [])));
    this.inputsAdu('FC02 response · inputs randomized');
    const changed = after
      .map((v, i) => ({ channel: this.channelName('DI', i), from: before[i] ? 'ON' : 'OFF', to: v ? 'ON' : 'OFF' }))
      .filter((_, i) => before[i] !== after[i]);
    const payload = {
      device_id: this.cfg('deviceId'),
      changed,
      inputs: this.wordOf(after),
      timestamp: new Date().toISOString(),
    };
    this.report(
      'DI_BULK_CHANGED',
      payload,
      changed.length ? `${changed.length} input(s) changed` : 'Inputs unchanged',
      'active',
      { fn: `FC02 Read Discrete Inputs ×${after.length}`, address: 10001, value: this.wordValue(after) },
    );
  }

  private pulseOutput() {
    if (this.state.outputs.length === 0) return;
    if (!this.state.outputs[0]) this.toggle('DO', 0);
    this.after(600, () => {
      if (this.state.outputs[0]) this.toggle('DO', 0);
    });
  }

  private allOutputsOff() {
    const before = this.state.outputs;
    if (!before.some(Boolean)) return;
    this.setState({ outputs: before.map(() => false), changes: this.state.changes + 1 });
    this.mark('DO', before.flatMap((v, i) => (v ? [i] : [])));
    const n = before.length;
    const data = packBits(this.state.outputs);
    this.frameAdu(0x0f, `FC15 write ${n} coils OFF`, [0, 0, n >> 8, n & 0xff, data.length, ...data]);
    const payload = {
      device_id: this.cfg('deviceId'),
      outputs: this.wordOf(this.state.outputs),
      timestamp: new Date().toISOString(),
    };
    this.report('DO_ALL_CLEARED', payload, 'All outputs dropped to OFF', 'warn', {
      fn: `FC15 Write Multiple Coils ×${before.length}`,
      address: 1,
      value: 0,
    });
  }

  /** Channel states packed into the register word a fieldbus would carry. */
  private wordValue(channels: boolean[]): number {
    const bits = channels.map((v) => (v ? '1' : '0')).reverse().join('');
    return parseInt(bits, 2) || 0;
  }

  wordOf(channels: boolean[]): string {
    return `0x${this.wordValue(channels).toString(16).toUpperCase().padStart(4, '0')}`;
  }

  stateRows(): StateRow[] {
    const on = (arr: boolean[]) => arr.filter(Boolean).length;
    return [
      { label: 'Status', value: this.status, tone: this.status === 'CONNECTED' ? 'ok' : this.status === 'ERROR' ? 'error' : 'neutral' },
      { label: 'Device ID', value: this.cfg('deviceId'), mono: true },
      { label: 'Channels', value: `${this.channelCount()} DI / ${this.channelCount()} DO`, mono: true },
      { label: 'Inputs ON', value: `${on(this.state.inputs)} / ${this.state.inputs.length}`, mono: true },
      { label: 'Outputs ON', value: `${on(this.state.outputs)} / ${this.state.outputs.length}`, mono: true },
      { label: 'Input Word', value: this.wordOf(this.state.inputs), mono: true },
      { label: 'Output Word', value: this.wordOf(this.state.outputs), mono: true },
      { label: 'Transitions', value: String(this.state.changes), mono: true },
      {
        label: 'Transport',
        value: this.restMode()
          ? `REST · ${this.cfg('endpoint')}`
          : `${this.cfg('transport')} · ${this.cfg('ip')}:${this.num('port')}`,
        mono: true,
      },
      {
        label: 'Reporting',
        value: this.restMode() ? 'REALLY SENT' : 'FRAME GENERATED',
        tone: this.restMode() ? 'ok' : 'neutral',
      },
    ];
  }

  samplePayload() {
    return {
      device_id: 'DIO-01',
      channel: 'DI02',
      direction: 'input',
      from: 'OFF',
      to: 'ON',
      value: 1,
      timestamp: '2026-08-13T01:32:10.000Z',
    };
  }
}
