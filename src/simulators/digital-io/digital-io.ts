import { Simulator } from '../core/simulator';
import type { ActionDef, ConfigField, SimulatorMeta, StateRow, TransportFrame } from '../core/types';
import { httpPost, modbusWrite, mqttPublish } from '../core/wire';

export type ChannelKind = 'DI' | 'DO';

interface DioState {
  inputs: boolean[];
  outputs: boolean[];
  changes: number;
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
    tagline: 'Discrete input / output block with per-channel toggles and change events.',
    description:
      'Simulates a discrete I/O module: toggle any input or output and watch the change notification your backend would receive. The same model covers an ESP32 board, a W5500 module or a Modbus TCP coupler — only the transport differs.',
    protocols: ['Modbus TCP', 'REST', 'MQTT'],
  };

  readonly configFields: ConfigField[] = [
    { key: 'deviceId', label: 'Device ID', type: 'text', default: 'DIO-01', mono: true },
    { key: 'channels', label: 'Channel Count', type: 'select', default: '8', options: ['4', '8', '16'], hint: 'Inputs and outputs per block' },
    { key: 'transport', label: 'Transport', type: 'select', default: 'Modbus TCP', options: ['Modbus TCP', 'REST', 'MQTT'] },
    { key: 'ip', label: 'IP Address', type: 'text', default: '192.168.1.60', mono: true },
    { key: 'port', label: 'Port', type: 'number', default: 502, min: 1, max: 65535, step: 1 },
    { key: 'endpoint', label: 'REST Endpoint', type: 'text', default: 'http://localhost:3000/api/io/state', mono: true, hint: 'Used when transport is REST' },
    { key: 'topic', label: 'MQTT Topic', type: 'text', default: 'factory/line1/io/DIO-01', mono: true, hint: 'Used when transport is MQTT' },
  ];

  readonly actions: ActionDef[] = [
    { id: 'randomize-inputs', label: 'Randomize Inputs', tone: 'primary', hint: 'Simulate field sensors changing at once' },
    { id: 'pulse-output', label: 'Pulse DO01', hint: 'Turn DO01 on for 600 ms' },
    { id: 'all-outputs-off', label: 'All Outputs OFF', hint: 'Drop every output' },
    { id: 'reset', label: 'Reset', tone: 'danger', hint: 'All channels back to OFF' },
  ];

  protected initialState(): DioState {
    const n = this.channelCount();
    return { inputs: Array(n).fill(false), outputs: Array(n).fill(false), changes: 0 };
  }

  private channelCount(): number {
    const n = Number(this.config.channels ?? 8);
    return Number.isFinite(n) && n > 0 ? n : 8;
  }

  /** Channel count is config-driven, so the state arrays have to follow it. */
  protected onConfigApplied() {
    const n = this.channelCount();
    const fit = (arr: boolean[]) => Array.from({ length: n }, (_, i) => arr[i] ?? false);
    this.state = { ...this.state, inputs: fit(this.state.inputs), outputs: fit(this.state.outputs) };
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
    if (this.status === 'OFFLINE') this.connect();
    const next = [...list];
    next[index] = !next[index];
    this.setState({ [key]: next } as Partial<DioState>);
    this.setState({ changes: this.state.changes + 1 });
    this.emitChange(kind, index, list[index], next[index]);
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
    this.emit(kind === 'DI' ? 'DI_CHANGED' : 'DO_CHANGED', payload, {
      tone: to ? 'ok' : 'neutral',
      summary: `${channel} changed: ${payload.from} → ${payload.to}`,
      // Modbus: inputs live in the discrete-input table, outputs are coils.
      transport: this.frame(payload, {
        fn: kind === 'DI' ? 'FC02 Read Discrete Inputs' : 'FC05 Write Single Coil',
        address: (kind === 'DI' ? 10001 : 1) + index,
        value: to ? 1 : 0,
      }),
    });
  }

  /** Same change, framed for whichever transport the module is configured with. */
  private frame(
    payload: Record<string, unknown>,
    modbus: { fn: string; address: number; value: number },
  ): TransportFrame {
    const transport = this.cfg('transport');
    if (transport === 'REST') return httpPost(this.cfg('endpoint'), payload);
    if (transport === 'MQTT') return mqttPublish(this.cfg('topic'), payload);
    return modbusWrite(this.cfg('ip'), this.num('port'), modbus.fn, modbus.address, modbus.value);
  }

  private randomizeInputs() {
    const before = this.state.inputs;
    const after = before.map(() => Math.random() < 0.4);
    this.setState({ inputs: after, changes: this.state.changes + 1 });
    const changed = after
      .map((v, i) => ({ channel: this.channelName('DI', i), from: before[i] ? 'ON' : 'OFF', to: v ? 'ON' : 'OFF' }))
      .filter((_, i) => before[i] !== after[i]);
    const payload = {
      device_id: this.cfg('deviceId'),
      changed,
      inputs: this.wordOf(after),
      timestamp: new Date().toISOString(),
    };
    this.emit('DI_BULK_CHANGED', payload, {
      tone: 'active',
      summary: changed.length ? `${changed.length} input(s) changed` : 'Inputs unchanged',
      transport: this.frame(payload, {
        fn: `FC02 Read Discrete Inputs ×${after.length}`,
        address: 10001,
        value: this.wordValue(after),
      }),
    });
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
    const payload = {
      device_id: this.cfg('deviceId'),
      outputs: this.wordOf(this.state.outputs),
      timestamp: new Date().toISOString(),
    };
    this.emit('DO_ALL_CLEARED', payload, {
      tone: 'warn',
      summary: 'All outputs dropped to OFF',
      transport: this.frame(payload, {
        fn: `FC15 Write Multiple Coils ×${before.length}`,
        address: 1,
        value: 0,
      }),
    });
  }

  /** Channel states packed into the register word a fieldbus would carry. */
  private wordValue(channels: boolean[]): number {
    const bits = channels.map((v) => (v ? '1' : '0')).reverse().join('');
    return parseInt(bits, 2) || 0;
  }

  private wordOf(channels: boolean[]): string {
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
      { label: 'Transport', value: `${this.cfg('transport')} · ${this.cfg('ip')}:${this.num('port')}`, mono: true },
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
