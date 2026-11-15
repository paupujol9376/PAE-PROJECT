// Coarse forecast grid over Sri Lanka (Open-Meteo multi-location), parsing and interpolation.
import type { Frame, GridField } from './types';

/** 0.5° grid: 10 latitudes × 6 longitudes = 60 points (each counts as one Open-Meteo call). */
export const GRID = {
  lats: [5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10],
  lons: [79.5, 80, 80.5, 81, 81.5, 82],
};
export const GRID_BOUNDS: [number, number, number, number] = [79.5, 5.5, 82, 10];

export const HOURLY_VARS = ['precipitation', 'temperature_2m', 'apparent_temperature', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'] as const;
export type HourlyVar = (typeof HOURLY_VARS)[number];

/** Parsed grid: times (ms) and, per variable, per time, the values in GRID order (row-major lat then lon). */
export interface GridSeries {
  fetchedAt: number;
  times: number[];
  data: Record<HourlyVar, (number | null)[][]>; // [timeIndex][pointIndex]
}

export function gridPoints(): { lat: number; lon: number }[] {
  return GRID.lats.flatMap((lat) => GRID.lons.map((lon) => ({ lat, lon })));
}

/** Open-Meteo returns one object per location (same order as requested). */
export function parseOpenMeteo(json: unknown, fetchedAt = Date.now()): GridSeries {
  const list = Array.isArray(json) ? json : [json];
  if (!list.length || !list[0]?.hourly?.time) throw new Error('open-meteo: unexpected response');
  const times: number[] = (list[0].hourly.time as string[]).map((s) => Date.parse(s.endsWith('Z') ? s : `${s}Z`));
  const data = {} as GridSeries['data'];
  for (const v of HOURLY_VARS) {
    data[v] = times.map((_, ti) => list.map((loc: { hourly: Record<string, (number | null)[]> }) => loc.hourly?.[v]?.[ti] ?? null));
  }
  return { fetchedAt, times, data };
}

export function framesFromTimes(times: number[], now = Date.now()): Frame[] {
  const hour = 3600_000;
  return times.map((time) => ({ time, kind: Math.abs(time - now) < hour / 2 ? 'now' : time < now ? 'past' : 'forecast' }));
}

/** Field of one variable at `time`, linearly interpolated between the two surrounding hours. */
export function fieldAt(s: GridSeries, v: HourlyVar, time: number): GridField | null {
  const t = s.times;
  if (!t.length || time < t[0] || time > t[t.length - 1]) return null;
  let i = t.findIndex((x) => x >= time);
  if (t[i] === time || i === 0) return { lats: GRID.lats, lons: GRID.lons, values: s.data[v][i] };
  const a = s.data[v][i - 1], b = s.data[v][i], k = (time - t[i - 1]) / (t[i] - t[i - 1]);
  const values = a.map((x, j) => (x == null || b[j] == null ? x ?? b[j] : v === 'wind_direction_10m' ? lerpAngle(x, b[j]!, k) : x + (b[j]! - x) * k));
  return { lats: GRID.lats, lons: GRID.lons, values };
}

function lerpAngle(a: number, b: number, k: number) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * k + 360) % 360;
}

/** Bilinear value of a grid field at (lat, lon); null outside the grid or with missing corners. */
export function valueAt(f: GridField, lat: number, lon: number): number | null {
  const { lats, lons, values } = f;
  if (lat < lats[0] || lat > lats[lats.length - 1] || lon < lons[0] || lon > lons[lons.length - 1]) return null;
  const i = Math.min(Math.max(lats.findIndex((x) => x >= lat) - 1, 0), lats.length - 2);
  const j = Math.min(Math.max(lons.findIndex((x) => x >= lon) - 1, 0), lons.length - 2);
  const y = (lat - lats[i]) / (lats[i + 1] - lats[i]);
  const x = (lon - lons[j]) / (lons[j + 1] - lons[j]);
  const at = (r: number, c: number) => values[r * lons.length + c];
  const q = [at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1)];
  if (q.some((v) => v == null)) return q.find((v) => v != null) ?? null;
  const [a, b, c, d] = q as number[];
  return a * (1 - x) * (1 - y) + b * x * (1 - y) + c * (1 - x) * y + d * x * y;
}

/** Sum of hourly precipitation over the `hours` before `time` (inclusive), per grid point. */
export function accumulation(s: GridSeries, time: number, hours: number): GridField | null {
  const end = s.times.findIndex((x) => x > time);
  const last = end === -1 ? s.times.length - 1 : end - 1;
  if (last < 0) return null;
  const first = Math.max(0, last - hours + 1);
  const n = GRID.lats.length * GRID.lons.length;
  const values = Array.from({ length: n }, (_, p) => {
    let sum = 0, seen = false;
    for (let ti = first; ti <= last; ti++) { const v = s.data.precipitation[ti][p]; if (v != null) { sum += v; seen = true; } }
    return seen ? sum : null;
  });
  return { lats: GRID.lats, lons: GRID.lons, values };
}

export function compass(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export function trendOf(now: number | null, later: number | null, eps: number): 'up' | 'down' | 'flat' | undefined {
  if (now == null || later == null) return undefined;
  return later - now > eps ? 'up' : now - later > eps ? 'down' : 'flat';
}
