import { Simulator } from '../core/simulator';
import type {
  ActionDef,
  ActionState,
  ConfigField,
  SimulatorMeta,
  StateRow,
  TransportFrame,
} from '../core/types';
import { httpPost, jitter, modbusWrite, round, tcpFrame } from '../core/wire';

export type Phase = 'IDLE' | 'READY' | 'TIGHTENING' | 'OK' | 'NG' | 'ERROR';

/** Phase order used by the workspace visualisation. */
export const PHASE_CHAIN: Phase[] = ['IDLE', 'READY', 'TIGHTENING', 'OK'];

interface NutrunnerState {
  phase: Phase;
  torque: number;
  angle: number;
  curve: number[];
  progress: number;
  cycle: number;
  lastResult: 'OK' | 'NG' | null;
  okCount: number;
  ngCount: number;
  errorCode: string | null;
}

const STEPS = 14;
const STEP_MS = 90;

/**
 * Nutrunner / tightening tool.
 *
 * Runs a torque ramp against a target, judges the result against a tolerance
 * band and reports it over the configured protocol (Open Protocol MID 0061,
 * Modbus TCP holding registers, or a REST POST).
 */
export class NutrunnerSimulator extends Simulator<NutrunnerState> {
  readonly meta: SimulatorMeta = {
    id: 'nutrunner',
    name: 'Nutrunner / Tightening Tool',
    category: 'Industrial Tools',
    icon: 'wrench',
    tagline: 'Torque-controlled tightening with OK / NG judgement and result reporting.',
    description:
      'Simulates a tightening spindle: runs a torque and angle ramp toward the target, judges the fastening against a tolerance band, and reports the result the way a real controller would — including forced NG and tool error cases that are hard to reproduce on a line.',
    protocols: ['Open Protocol', 'Modbus TCP', 'REST'],
  };

  readonly configFields: ConfigField[] = [
    { key: 'toolId', label: 'Tool ID', type: 'text', default: 'NTR-001', mono: true },
    { key: 'stationId', label: 'Station ID', type: 'text', default: 'ST-01', mono: true },
    { key: 'targetTorque', label: 'Target Torque', type: 'number', default: 42.5, min: 0.1, max: 5000, step: 0.5 },
    { key: 'targetAngle', label: 'Target Angle', type: 'number', default: 128, min: 1, max: 3600, step: 1, hint: 'Degrees' },
    { key: 'torqueUnit', label: 'Torque Unit', type: 'select', default: 'Nm', options: ['Nm', 'lbf-ft', 'kgf-cm'] },
    { key: 'tolerance', label: 'Tolerance', type: 'number', default: 8, min: 0, max: 50, step: 1, hint: '± % window used to judge OK / NG' },
    { key: 'protocol', label: 'Protocol', type: 'select', default: 'Open Protocol', options: ['Open Protocol', 'Modbus TCP', 'REST'] },
    { key: 'ip', label: 'IP Address', type: 'text', default: '192.168.1.50', mono: true },
    { key: 'port', label: 'Port', type: 'number', default: 4545, min: 1, max: 65535, step: 1 },
    { key: 'endpoint', label: 'REST Endpoint', type: 'text', default: 'http://localhost:3000/api/tightening/result', mono: true, hint: 'Used when protocol is REST' },
  ];

  readonly actions: ActionDef[] = [
    {
      id: 'start-tightening',
      label: 'Start Tightening',
      activeLabel: 'Tightening…',
      tone: 'primary',
      hint: 'Run a normal cycle',
    },
    { id: 'force-ok', label: 'Force OK', hint: 'Cycle that lands inside the tolerance band' },
    { id: 'force-ng', label: 'Force NG', hint: 'Cycle that lands outside the tolerance band' },
    { id: 'trigger-error', label: 'Trigger Error', tone: 'danger', hint: 'Tool fault mid-cycle' },
    { id: 'reset', label: 'Reset', tone: 'danger', hint: 'Clear the fault and return to READY' },
  ];

