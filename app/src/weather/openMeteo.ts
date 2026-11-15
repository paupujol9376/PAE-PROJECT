// Shared Open-Meteo data for every model-based layer (rain forecast, accumulation, wind,
// temperature) plus the marine points (waves). One download serves all of them.
//
// Open-Meteo free API: non-commercial use only, < 10 000 calls/day, CC BY 4.0
// (https://open-meteo.com/en/terms). Each location in a multi-location request counts as a call:
// the 60-point grid costs 60 calls per refresh. Refresh is hourly (models update hourly).
// With many users, set VITE_WEATHER_PROXY_URL: server/ downloads once and serves everyone.
import { fetchWithCache } from './cache';
import { gridPoints, HOURLY_VARS, parseOpenMeteo, type GridSeries } from './grid';

const PROXY = import.meta.env.VITE_WEATHER_PROXY_URL as string | undefined;

/** Coastal sea points around Sri Lanka for waves (the marine model has no values on land). */
export const COAST_POINTS: [number, number][] = [
  [9.9, 79.9], [9.6, 80.6], [9.1, 81.1], [8.6, 81.4], [8.0, 81.8], [7.4, 82.0], [6.8, 81.95], [6.3, 81.5],
  [5.85, 81.0], [5.85, 80.5], [6.0, 80.05], [6.5, 79.8], [7.1, 79.75], [7.7, 79.7], [8.3, 79.65], [8.9, 79.75],
];

export interface MarineSeries { fetchedAt: number; times: number[]; height: (number | null)[][]; period: (number | null)[][] }

export interface ModelState { grid: GridSeries | null; marine: MarineSeries | null; savedAt: number | null; stale: boolean }
let state: ModelState = { grid: null, marine: null, savedAt: null, stale: false };
let inflight: Promise<ModelState> | null = null;
let lastLoad = 0;

function gridUrl() {
  if (PROXY) return `${PROXY.replace(/\/$/, '')}/api/weather/grid`;
  const pts = gridPoints();
  const q = new URLSearchParams({
    latitude: pts.map((p) => p.lat).join(','), longitude: pts.map((p) => p.lon).join(','),
    hourly: HOURLY_VARS.join(','), past_days: '3', forecast_days: '2', timezone: 'UTC', wind_speed_unit: 'kmh',
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

function marineUrl() {
  if (PROXY) return `${PROXY.replace(/\/$/, '')}/api/weather/marine`;
  const q = new URLSearchParams({
    latitude: COAST_POINTS.map((p) => p[0]).join(','), longitude: COAST_POINTS.map((p) => p[1]).join(','),
    hourly: 'wave_height,wave_period', past_days: '1', forecast_days: '2', timezone: 'UTC',
  });
  return `https://marine-api.open-meteo.com/v1/marine?${q}`;
}

export function parseMarine(json: unknown, fetchedAt = Date.now()): MarineSeries {
  const list = (Array.isArray(json) ? json : [json]) as { hourly: { time: string[]; wave_height: (number | null)[]; wave_period: (number | null)[] } }[];
  if (!list[0]?.hourly?.time) throw new Error('marine: unexpected response');
  const times = list[0].hourly.time.map((s) => Date.parse(`${s}Z`));
  return {
    fetchedAt, times,
    height: times.map((_, i) => list.map((l) => l.hourly.wave_height?.[i] ?? null)),
    period: times.map((_, i) => list.map((l) => l.hourly.wave_period?.[i] ?? null)),
  };
}

async function getJson(url: string, signal?: AbortSignal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Loads (at most once per `maxAgeMin`) the grid and the marine points. Never throws. */
export async function loadModels(signal?: AbortSignal, maxAgeMin = 60): Promise<ModelState> {
  if (inflight) return inflight;
  if (state.grid && Date.now() - lastLoad < maxAgeMin * 60_000) return state;
  inflight = (async () => {
    const [g, m] = await Promise.all([
      fetchWithCache('om-grid', async () => parseOpenMeteo(await getJson(gridUrl(), signal))),
      fetchWithCache('om-marine', async () => parseMarine(await getJson(marineUrl(), signal))),
    ]);
    lastLoad = Date.now();
    state = { grid: g?.value ?? state.grid, marine: m?.value ?? state.marine, savedAt: g?.savedAt ?? null, stale: !!g?.stale };
    return state;
  })().finally(() => (inflight = null));
  return inflight;
}

export const models = () => state;
/** For tests. */
export function _resetModels() { state = { grid: null, marine: null, savedAt: null, stale: false }; lastLoad = 0; inflight = null; }

export const OPEN_METEO_ATTRIBUTION = { text: 'Weather data by Open-Meteo.com (CC BY 4.0)', url: 'https://open-meteo.com/' };
