import type {
  ActionDef,
  ActionState,
  ConfigField,
  DeviceStatus,
  SimEvent,
  SimulatorMeta,
  StateRow,
  Tone,
  TransportFrame,
} from './types';

export type Config = Record<string, string | number | boolean>;

const MAX_EVENTS = 300;

/**
 * Base class for every simulated device.
 *
 * A subclass supplies metadata, a config schema, an action list, its own state
 * shape and the behaviour behind each action. Everything else — subscriptions,
 * the event log, timers, config validation, reset — lives here so that adding a
 * device is one file and no UI work.
 */
export abstract class Simulator<S extends object = Record<string, never>> {
  abstract readonly meta: SimulatorMeta;
  abstract readonly configFields: ConfigField[];
  abstract readonly actions: ActionDef[];

  status: DeviceStatus = 'OFFLINE';
  events: SimEvent[] = [];

  private _config: Config = {};
  private _state?: S;

  /**
   * Config and state are accessors because a device's declarations
   * (`configFields`, `initialState`) are subclass fields, which do not exist yet
   * while the base constructor runs. Reading either one boots the device first,
   * so a fresh instance is safe to read from anywhere — including a card or a
   * docs page that never subscribes to it.
   */
  get config(): Config {
    this.ensureBooted();
    return this._config;
  }

  get state(): S {
    this.ensureBooted();
    return this._state as S;
  }

  set state(next: S) {
    this.ensureBooted();
    this._state = next;
  }

  /** Bumped on every mutation; the React binding uses it as its snapshot. */
  version = 0;

  private listeners = new Set<() => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private seq = 0;
  private booted = false;

  /** Initial device state. Called on construction and on reset(). */
  protected abstract initialState(): S;

  /** Runs one action. Unknown ids are the caller's problem, not the device's. */
  protected abstract onAction(id: string): void;

  /**
   * Whether a control is currently runnable, and whether it is the thing the
   * device is busy doing. Devices with no long-running action need not override
   * it; those that do get buttons that show their own state.
   */
  actionState(_id: string): ActionState {
    return {};
  }

  /** Rows for the "Live Device State" panel. */
  abstract stateRows(): StateRow[];

  /** Sample payload shown in the docs / explorer before the device is started. */
  abstract samplePayload(): Record<string, unknown>;

  // --- lifecycle -----------------------------------------------------------

  private boot() {
    if (this.booted) return;
    this.booted = true;
    this._config = this.defaultConfig();
    this._state = this.initialState();
  }

  defaultConfig(): Config {
    const out: Config = {};
    for (const f of this.configFields) out[f.key] = f.default;
    return out;
  }

  private ensureBooted() {
    if (!this.booted) this.boot();
  }

  subscribe = (fn: () => void) => {
    this.ensureBooted();
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => {
    this.ensureBooted();
    return this.version;
  };

  protected notify() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // --- config --------------------------------------------------------------

  /**
   * Applies a config patch. Values arrive from text inputs, so numbers are
   * coerced and clamped here — the trust boundary between UI and engine.
   */
  applyConfig(patch: Config) {
    this.ensureBooted();
    for (const field of this.configFields) {
      // Read-only fields are display-only: not even a programmatic patch moves them.
      if (field.readonly) continue;
      if (!(field.key in patch)) continue;
      const raw = patch[field.key];
      if (field.type === 'number') {
        const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
        if (!Number.isFinite(n)) continue;
        const min = field.min ?? -Infinity;
        const max = field.max ?? Infinity;
        this.config[field.key] = Math.min(max, Math.max(min, n));
      } else if (field.type === 'select' || field.type === 'switch') {
        // A fixed list: anything outside it is rejected, not coerced.
        const v = String(raw);
        if (field.options && !field.options.includes(v)) continue;
        this.config[field.key] = v;
      } else if (field.type === 'checkbox') {
        this.config[field.key] = raw === true || raw === 'true';
      } else {
        // text / textarea / combo — a combo's whole point is free entry.
        this.config[field.key] = String(raw);
      }
    }
    if (this.status === 'OFFLINE') this.status = 'CONNECTED';
    this.onConfigApplied();
    this.emit('DEVICE_CONFIGURED', { ...this.config }, { tone: 'neutral', summary: 'Configuration applied' });
  }

  /** Hook for devices whose state mirrors config (channel count, ids, ...). */
  protected onConfigApplied() {}

  cfg(key: string): string {
    return String(this.config[key] ?? '');
  }

  num(key: string): number {
    return Number(this.config[key] ?? 0);
  }

  bool(key: string): boolean {
    return this.config[key] === true;
  }

  // --- actions -------------------------------------------------------------

  run(id: string) {
    this.ensureBooted();
    if (id === 'reset') {
      this.reset();
      return;
    }
    // Nothing runs before the device is configured and brought online. The UI
    // locks these controls; this guard covers every other caller.
    if (this.status === 'OFFLINE') {
      this.emit('DEVICE_OFFLINE', { device_id: this.deviceId(), action: id }, {
        tone: 'warn',
        summary: `Ignored ${id} — apply the configuration first`,
      });
      return;
    }
    this.onAction(id);
    this.notify();
  }

  connect() {
    this.status = 'CONNECTED';
    this.emit('DEVICE_CONNECTED', { device_id: this.deviceId(), ...this.identity() }, {
      tone: 'ok',
      summary: 'Device connected',
    });
  }

  reset() {
    this.ensureBooted();
    this.clearTimers();
    this.state = this.initialState();
    this.status = 'CONNECTED';
    this.emit('DEVICE_RESET', { device_id: this.deviceId() }, { tone: 'warn', summary: 'Simulator reset' });
  }

  /** Identity fields worth putting in connect/reset payloads. */
  protected identity(): Record<string, unknown> {
    return {};
  }

  deviceId(): string {
    return this.meta.id;
  }

  // --- state & events ------------------------------------------------------

  protected setState(patch: Partial<S>) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  protected emit(
    name: string,
    payload: Record<string, unknown>,
    opts: { tone?: Tone; summary?: string; transport?: TransportFrame } = {},
  ) {
    const event: SimEvent = {
      seq: ++this.seq,
      name,
      device: this.meta.id,
      timestamp: new Date().toISOString(),
      tone: opts.tone ?? 'neutral',
      summary: opts.summary,
      payload,
      transport: opts.transport,
    };
    this.events = [event, ...this.events].slice(0, MAX_EVENTS);
    this.notify();
  }

  clearEvents() {
    this.events = [];
    this.notify();
  }

  fail(message: string, payload: Record<string, unknown> = {}) {
    this.clearTimers();
    this.status = 'ERROR';
    this.emit('DEVICE_ERROR', { device_id: this.deviceId(), message, ...payload }, {
      tone: 'error',
      summary: message,
    });
  }

  // --- timers --------------------------------------------------------------
  // Registered centrally so navigating away or resetting can never leave a
  // runaway interval behind.

  protected every(ms: number, fn: () => void) {
    const id = setInterval(fn, ms);
    this.timers.add(id);
    return id;
  }

  protected after(ms: number, fn: () => void) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  protected stop(id: ReturnType<typeof setTimeout> | null) {
    if (id === null) return;
    clearTimeout(id);
    clearInterval(id as ReturnType<typeof setInterval>);
    this.timers.delete(id);
  }

  clearTimers() {
    for (const id of this.timers) {
      clearTimeout(id);
      clearInterval(id as ReturnType<typeof setInterval>);
    }
    this.timers.clear();
  }
}
