// MapLibre style for PAE (port of replica/03-design/map-style.js + basemap layers).
// Strava-like roads: luminous warm lines on a near-black base; colour, width, glow and dash
// follow road importance. Values come only from the design tokens.
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import tokens from '../../../replica/03-design/tokens.json';

export type ThemeName = 'dark' | 'light' | 'a11y';
type Pal = Record<string, string>;
type Stops = [number, number][];

const W = (stops: Stops, factor?: ExpressionSpecification): ExpressionSpecification =>
  ['interpolate', ['exponential', 1.6], ['zoom'], ...stops.flatMap(([z, w]) => [z, factor ? ['*', w, factor] : w])] as ExpressionSpecification;
const scale = (stops: Stops, k: number): Stops => stops.map(([z, w]) => [z, +(w * k).toFixed(2)]);

interface RoadClass { cls: string; rank: number; minzoom: number; width: Stops; glow?: number; opacity?: number; dash?: number[]; also?: string[] }
export const ROAD_CLASSES: RoadClass[] = [
  { cls: 'motorway', rank: 15, minzoom: 5, glow: 1.0, width: [[5, 1.2], [8, 2.0], [12, 4.0], [14, 7.0], [16, 14]] },
  { cls: 'trunk', rank: 14, minzoom: 5, glow: 0.9, width: [[5, 1.0], [8, 1.8], [12, 3.5], [14, 6.0], [16, 12]] },
  { cls: 'primary', rank: 13, minzoom: 5, glow: 0.8, width: [[5, 0.8], [8, 1.4], [12, 3.0], [14, 5.0], [16, 10]] },
  { cls: 'secondary', rank: 12, minzoom: 8, glow: 0.6, width: [[8, 0.9], [12, 2.4], [14, 4.0], [16, 8]] },
  { cls: 'tertiary', rank: 11, minzoom: 10, glow: 0.4, width: [[10, 0.7], [12, 1.8], [14, 3.2], [16, 6]] },
  { cls: 'unclassified', rank: 10, minzoom: 11, width: [[11, 0.5], [14, 2.2], [16, 4.5]], opacity: 0.85 },
  { cls: 'residential', rank: 9, minzoom: 12, width: [[12, 0.5], [14, 1.8], [16, 4.0]], opacity: 0.7 },
  { cls: 'service', rank: 8, minzoom: 12, width: [[12, 0.4], [14, 1.2], [16, 3.0]], opacity: 0.6 },
  { cls: 'track', rank: 7, minzoom: 12, width: [[12, 0.5], [14, 1.4], [16, 3.0]], opacity: 0.8, dash: [3, 2] },
  { cls: 'cycleway', rank: 6, minzoom: 13, width: [[13, 0.6], [14, 1.2], [16, 2.4]], dash: [2, 1] },
  { cls: 'path', rank: 5, minzoom: 13, width: [[13, 0.5], [14, 1.0], [16, 2.0]], dash: [1, 1.5], also: ['footway', 'steps'] },
  { cls: 'construction', rank: 4, minzoom: 13, width: [[13, 0.5], [14, 1.2], [16, 2.4]], dash: [2, 2], opacity: 0.8 },
  { cls: 'other', rank: 3, minzoom: 13, width: [[13, 0.4], [14, 0.8], [16, 1.6]], opacity: 0.6 },
];

export const ROAD_GROUPS: Record<string, string[]> = {
  major: ['motorway', 'trunk', 'primary', 'secondary'],
  local: ['tertiary', 'unclassified', 'residential', 'service'],
  rural: ['track'],
  active: ['path', 'cycleway'],
  other: ['construction', 'other'],
};
const groupOf = (cls: string) => Object.keys(ROAD_GROUPS).find((g) => ROAD_GROUPS[g].includes(cls))!;

/** Sri Lanka bounds (roads.pmtiles header, padded). */
export const SRI_LANKA_BOUNDS: [[number, number], [number, number]] = [[78.9, 5.4], [82.9, 10.3]];
export const SRI_LANKA_FIT: [number, number, number, number] = [79.52, 5.85, 81.95, 9.88];

export interface StyleOptions {
  theme: ThemeName;
  roadsKey: string;
  baseKey: string;
  dataUrl: string;
  glyphs: string;
  roadGroups: Set<string>;
  boundaries: boolean;
  labels: boolean;
}

export function themePalette(theme: ThemeName) {
  const t = tokens as unknown as { color: Record<ThemeName, Pal>; map: Record<ThemeName, Pal> };
  return { m: { ...t.map[theme] } as Pal, c: t.color[theme] };
}

