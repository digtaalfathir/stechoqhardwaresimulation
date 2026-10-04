/**
 * Shared vocabulary for every simulator on the platform.
 * Nothing in here knows that React exists — the engine is UI-independent.
 */

export type DeviceStatus = 'OFFLINE' | 'CONNECTED' | 'SIMULATING' | 'ERROR';

export type Category =
  | 'Identification'
  | 'Industrial Tools'
  | 'Vision'
  | 'Factory Devices'
  | 'Communication';

/**
 * Declarative config form. The workspace renders these — simulators never build UI.
 *
 * `combo` is a select you can also type into (a known list of endpoints, plus
 * whatever host you actually run); `switch` is a two-way toggle; `checkbox` is a
 * boolean flag.
 */
/** Ties one field's rendering to the current value of another. */
export interface FieldCondition {
  key: string;
  equals: string | number | boolean;
}

export interface ConfigField {
  key: string;
  label: string;
  /** Only rendered while this condition holds — for mode-specific options. */
  visibleWhen?: FieldCondition;
  /** Locked to `value`, and shown disabled, while this condition holds. */
  forcedWhen?: FieldCondition & { value: string | number | boolean };
  type: 'text' | 'number' | 'select' | 'textarea' | 'combo' | 'switch' | 'checkbox';
  /** Shown so the value is visible, but never editable and never overwritten. */
  readonly?: boolean;
  default: string | number | boolean;
  options?: string[];
  /** Friendlier text for an option whose value must stay machine-readable. */
  optionLabels?: Record<string, string>;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  mono?: boolean;
  placeholder?: string;
}

export interface ActionDef {
  id: string;
  label: string;
  /** Shown instead of `label` while the action is the one currently running. */
  activeLabel?: string;
  tone?: 'primary' | 'default' | 'danger';
  hint?: string;
}

/** Runtime condition of one control, so a button can look like what it is. */
export interface ActionState {
  /** The action cannot do anything right now. */
  disabled?: boolean;
  /** This action is what the device is doing at this moment. */
  active?: boolean;
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'error' | 'active';

/** One row in the "Live Device State" panel. */
export interface StateRow {
  label: string;
  value: string;
  tone?: Tone;
  mono?: boolean;
}

/**
 * What the device would have put on the wire. Kept generic on purpose:
 * REST today, MQTT / TCP / Modbus later without touching the UI.
 */
/** The outcome of a request that was actually put on the network. */
export interface TransportResponse {
  ok: boolean;
  /** 0 when the request never reached the server (blocked, offline, timeout). */
  status: number;
  statusText: string;
  message: string;
  durationMs: number;
  /** Set instead of a status when the browser refused or the host was unreachable. */
  error?: string;
  /** Machine-readable cause, so the UI can localise the explanation. */
  errorCode?: 'timeout' | 'mixed-content' | 'unreachable';
  host?: string;
  timeoutSeconds?: number;
}

export interface TransportFrame {
  protocol: string;
  direction: 'outbound' | 'inbound';
  summary: string;
  detail: string;
  /** True when this frame was really sent, false/absent when only generated. */
  live?: boolean;
  response?: TransportResponse;
}

/** Sends a request for real. Swapped out in tests so they never touch a network. */
export type Sender = (url: string, body: unknown) => Promise<TransportResponse>;

/** What a device has actually put on the network, for the send-result panel. */
export interface Transmission {
  /** A request is in flight right now. */
  sending: boolean;
  sent: number;
  delivered: number;
  failed: number;
  /** Interval fired while the previous request was still going. */
  skipped: number;
  lastResponse: TransportResponse | null;
  lastUrl: string | null;
  lastAt: string | null;
}

export interface SimEvent {
  seq: number;
  name: string;
  device: string;
  timestamp: string;
  tone: Tone;
  summary?: string;
  payload: Record<string, unknown>;
  transport?: TransportFrame;
}

export interface SimulatorMeta {
  id: string;
  name: string;
  category: Category;
  icon: string;
  tagline: string;
  description: string;
  protocols: string[];
}

/** Catalog entry for devices that are planned but not implemented yet. */
export interface PlannedSimulator {
  id: string;
  name: string;
  category: Category;
  icon: string;
  tagline: string;
}
