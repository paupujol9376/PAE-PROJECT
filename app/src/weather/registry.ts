// Layer registry. Providers call registerLayer() from their own file in ./providers;
// ./layers.ts imports every provider file automatically (import.meta.glob), so adding a
// phenomenon never touches the panel, the player or the map code.
import type { WeatherProvider } from './types';

const layers = new Map<string, WeatherProvider>();

export function registerLayer(p: WeatherProvider) {
  if (layers.has(p.id)) throw new Error(`weather layer "${p.id}" registered twice`);
  if (p.status === 'disabled' && !p.disabledReasonKey) throw new Error(`disabled layer "${p.id}" needs a reason`);
  layers.set(p.id, p);
}

export function allLayers(): WeatherProvider[] {
  return [...layers.values()].sort((a, b) => a.order - b.order);
}

export function getLayer(id: string) {
  return layers.get(id);
}

/** For tests only. */
export function _clearRegistry() {
  layers.clear();
}