export function buildStyle(o: StyleOptions): StyleSpecification {
  const { m, c } = themePalette(o.theme);
  const glowStrength = o.theme === 'light' ? 0.35 : 1;
  const glowOn = o.theme !== 'a11y';
  const coreOpacity = o.theme === 'dark' ? 0.55 : 0;
  const vis = (on: boolean) => ({ visibility: on ? 'visible' : 'none' }) as const;
  const classFilter = (r: RoadClass): ExpressionSpecification => ['in', ['get', 'class'], ['literal', [r.cls, ...(r.also || [])]]];
  const linkK: ExpressionSpecification = ['case', ['==', ['get', 'link'], true], 0.6, 1];
  const roadOn = (r: RoadClass) => o.roadGroups.has(groupOf(r.cls));

  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': m['map-water'] } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': m['map-land'] } },
    { id: 'water', type: 'fill', source: 'base', 'source-layer': 'water', paint: { 'fill-color': m['map-water'] } },
    // Risk zones: prepared but EMPTY. No official hazard data is in the project yet; the app
    // never invents zones. Fill data/risk.json (GeoJSON) and load it into this source.
    { id: 'risk-zones', type: 'fill', source: 'risk', paint: { 'fill-color': m['map-risk'], 'fill-opacity': 0.35, 'fill-outline-color': m['map-risk'] } },
    {
      id: 'waterway', type: 'line', source: 'base', 'source-layer': 'waterway', minzoom: 8,
      paint: { 'line-color': m['map-water'], 'line-width': W([[8, 0.6], [12, 1.4], [16, 4]]) },
    },
    {
      id: 'admin-district', type: 'line', source: 'admin', filter: ['==', ['get', 'level'], 5], minzoom: 8, layout: vis(o.boundaries),
      paint: { 'line-color': m['map-admin'], 'line-width': 0.8, 'line-dasharray': [3, 2], 'line-opacity': 0.8 },
    },
    {
      id: 'admin-province', type: 'line', source: 'admin', filter: ['==', ['get', 'level'], 4], layout: vis(o.boundaries),
      paint: { 'line-color': m['map-admin'], 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 1.6] },
    },
  ];

  if (glowOn) {
    for (const r of ROAD_CLASSES.filter((r) => r.glow)) {
      layers.push({
        id: `roads-glow-${r.cls}`, type: 'line', source: 'roads', 'source-layer': 'roads', minzoom: r.minzoom,
        filter: ['all', classFilter(r), ['!=', ['get', 'tunnel'], true]],
        layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': r.rank, ...vis(roadOn(r)) },
        paint: { 'line-color': m[`road-${r.cls}`], 'line-width': W(scale(r.width, 4)), 'line-blur': W(scale(r.width, 3)), 'line-opacity': 0.22 * (r.glow ?? 0) * glowStrength },
      });
    }
  }
  for (const r of [...ROAD_CLASSES].reverse()) {
    const a11yBoost = o.theme === 'a11y' ? 1.3 : 1;
    layers.push({
      id: `roads-${r.cls}`, type: 'line', source: 'roads', 'source-layer': 'roads', minzoom: r.minzoom, filter: classFilter(r),
      layout: { 'line-cap': r.dash ? 'butt' : 'round', 'line-join': 'round', 'line-sort-key': r.rank, ...vis(roadOn(r)) },
      paint: {
        'line-color': m[`road-${r.cls}`],
        'line-width': W(scale(r.width, a11yBoost), linkK),
        'line-opacity': ['case', ['==', ['get', 'tunnel'], true], 0.45 * (r.opacity ?? 1), r.opacity ?? 1],
        ...(r.dash ? { 'line-dasharray': r.dash } : {}),
      },
    });
  }
  if (coreOpacity > 0) {
    layers.push({
      id: 'roads-core-highlight', type: 'line', source: 'roads', 'source-layer': 'roads', minzoom: 11,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
      layout: { 'line-cap': 'round', 'line-join': 'round', ...vis(o.roadGroups.has('major')) },
      paint: { 'line-color': m['road-core'], 'line-width': W([[11, 0.4], [14, 1.4], [16, 3]]), 'line-opacity': coreOpacity },
    });
  }

  const text = { 'text-color': m['map-label'], 'text-halo-color': m['map-label-halo'], 'text-halo-width': 1.4 };
  layers.push(
    {
      id: 'roads-label', type: 'symbol', source: 'roads', 'source-layer': 'roads', minzoom: 13,
      filter: ['all', ['has', 'name'], ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential']]]],
      layout: {
        'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, 13], 'text-max-angle': 30, 'symbol-spacing': 300, ...vis(o.labels),
      },
      paint: text,
    },
    {
      id: 'place-label', type: 'symbol', source: 'base', 'source-layer': 'place',
      // English names only: MapLibre cannot shape Sinhala/Tamil (see README known issues).
      filter: ['has', 'name:en'],
      layout: {
        'text-field': ['get', 'name:en'], 'text-font': ['Noto Sans Regular'],
        'text-size': ['match', ['get', 'rank'], 1, 14, 2, 12, 11], 'symbol-sort-key': ['get', 'rank'],
        'text-padding': 4, 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.6, ...vis(o.labels),
      },
      paint: text,
    },
  );

  // Schools: neutral colour until connectivity data exists; a11y mode adds a shape cue
  // (not-connected = hollow ring) so status never depends on colour alone.
  const status: ExpressionSpecification = ['match', ['get', 'status'], 'connected', c['status-connected'], 'not_connected', c['status-not-connected'], c['status-unknown']];
  const radius: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 6, 1.6, 9, 2.6, 12, 4, 15, 7, 17, 10];
  const hollow = o.theme === 'a11y';
  layers.push(
    {
      id: 'schools', type: 'circle', source: 'schools',
      paint: {
        'circle-color': hollow ? ['case', ['==', ['get', 'status'], 'not_connected'], m['school-stroke'], status] : status,
        'circle-radius': radius,
        'circle-stroke-color': hollow ? ['case', ['==', ['get', 'status'], 'not_connected'], status, m['school-stroke']] : m['school-stroke'],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 0.3, 12, 1, 16, 1.5],
      },
    },
    {
      id: 'schools-selected', type: 'circle', source: 'schools', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': m.selected, 'circle-stroke-width': 3, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 6, 12, 9, 16, 14] },
    },
  );

  return {
    version: 8,
    name: `pae-${o.theme}`,
    glyphs: o.glyphs,
    sources: {
      land: { type: 'geojson', data: `${o.dataUrl}land.json` },
      admin: { type: 'geojson', data: `${o.dataUrl}admin.json` },
      base: { type: 'vector', url: `pmtiles://${o.baseKey}`, attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' },
      roads: { type: 'vector', url: `pmtiles://${o.roadsKey}` },
      schools: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: 'Schools: Giga' },
      risk: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers,
  };
}
