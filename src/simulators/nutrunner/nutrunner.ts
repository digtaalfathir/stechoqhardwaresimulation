import { Simulator } from '../core/simulator';
import type {
  ActionDef,
  ActionState,
  ConfigField,
  SimulatorMeta,
  StateRow,
  TransportFrame,
} from '../core/types';
import { jitter, round } from '../core/wire';
import {
  MID_0002_FIELDS,
  MID_0061_FIELDS,
  MID_0071_FIELDS,
  numField,
  opTimestamp,
  renderConversation,
  telegram,
  textField,
  type WireTelegram,
} from './open-protocol';

export type Phase = 'IDLE' | 'READY' | 'TIGHTENING' | 'OK' | 'NG' | 'ERROR';

/** Open Protocol reports each limit separately, so the UI can too. */
export type LimitStatus = 'LOW' | 'OK' | 'HIGH';

const LIMIT_CODE: Record<LimitStatus, number> = { LOW: 0, OK: 1, HIGH: 2 };

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
  torqueStatus: LimitStatus | null;
  angleStatus: LimitStatus | null;
  /** Open Protocol batch counter, reset once the batch completes. */
  batchCounter: number;
  batchDone: boolean;
  /** MID 0061 field 23 — increments for every reported fastening. */
  tighteningId: number;
}

const STEPS = 14;
const STEP_MS = 90;

/** Alarm codes a controller raises, reported as MID 0071. */
const ALARMS: [string, string][] = [
  ['E851', 'Spindle overcurrent'],
  ['E807', 'Angle encoder fault'],
  ['E844', 'Calibration expired'],
];

/**
 * Nutrunner / tightening tool speaking Open Protocol.
 *
 * Runs a torque and angle ramp toward the target, judges each limit the way a
 * controller does (Low / OK / High per limit, the fastening is OK only when
 * both are), and reports the result as a real MID 0061 telegram inside a real
 * session: MID 0001/0002 handshake, MID 0060 subscribe, MID 0062 acknowledge.
 *
 * The telegrams are generated, not sent — a browser cannot open a TCP socket to
 * port 4545. Everything above the socket is faithful, so a consumer's parser can
 * be checked byte for byte against what this produces.
 */
export class NutrunnerSimulator extends Simulator<NutrunnerState> {
  readonly meta: SimulatorMeta = {
    id: 'nutrunner',
    name: 'Nutrunner / Tightening Tool',
    category: 'Industrial Tools',
    icon: 'wrench',
    tagline: 'Torque-controlled tightening reported as real Open Protocol MID 0061 telegrams.',
    description:
      'Simulates a tightening controller speaking Open Protocol: a torque and angle ramp toward the target, judged per limit the way a real controller judges it, then reported as a byte-accurate MID 0061 telegram inside a real session (MID 0001/0002 handshake, MID 0060 subscribe, MID 0062 acknowledge). Forced NG, low and high torque, and tool alarms are one click away. Telegrams are generated for inspection — a browser cannot open a TCP socket to port 4545.',
    protocols: ['Open Protocol'],
  };

  readonly configFields: ConfigField[] = [
    { key: 'ip', label: 'Controller IP', type: 'text', default: '192.168.1.50', mono: true },
    {
      key: 'port',
      label: 'Port',
      type: 'number',
      default: 4545,
      min: 1,
      max: 65535,
      step: 1,
      hint: 'Open Protocol default is 4545',
    },
    {
      key: 'controllerName',
      label: 'Controller Name',
      type: 'text',
      default: 'STECHOQ NTR-01',
      mono: true,
      hint: 'MID 0061 field 03, 25 characters',
    },
    { key: 'cellId', label: 'Cell ID', type: 'number', default: 1, min: 0, max: 9999, step: 1 },
    { key: 'channelId', label: 'Channel ID', type: 'number', default: 1, min: 0, max: 99, step: 1 },
    { key: 'jobId', label: 'Job ID', type: 'number', default: 0, min: 0, max: 99, step: 1, hint: '0 = no job' },
    { key: 'psetId', label: 'Parameter Set', type: 'number', default: 1, min: 0, max: 999, step: 1 },
    {
      key: 'batchSize',
      label: 'Batch Size',
      type: 'number',
      default: 5,
      min: 0,
      max: 9999,
      step: 1,
      hint: 'Fastenings per batch, 0 = no batch',
    },
    {
      key: 'vin',
      label: 'VIN Number',
      type: 'text',
      default: '',
      mono: true,
      placeholder: 'e.g. JMP2026000123',
      hint: 'MID 0061 field 04, may be empty',
    },
    { key: 'targetTorque', label: 'Target Torque', type: 'number', default: 42.5, min: 0.1, max: 5000, step: 0.5 },
    {
      key: 'tolerance',
      label: 'Torque Tolerance',
      type: 'number',
      default: 8,
      min: 0,
      max: 50,
      step: 1,
      hint: 'Sets the min / max torque limits, in %',
    },
    { key: 'targetAngle', label: 'Target Angle', type: 'number', default: 128, min: 1, max: 3600, step: 1, hint: 'Degrees' },
    {
      key: 'angleTolerance',
      label: 'Angle Tolerance',
      type: 'number',
      default: 15,
      min: 0,
      max: 90,
      step: 1,
      hint: 'Sets the min / max angle limits, in %',
    },
    {
      key: 'torqueUnit',
      label: 'Torque Unit',
      type: 'select',
      default: 'Nm',
      options: ['Nm', 'lbf-ft', 'kgf-cm'],
      hint: 'Display only — MID 0061 sends torque x100 with no unit field',
    },
  ];

