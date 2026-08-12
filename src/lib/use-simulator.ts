import { useSyncExternalStore } from 'react';
import type { AnySimulator } from '../simulators/registry';

/**
 * Binds a simulator to React. The engine mutates its own state and bumps a
 * version counter; that counter is the snapshot, so no state library and no
 * copying of device state into component state.
 */
export function useSimulator(sim: AnySimulator): number {
  return useSyncExternalStore(sim.subscribe, sim.getVersion, sim.getVersion);
}
