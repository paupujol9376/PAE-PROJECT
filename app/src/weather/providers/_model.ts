// Shared helpers for Open-Meteo grid layers (not a layer itself: files starting with "_" are helpers).
import { models, loadModels } from '../openMeteo';
import { fieldAt, framesFromTimes, valueAt, type HourlyVar } from '../grid';
import type { Frame } from '../types';

export async function modelFrames(signal?: AbortSignal): Promise<Frame[]> {
  const s = await loadModels(signal);
  if (!s.grid) throw new Error('no model data');
  const now = Date.now();
  return framesFromTimes(s.grid.times, now).filter((f) => f.time >= now - 6 * 3600_000 && f.time <= now + 24 * 3600_000);
}

export function modelValue(v: HourlyVar, lat: number, lon: number, time: number): number | null {
  const g = models().grid;
  const f = g && fieldAt(g, v, time);
  return f ? valueAt(f, lat, lon) : null;
}

export const modelDataTime = () => models().savedAt;