  actionState(id: string): ActionState {
    const running = this.state.phase === 'TIGHTENING';
    switch (id) {
      case 'start-tightening':
        return { active: running, disabled: running };
      case 'force-ok':
      case 'force-ng':
        return { disabled: running };
      default:
        return {};
    }
  }

  protected initialState(): NutrunnerState {
    return {
      phase: 'READY',
      torque: 0,
      angle: 0,
      curve: [],
      progress: 0,
      cycle: 0,
      lastResult: null,
      okCount: 0,
      ngCount: 0,
      errorCode: null,
    };
  }

  protected identity() {
    return { tool_id: this.cfg('toolId'), station_id: this.cfg('stationId') };
  }

  protected onAction(id: string) {
    switch (id) {
      case 'start-tightening':
        this.startCycle('auto');
        break;
      case 'force-ok':
        this.startCycle('ok');
        break;
      case 'force-ng':
        this.startCycle('ng');
        break;
      case 'trigger-error':
        this.triggerError();
        break;
    }
  }

  private startCycle(outcome: 'auto' | 'ok' | 'ng') {
    if (this.state.phase === 'TIGHTENING') return;

    const target = this.num('targetTorque');
    const targetAngle = this.num('targetAngle');
    const tolerance = this.num('tolerance') / 100;

    // Where this fastening will actually end up.
    let finalTorque: number;
    if (outcome === 'ok') finalTorque = target * (1 + jitter(tolerance * 0.5));
    else if (outcome === 'ng') finalTorque = target * (Math.random() < 0.5 ? 1 - tolerance * 2.2 : 1 + tolerance * 2.4);
    else finalTorque = target * (1 + jitter(tolerance * 1.1));
    finalTorque = round(Math.max(0, finalTorque), 1);
    const finalAngle = Math.max(1, Math.round(targetAngle * (1 + jitter(0.09))));

    this.status = 'SIMULATING';
    this.setState({ phase: 'TIGHTENING', torque: 0, angle: 0, curve: [], progress: 0, errorCode: null });
    this.emit(
      'TIGHTENING_STARTED',
      {
        tool_id: this.cfg('toolId'),
        station_id: this.cfg('stationId'),
        target_torque: target,
        target_angle: targetAngle,
        torque_unit: this.cfg('torqueUnit'),
        timestamp: new Date().toISOString(),
      },
      { tone: 'active', summary: `Cycle ${this.state.cycle + 1} started` },
    );

    let step = 0;
    const tick = this.every(STEP_MS, () => {
      step++;
      const t = step / STEPS;
      // Rundown then torque build-up: slow start, steep finish.
      const torque = round(finalTorque * Math.min(1, t ** 2.2), 1);
      const angle = Math.round(finalAngle * Math.min(1, t ** 0.75));
      const curve = [...this.state.curve, torque];
      this.setState({ torque, angle, curve, progress: Math.min(1, t) });
      if (step >= STEPS) {
        this.stop(tick);
        this.finish(finalTorque, finalAngle, target, tolerance);
      }
    });
  }

  private finish(torque: number, angle: number, target: number, tolerance: number) {
    const withinBand = Math.abs(torque - target) <= target * tolerance;
    const result: 'OK' | 'NG' = withinBand ? 'OK' : 'NG';
    const cycle = this.state.cycle + 1;

    this.status = 'CONNECTED';
    this.setState({
      phase: result,
      torque,
      angle,
      progress: 1,
      cycle,
      lastResult: result,
      okCount: this.state.okCount + (result === 'OK' ? 1 : 0),
      ngCount: this.state.ngCount + (result === 'NG' ? 1 : 0),
    });

    const payload = {
      tool_id: this.cfg('toolId'),
      station_id: this.cfg('stationId'),
      result,
      torque,
      angle,
      timestamp: new Date().toISOString(),
      torque_unit: this.cfg('torqueUnit'),
      target_torque: target,
      tolerance_percent: this.num('tolerance'),
      cycle,
    };

    this.emit('TIGHTENING_RESULT', payload, {
      tone: result === 'OK' ? 'ok' : 'error',
      summary: `${result} — ${torque} ${this.cfg('torqueUnit')} at ${angle}°`,
      transport: this.frame(payload),
    });
  }

