import type { Simulator } from './core/simulator';
import type { Category, PlannedSimulator } from './core/types';
import { RfidHandheldSimulator } from './rfid/rfid-handheld';
import { RfidReaderSimulator } from './rfid/rfid-reader';

export type AnySimulator = Simulator<any>;

/**
 * The one place the platform learns about devices.
 *
 * Instances are module-level singletons so a simulation keeps running while the
 * user browses elsewhere. Adding a device = one class + one line here.
 */
export const simulators: AnySimulator[] = [
  new RfidHandheldSimulator(),
  new RfidReaderSimulator(),
];

export function getSimulator(id: string | undefined): AnySimulator | undefined {
  return simulators.find((s) => s.meta.id === id);
}

export const CATEGORIES: Category[] = [
  'Identification',
  'Industrial Tools',
  'Vision',
  'Factory Devices',
  'Communication',
];

/** Declared in the catalog, not implemented yet. Shown as locked cards. */
export const plannedSimulators: PlannedSimulator[] = [
  { id: 'barcode-scanner', name: 'Barcode Scanner', category: 'Identification', icon: 'barcode', tagline: 'Keyboard-wedge and TCP barcode input.' },
  { id: 'vin-scanner', name: 'VIN Scanner', category: 'Identification', icon: 'car', tagline: 'Vehicle identification capture and validation.' },
  { id: 'nutrunner', name: 'Nutrunner / Tightening Tool', category: 'Industrial Tools', icon: 'wrench', tagline: 'Torque-controlled tightening with OK / NG judgement and result reporting.' },
  { id: 'digital-io', name: 'Digital I/O Controller', category: 'Industrial Tools', icon: 'io', tagline: 'Discrete input / output block with per-channel toggles and change events.' },
  { id: 'torque-tool', name: 'Torque Tool', category: 'Industrial Tools', icon: 'gauge', tagline: 'Hand tool with torque and angle traces.' },
  { id: 'industrial-camera', name: 'Industrial Camera', category: 'Vision', icon: 'camera', tagline: 'Trigger, exposure and image metadata.' },
  { id: 'vision-inspection', name: 'Vision Inspection Device', category: 'Vision', icon: 'eye', tagline: 'Pass / fail inspection with defect regions.' },
  { id: 'conveyor', name: 'Conveyor', category: 'Factory Devices', icon: 'conveyor', tagline: 'Belt speed, occupancy and stop conditions.' },
  { id: 'plc', name: 'PLC', category: 'Factory Devices', icon: 'cpu', tagline: 'Tag table, scan cycle and register access.' },
  { id: 'sensor', name: 'Sensor', category: 'Factory Devices', icon: 'gauge', tagline: 'Analog signal with noise, drift and alarms.' },
  { id: 'tester', name: 'Tester', category: 'Factory Devices', icon: 'check', tagline: 'End-of-line test station with verdicts.' },
  { id: 'rest-device', name: 'REST API Device', category: 'Communication', icon: 'braces', tagline: 'Generic device exposed over HTTP.' },
  { id: 'tcp-device', name: 'TCP Device', category: 'Communication', icon: 'plug', tagline: 'Raw socket framing and keep-alive.' },
  { id: 'mqtt-device', name: 'MQTT Device', category: 'Communication', icon: 'broadcast', tagline: 'Topics, QoS and last-will messages.' },
  { id: 'modbus-device', name: 'Modbus TCP Device', category: 'Communication', icon: 'grid', tagline: 'Coils, registers and function codes.' },
];

export function categoryCounts(category: Category) {
  return {
    live: simulators.filter((s) => s.meta.category === category).length,
    planned: plannedSimulators.filter((s) => s.category === category).length,
  };
}
