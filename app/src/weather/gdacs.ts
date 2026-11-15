// GDACS (UN OCHA + European Commission JRC): global disaster alerts, no key, CORS enabled.
// Used for tropical cyclones (track, wind buffers, forecast cone) and official alerts
// (floods, cyclones) affecting Sri Lanka. https://www.gdacs.org/gdacsapi/swagger/index.html
import type { Feature, FeatureCollection } from 'geojson';
import { fetchWithCache } from './cache';

const API = 'https://www.gdacs.org/gdacsapi/api';
/** Bay of Bengal + Arabian Sea + surroundings: cyclones that can reach Sri Lanka. */
export const NORTH_INDIAN_OCEAN: [number, number, number, number] = [45, -5, 100, 25];

export interface GdacsEvent {
  id: number; episode: number; type: string; name: string; level: 'Green' | 'Orange' | 'Red';
  from: string; to: string; modified: string; current: boolean; countries: string; source: string;
  lon: number; lat: number; reportUrl: string; geometryUrl?: string;
}

export function parseEvents(json: unknown): GdacsEvent[] {
  const fc = json as FeatureCollection | null;
  if (!fc?.features) return [];
  return fc.features.flatMap((f: Feature) => {
    const p = f.properties as Record<string, any>;
    if (f.geometry?.type !== 'Point' || !p) return [];
    const [lon, lat] = (f.geometry as { coordinates: number[] }).coordinates;
    return [{
      id: p.eventid, episode: p.episodeid, type: p.eventtype, name: p.name ?? p.eventname, level: p.alertlevel,
      from: p.fromdate, to: p.todate, modified: p.datemodified, current: String(p.iscurrent) === 'true',
      countries: p.country ?? '', source: p.source ?? '', lon, lat,
      reportUrl: p.url?.report ?? 'https://www.gdacs.org/', geometryUrl: p.url?.geometry,
    }];
  });
}

export const LEVEL_COLOR: Record<string, string> = { Green: '#4fd18b', Orange: '#f28c28', Red: '#e5383b' };
const inBox = (e: GdacsEvent, [w, s, e2, n]: number[]) => e.lon >= w && e.lon <= e2 && e.lat >= s && e.lat <= n;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function getJson(url: string, signal?: AbortSignal) {
  const r = await fetch(url, { signal });
  if (r.status === 204) return { type: 'FeatureCollection', features: [] };
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Current/recent tropical cyclones in the North Indian Ocean with their geometry. */
export async function loadCyclones(signal?: AbortSignal) {
  const from = isoDay(new Date(Date.now() - 10 * 86400_000));
  return fetchWithCache('gdacs-tc', async () => {
    const events = parseEvents(await getJson(`${API}/events/geteventlist/SEARCH?eventlist=TC&fromdate=${from}`, signal))
      .filter((e) => inBox(e, NORTH_INDIAN_OCEAN));
    const geoms: FeatureCollection = { type: 'FeatureCollection', features: [] };
    for (const e of events.slice(0, 4)) {
      if (!e.geometryUrl) continue;
      const g = (await getJson(e.geometryUrl, signal)) as FeatureCollection;
      for (const f of g.features ?? []) {
        const cls = String((f.properties as Record<string, unknown>)?.Class ?? '');
        const tone = cls.includes('Red') ? 'Red' : cls.includes('Orange') ? 'Orange' : cls.includes('Green') ? 'Green' : e.level;
        geoms.features.push({ ...f, properties: { ...(f.properties ?? {}), _event: e.name, _level: e.level, _color: LEVEL_COLOR[tone] ?? '#f2d64b' } });
      }
    }
    return { events, geoms };
  });
}

/** GDACS alerts touching Sri Lanka (floods, cyclones…) in the last 14 days. */
export async function loadLkAlerts(signal?: AbortSignal) {
  const from = isoDay(new Date(Date.now() - 14 * 86400_000));
  return fetchWithCache('gdacs-lk', async () =>
    parseEvents(await getJson(`${API}/events/geteventlist/SEARCH?country=LKA&fromdate=${from}`, signal)));
}

export const GDACS_ATTRIBUTION = { text: 'Alerts: GDACS (UN OCHA, European Commission JRC)', url: 'https://www.gdacs.org/' };
