import type { ConnectivityFile, Dataset, Level, School, SchoolsFile } from './types';

const LEVELS: Level[] = ['primary', 'secondary', 'primary_secondary'];

export function parseSchools(file: SchoolsFile): Dataset {
  if (file.version !== 1 || !Array.isArray(file.schools)) throw new Error('schools.json: unsupported format');
  const schools: School[] = file.schools.map(([id, name, lon, lat, level, p, d]) => ({
    id,
    name,
    lon,
    lat,
    level: LEVELS[level] ?? 'primary_secondary',
    province: p >= 0 ? file.provinces[p] : undefined,
    district: d >= 0 ? file.districts[d] : undefined,
    connectivity: 'unknown',
  }));
  return {
    generatedAt: file.generatedAt,
    exportedAt: file.source.exportedAt,
    provinces: file.provinces,
    districts: file.districts,
    schools,
    byId: new Map(schools.map((s) => [s.id, s])),
  };
}

/** Network first (the service worker also keeps the last good copy for offline use). */
export async function loadSchools(baseUrl: string): Promise<Dataset> {
  const res = await fetch(`${baseUrl}data/schools.json`);
  if (!res.ok) throw new Error(`schools.json: HTTP ${res.status}`);
  const ds = parseSchools(await res.json());
  // Optional connectivity layer; without it every school stays "unknown".
  try {
    const c = await fetch(`${baseUrl}data/connectivity.json`);
    if (c.ok) applyConnectivity(ds, await c.json());
  } catch { /* offline and never cached, or absent */ }
  return ds;
}

export function applyConnectivity(ds: Dataset, file: ConnectivityFile) {
  if (file.version !== 1 || !file.status) return;
  for (const s of ds.schools) s.connectivity = file.status[s.id] ?? 'unknown';
  ds.connectivity = { kind: file.kind, method: file.method, generatedAt: file.generatedAt };
}

export function toGeoJSON(schools: School[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: schools.map((s) => ({
      type: 'Feature',
      id: undefined,
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { id: s.id, name: s.name, level: s.level, status: s.connectivity, district: s.district?.id ?? -1, province: s.province?.id ?? -1 },
    })),
  };
}