  readonly actions: ActionDef[] = [
    {
      id: 'start-tightening',
      label: 'Start Tightening',
      activeLabel: 'Tightening…',
      tone: 'primary',
      hint: 'Run a normal cycle',
    },
    { id: 'force-ok', label: 'Force OK', hint: 'Cycle that lands inside both limits' },
    { id: 'force-ng', label: 'Force NG', hint: 'Cycle that breaks a torque or angle limit' },
    { id: 'trigger-error', label: 'Trigger Alarm', tone: 'danger', hint: 'Tool alarm, reported as MID 0071' },
    { id: 'reset', label: 'Reset', tone: 'danger', hint: 'Clear the alarm and the batch counter' },
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
      torqueStatus: null,
      angleStatus: null,
      batchCounter: 0,
      batchDone: false,
      tighteningId: 0,
    };
  }

  protected identity() {
    return {
      cell_id: this.num('cellId'),
      channel_id: this.num('channelId'),
      controller_name: this.cfg('controllerName'),
    };
  }

  /** The session is open for as long as the controller is online. */
  session(): 'SUBSCRIBED' | 'CLOSED' {
    return this.status === 'OFFLINE' ? 'CLOSED' : 'SUBSCRIBED';
  }

  // --- limits ---------------------------------------------------------------

  torqueLimits() {
    const target = this.num('targetTorque');
    const tol = this.num('tolerance') / 100;
    return { min: round(target * (1 - tol), 2), max: round(target * (1 + tol), 2), target };
  }

  angleLimits() {
    const target = this.num('targetAngle');
    const tol = this.num('angleTolerance') / 100;
    return { min: Math.round(target * (1 - tol)), max: Math.round(target * (1 + tol)), target };
  }

  private judge(value: number, min: number, max: number): LimitStatus {
    if (value < min) return 'LOW';
    if (value > max) return 'HIGH';
    return 'OK';
  }

  // --- session --------------------------------------------------------------

  /**
   * Applying the configuration is what opens the session, so the handshake and
   * the subscribe land in the log exactly where a real client would send them.
   */
  protected onConfigApplied() {
    const host = this.cfg('ip');
    const port = this.num('port');
    const station = this.num('cellId');
    const spindle = this.num('channelId');

    const start = telegram({ mid: 1, stationId: station, spindleId: spindle });
    const startAck = telegram(
      { mid: 2, stationId: station, spindleId: spindle },
      numField(1, this.num('cellId'), 4) +
        numField(2, this.num('channelId'), 2) +
        textField(3, this.cfg('controllerName'), 25),
    );
    const subscribe = telegram({ mid: 60, stationId: station, spindleId: spindle });
    const accepted = telegram({ mid: 5, stationId: station, spindleId: spindle }, '0060');

    const conversation: WireTelegram[] = [
      { direction: 'TX', frame: start, note: 'client opens the session' },
      { direction: 'RX', frame: startAck, fields: MID_0002_FIELDS, note: 'controller identifies itself' },
      { direction: 'TX', frame: subscribe, note: 'subscribe to last tightening result' },
      { direction: 'RX', frame: accepted, note: 'subscription accepted' },
    ];

    this.emit(
      'SESSION_OPENED',
      {
        controller: `${host}:${port}`,
        cell_id: this.num('cellId'),
        channel_id: this.num('channelId'),
        controller_name: this.cfg('controllerName'),
        subscribed_to: 'MID 0061',
      },
      {
        tone: 'ok',
        summary: `Open Protocol session opened — subscribed to MID 0061`,
        transport: this.frame(host, port, 'MID 0001/0002/0060/0005 session start', conversation),
      },
    );
  }

  private frame(host: string, port: number, summary: string, telegrams: WireTelegram[]): TransportFrame {
    return {
      protocol: 'Open Protocol',
      direction: 'outbound',
      summary: `${host}:${port} · ${summary}`,
      detail: renderConversation(host, port, telegrams),
    };
  }

  // --- cycle ----------------------------------------------------------------

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
        this.triggerAlarm();
        break;
    }
  }

  private startCycle(outcome: 'auto' | 'ok' | 'ng') {
    if (this.state.phase === 'TIGHTENING') return;

    const torqueBand = this.torqueLimits();
    const angleBand = this.angleLimits();
    const tol = this.num('tolerance') / 100;

    // Where this fastening will actually end up.
    let finalTorque = torqueBand.target;
    let finalAngle = angleBand.target;
    if (outcome === 'ok') {
      finalTorque = torqueBand.target * (1 + jitter(tol * 0.5));
      finalAngle = angleBand.target * (1 + jitter(this.num('angleTolerance') / 100 / 2));
    } else if (outcome === 'ng') {
      // A real NG breaks one limit at a time: too soft, too hard, or the angle.
      const mode = Math.floor(Math.random() * 3);
      if (mode === 0) finalTorque = torqueBand.min * 0.85;
      else if (mode === 1) finalTorque = torqueBand.max * 1.15;
      else {
        finalTorque = torqueBand.target * (1 + jitter(tol * 0.5));
        finalAngle = Math.random() < 0.5 ? angleBand.min * 0.7 : angleBand.max * 1.3;
      }
    } else {
      finalTorque = torqueBand.target * (1 + jitter(tol * 1.1));
      finalAngle = angleBand.target * (1 + jitter(0.09));
    }
    finalTorque = round(Math.max(0, finalTorque), 2);
    finalAngle = Math.max(1, Math.round(finalAngle));

    this.status = 'SIMULATING';
    this.setState({ phase: 'TIGHTENING', torque: 0, angle: 0, curve: [], progress: 0, errorCode: null });
    this.emit(
      'TIGHTENING_STARTED',
      {
        controller_name: this.cfg('controllerName'),
        cell_id: this.num('cellId'),
        channel_id: this.num('channelId'),
        pset_id: this.num('psetId'),
        torque_target: torqueBand.target,
        angle_target: angleBand.target,
        timestamp: new Date().toISOString(),
      },
      { tone: 'active', summary: `Cycle ${this.state.cycle + 1} started on Pset ${this.num('psetId')}` },
    );

    let step = 0;
    const tick = this.every(STEP_MS, () => {
      step++;
      const t = step / STEPS;
      // Rundown then torque build-up: slow start, steep finish.
      const torque = round(finalTorque * Math.min(1, t ** 2.2), 2);
      const angle = Math.round(finalAngle * Math.min(1, t ** 0.75));
      this.setState({ torque, angle, curve: [...this.state.curve, torque], progress: Math.min(1, t) });
      if (step >= STEPS) {
        this.stop(tick);
        this.finish(finalTorque, finalAngle);
      }
    });
  }

  private finish(torque: number, angle: number) {
    const torqueBand = this.torqueLimits();
    const angleBand = this.angleLimits();
    const torqueStatus = this.judge(torque, torqueBand.min, torqueBand.max);
    const angleStatus = this.judge(angle, angleBand.min, angleBand.max);
    const result: 'OK' | 'NG' = torqueStatus === 'OK' && angleStatus === 'OK' ? 'OK' : 'NG';

    // Open Protocol counts a batch by its OK fastenings; the counter rolls over
    // once the batch is complete.
    const batchSize = this.num('batchSize');
    let batchCounter = this.state.batchCounter + (result === 'OK' ? 1 : 0);
    const batchDone = batchSize > 0 && batchCounter >= batchSize;
    if (batchDone) batchCounter = batchSize;

    const cycle = this.state.cycle + 1;
    const tighteningId = this.state.tighteningId + 1;

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
      torqueStatus,
      angleStatus,
      batchCounter,
      batchDone,
      tighteningId,
    });

    const at = new Date();
    const payload = {
      cell_id: this.num('cellId'),
      channel_id: this.num('channelId'),
      controller_name: this.cfg('controllerName'),
      vin: this.cfg('vin'),
      job_id: this.num('jobId'),
      pset_id: this.num('psetId'),
      batch_size: batchSize,
      batch_counter: batchCounter,
      tightening_status: result,
      torque_status: torqueStatus,
      angle_status: angleStatus,
      torque_min: torqueBand.min,
      torque_max: torqueBand.max,
      torque_target: torqueBand.target,
      torque,
      angle_min: angleBand.min,
      angle_max: angleBand.max,
      angle_target: angleBand.target,
      angle,
      batch_status: batchDone ? 'OK' : 'NOK',
      tightening_id: tighteningId,
      timestamp: at.toISOString(),
    };

    const host = this.cfg('ip');
    const port = this.num('port');
    const result0061 = this.mid0061(payload, at);
    const ack = telegram({ mid: 62, stationId: this.num('cellId'), spindleId: this.num('channelId') });

    const reason = result === 'OK' ? '' : ` (torque ${torqueStatus}, angle ${angleStatus})`;
    this.emit('TIGHTENING_RESULT', payload, {
      tone: result === 'OK' ? 'ok' : 'error',
      summary: `${result}${reason} — ${torque.toFixed(2)} ${this.cfg('torqueUnit')} at ${angle}°`,
      transport: this.frame(host, port, `MID 0061 result #${tighteningId} — ${result}`, [
        { direction: 'RX', frame: result0061, fields: MID_0061_FIELDS, note: 'last tightening result' },
        { direction: 'TX', frame: ack, note: 'client acknowledges the result' },
      ]),
    });

    if (batchDone) {
      this.setState({ batchCounter: 0 });
      this.emit(
        'BATCH_COMPLETED',
        { pset_id: this.num('psetId'), batch_size: batchSize, tightening_id: tighteningId },
        { tone: 'ok', summary: `Batch complete — ${batchSize} OK fastening(s)` },
      );
    }
  }

  /** MID 0061 revision 1, built field by field in the order the spec lists. */
  private mid0061(p: Record<string, unknown>, at: Date): string {
    const centi = (value: number) => Math.round(Number(value) * 100);
    const data =
      numField(1, Number(p.cell_id), 4) +
      numField(2, Number(p.channel_id), 2) +
      textField(3, String(p.controller_name), 25) +
      textField(4, String(p.vin), 25) +
      numField(5, Number(p.job_id), 2) +
      numField(6, Number(p.pset_id), 3) +
      numField(7, Number(p.batch_size), 4) +
      numField(8, Number(p.batch_counter), 4) +
      numField(9, p.tightening_status === 'OK' ? 1 : 0, 1) +
      numField(10, LIMIT_CODE[p.torque_status as LimitStatus], 1) +
      numField(11, LIMIT_CODE[p.angle_status as LimitStatus], 1) +
      numField(12, centi(Number(p.torque_min)), 6) +
      numField(13, centi(Number(p.torque_max)), 6) +
      numField(14, centi(Number(p.torque_target)), 6) +
      numField(15, centi(Number(p.torque)), 6) +
      numField(16, Number(p.angle_min), 5) +
      numField(17, Number(p.angle_max), 5) +
      numField(18, Number(p.angle_target), 5) +
      numField(19, Number(p.angle), 5) +
      textField(20, opTimestamp(at), 19) +
      textField(21, opTimestamp(at), 19) +
      numField(22, p.batch_status === 'OK' ? 1 : 0, 1) +
      numField(23, Number(p.tightening_id), 10);
    return telegram(
      { mid: 61, revision: 1, stationId: this.num('cellId'), spindleId: this.num('channelId') },
      data,
    );
  }

  private triggerAlarm() {
    const [code, description] = ALARMS[Math.floor(Math.random() * ALARMS.length)];
    const at = new Date();
    this.clearTimers();
    this.status = 'ERROR';
    this.setState({ phase: 'ERROR', errorCode: `${code} ${description}`, progress: 0 });

    const alarm = telegram(
      { mid: 71, stationId: this.num('cellId'), spindleId: this.num('channelId') },
      textField(1, code, 4) + numField(2, 1, 1) + numField(3, 0, 1) + textField(4, opTimestamp(at), 19),
    );
    const ack = telegram({ mid: 72, stationId: this.num('cellId'), spindleId: this.num('channelId') });

    this.emit(
      'DEVICE_ERROR',
      {
        error_code: code,
        message: description,
        controller_ready: true,
        tool_ready: false,
        timestamp: at.toISOString(),
      },
      {
        tone: 'error',
        summary: `${code} ${description}`,
        transport: this.frame(this.cfg('ip'), this.num('port'), `MID 0071 alarm ${code}`, [
          { direction: 'RX', frame: alarm, fields: MID_0071_FIELDS, note: 'controller raises an alarm' },
          { direction: 'TX', frame: ack, note: 'client acknowledges the alarm' },
        ]),
      },
    );
  }

  // --- readouts -------------------------------------------------------------

  stateRows(): StateRow[] {
    const unit = this.cfg('torqueUnit');
    const { min: tMin, max: tMax } = this.torqueLimits();
    const { min: aMin, max: aMax } = this.angleLimits();
    const phaseTone = {
      OK: 'ok',
      NG: 'error',
      ERROR: 'error',
      TIGHTENING: 'active',
      READY: 'neutral',
      IDLE: 'neutral',
    } as const;
    const limitTone = (s: LimitStatus | null) => (s === 'OK' ? 'ok' : s ? 'error' : 'neutral');
    const batchSize = this.num('batchSize');

    return [
      { label: 'Phase', value: this.state.phase, tone: phaseTone[this.state.phase] },
      { label: 'Session', value: this.session(), tone: this.session() === 'SUBSCRIBED' ? 'ok' : 'neutral' },
      { label: 'Controller', value: this.cfg('controllerName'), mono: true },
      { label: 'Cell / Channel', value: `${this.num('cellId')} / ${this.num('channelId')}`, mono: true },
      { label: 'Pset / Job', value: `${this.num('psetId')} / ${this.num('jobId')}`, mono: true },
      {
        label: 'Batch',
        value: batchSize > 0 ? `${this.state.batchCounter} / ${batchSize}` : 'no batch',
        mono: true,
        tone: this.state.batchDone ? 'ok' : 'neutral',
      },
      { label: 'Torque', value: `${this.state.torque.toFixed(2)} ${unit}`, mono: true },
      { label: 'Torque Status', value: this.state.torqueStatus ?? '—', tone: limitTone(this.state.torqueStatus) },
      { label: 'Torque Limits', value: `${tMin} … ${tMax} ${unit}`, mono: true },
      { label: 'Angle', value: `${this.state.angle}°`, mono: true },
      { label: 'Angle Status', value: this.state.angleStatus ?? '—', tone: limitTone(this.state.angleStatus) },
      { label: 'Angle Limits', value: `${aMin} … ${aMax}°`, mono: true },
      {
        label: 'Last Result',
        value: this.state.lastResult ?? '—',
        tone: this.state.lastResult === 'NG' ? 'error' : this.state.lastResult ? 'ok' : 'neutral',
      },
      { label: 'Tightening ID', value: String(this.state.tighteningId), mono: true },
      {
        label: 'Cycles',
        value: `${this.state.cycle}  (${this.state.okCount} OK / ${this.state.ngCount} NG)`,
        mono: true,
      },
      { label: 'Controller Address', value: `${this.cfg('ip')}:${this.num('port')}`, mono: true },
      ...(this.state.errorCode
        ? [{ label: 'Alarm', value: this.state.errorCode, tone: 'error' as const, mono: true }]
        : []),
    ];
  }

  samplePayload() {
    return {
      cell_id: 1,
      channel_id: 1,
      controller_name: 'STECHOQ NTR-01',
      vin: '',
      job_id: 0,
      pset_id: 1,
      batch_size: 5,
      batch_counter: 3,
      tightening_status: 'OK',
      torque_status: 'OK',
      angle_status: 'OK',
      torque_min: 39.1,
      torque_max: 45.9,
      torque_target: 42.5,
      torque: 42.63,
      angle_min: 109,
      angle_max: 147,
      angle_target: 128,
      angle: 126,
      batch_status: 'NOK',
      tightening_id: 3,
      timestamp: '2026-08-13T01:32:10.000Z',
    };
  }
}
