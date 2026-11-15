// Colour ramps for model fields (drawn client-side). Chosen to stay readable on the dark map
// and to sit under the school dots; each ramp is the layer's legend too.
import type { LegendStop } from './types';

export const RAIN_RAMP: LegendStop[] = [
  { value: 0.2, color: '#1b4f8a' }, { value: 1, color: '#2a7fd4' }, { value: 2.5, color: '#29b6c9' },
  { value: 5, color: '#4fd18b' }, { value: 10, color: '#f2d64b' }, { value: 20, color: '#f28c28' }, { value: 40, color: '#e5383b' },
];
export const ACCUM_RAMP: LegendStop[] = [
  { value: 5, color: '#1b4f8a' }, { value: 25, color: '#2a7fd4' }, { value: 50, color: '#29b6c9' },
  { value: 100, color: '#f2d64b' }, { value: 150, color: '#f28c28' }, { value: 250, color: '#e5383b' },
];
export const TEMP_RAMP: LegendStop[] = [
  { value: 20, color: '#2a7fd4' }, { value: 25, color: '#4fd18b' }, { value: 30, color: '#f2d64b' },
  { value: 35, color: '#f28c28' }, { value: 40, color: '#e5383b' }, { value: 45, color: '#9b1d64' },
];
export const WIND_RAMP: LegendStop[] = [
  { value: 10, color: '#9ec5ff' }, { value: 30, color: '#4fd18b' }, { value: 50, color: '#f2d64b' },
  { value: 70, color: '#f28c28' }, { value: 90, color: '#e5383b' },
];
export const WAVE_RAMP: LegendStop[] = [
  { value: 0.5, color: '#2a7fd4' }, { value: 1.5, color: '#29b6c9' }, { value: 2.5, color: '#f2d64b' },
  { value: 4, color: '#f28c28' }, { value: 6, color: '#e5383b' },
];

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** RGBA for a value: transparent below the first stop, linear between stops. */
export function rampColor(stops: LegendStop[], v: number | null, alpha = 200): [number, number, number, number] {
  if (v == null || v < stops[0].value) return [0, 0, 0, 0];
  for (let i = 1; i < stops.length; i++) {
    if (v < stops[i].value) {
      const k = (v - stops[i - 1].value) / (stops[i].value - stops[i - 1].value);
      const a = hex(stops[i - 1].color), b = hex(stops[i].color);
      return [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * k)).concat(alpha) as [number, number, number, number];
    }
  }
  return [...hex(stops[stops.length - 1].color), alpha] as [number, number, number, number];
}