  /** Same result, whichever protocol the controller is configured to speak. */
  private frame(payload: Record<string, unknown>): TransportFrame {
    const protocol = this.cfg('protocol');
    if (protocol === 'REST') return httpPost(this.cfg('endpoint'), payload);
    if (protocol === 'Modbus TCP') {
      return modbusWrite(
        this.cfg('ip'),
        this.num('port'),
        'FC16 Write Multiple Registers',
        40001,
        Math.round(Number(payload.torque) * 10),
      );
    }
    // Open Protocol MID 0061 — last tightening result, subscribed by the line PLC.
    const body =
      `${'0061'}` +
      `01${String(payload.station_id).padEnd(4, ' ')}` +
      `02${String(payload.tool_id).padEnd(8, ' ')}` +
      `03${payload.result === 'OK' ? '1' : '0'}` +
      `04${String(Math.round(Number(payload.torque) * 100)).padStart(6, '0')}` +
      `05${String(payload.angle).padStart(5, '0')}`;
    const text = `${String(body.length + 20).padStart(4, '0')}0061001         ${body} `;
    return tcpFrame(this.cfg('ip'), this.num('port'), text);
  }

  private triggerError() {
    const codes = ['E21 SPINDLE OVERCURRENT', 'E07 ANGLE ENCODER FAULT', 'E44 CALIBRATION EXPIRED'];
    const errorCode = codes[Math.floor(Math.random() * codes.length)];
    this.clearTimers();
    this.setState({ phase: 'ERROR', errorCode, progress: 0 });
    this.fail(errorCode, {
      tool_id: this.cfg('toolId'),
      station_id: this.cfg('stationId'),
      error_code: errorCode.split(' ')[0],
    });
  }

  stateRows(): StateRow[] {
    const unit = this.cfg('torqueUnit');
    const phaseTone = { OK: 'ok', NG: 'error', ERROR: 'error', TIGHTENING: 'active', READY: 'neutral', IDLE: 'neutral' } as const;
    return [
      { label: 'Phase', value: this.state.phase, tone: phaseTone[this.state.phase] },
      { label: 'Tool ID', value: this.cfg('toolId'), mono: true },
      { label: 'Station', value: this.cfg('stationId'), mono: true },
      { label: 'Torque', value: `${this.state.torque.toFixed(1)} ${unit}`, mono: true },
      { label: 'Angle', value: `${this.state.angle}°`, mono: true },
      { label: 'Target', value: `${this.num('targetTorque')} ${unit} ± ${this.num('tolerance')}%`, mono: true },
      { label: 'Last Result', value: this.state.lastResult ?? '—', tone: this.state.lastResult === 'NG' ? 'error' : this.state.lastResult ? 'ok' : 'neutral' },
      { label: 'Cycles', value: `${this.state.cycle}  (${this.state.okCount} OK / ${this.state.ngCount} NG)`, mono: true },
      { label: 'Protocol', value: `${this.cfg('protocol')} · ${this.cfg('ip')}:${this.num('port')}`, mono: true },
      ...(this.state.errorCode ? [{ label: 'Fault', value: this.state.errorCode, tone: 'error' as const, mono: true }] : []),
    ];
  }

  samplePayload() {
    return {
      tool_id: 'NTR-001',
      station_id: 'ST-01',
      result: 'OK',
      torque: 42.5,
      angle: 128,
      timestamp: '2026-08-13T01:32:10.000Z',
    };
  }
}
