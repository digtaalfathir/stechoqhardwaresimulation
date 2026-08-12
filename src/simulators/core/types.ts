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

/** Declarative config form. The workspace renders these — simulators never build UI. */
export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  default: string | number;
  options?: string[];
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  mono?: boolean;
}

export interface ActionDef {
  id: string;
  label: string;
  tone?: 'primary' | 'default' | 'danger';
  hint?: string;
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
export interface TransportFrame {
  protocol: string;
  direction: 'outbound' | 'inbound';
  summary: string;
  detail: string;
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
