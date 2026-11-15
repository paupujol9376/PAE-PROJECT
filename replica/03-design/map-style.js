// PAE map style builder (design reference; ported to TypeScript in phase 4).
// Strava-like roads: luminous warm lines on a near-black base. Colour, width
// and glow scale with road importance. Inputs come from tokens.json.
//
//   buildStyle({ tokens, theme: 'dark'|'light'|'a11y', roadsUrl, schoolsData, glyphs })
//
// roads.pmtiles layer `roads`, field `class` (see replica/01-data/report.md).

// Zoom must stay the top-level input, so a per-feature factor goes inside each stop.
const W = (stops, factor) => ['interpolate', ['exponential', 1.6], ['zoom'],
  ...stops.flatMap(([z, w]) => [z, factor ? ['*', w, factor] : w])];
const scale = (stops, k) => stops.map(([z, w]) => [z, +(w * k).toFixed(2)]);

// class -> how it is drawn. width stops are [zoom, px].
export const ROAD_CLASSES = [
  { cls: 'motorway',     rank: 15, minzoom: 5,  glow: 1.0, width: [[5, 1.2], [8, 2.0], [12, 4.0], [14, 7.0], [16, 14]] },
  { cls: 'trunk',        rank: 14, minzoom: 5,  glow: 0.9, width: [[5, 1.0], [8, 1.8], [12, 3.5], [14, 6.0], [16, 12]] },
  { cls: 'primary',      rank: 13, minzoom: 5,  glow: 0.8, width: [[5, 0.8], [8, 1.4], [12, 3.0], [14, 5.0], [16, 10]] },
  { cls: 'secondary',    rank: 12, minzoom: 8,  glow: 0.6, width: [[8, 0.9], [12, 2.4], [14, 4.0], [16, 8]] },
  { cls: 'tertiary',     rank: 11, minzoom: 10, glow: 0.4, width: [[10, 0.7], [12, 1.8], [14, 3.2], [16, 6]] },
  { cls: 'unclassified', rank: 10, minzoom: 11, width: [[11, 0.5], [14, 2.2], [16, 4.5]], opacity: 0.85 },
  { cls: 'residential',  rank: 9,  minzoom: 12, width: [[12, 0.5], [14, 1.8], [16, 4.0]], opacity: 0.7 },
  { cls: 'service',      rank: 8,  minzoom: 12, width: [[12, 0.4], [14, 1.2], [16, 3.0]], opacity: 0.6 },
  { cls: 'track',        rank: 7,  minzoom: 12, width: [[12, 0.5], [14, 1.4], [16, 3.0]], opacity: 0.8, dash: [3, 2] },
  { cls: 'cycleway',     rank: 6,  minzoom: 13, width: [[13, 0.6], [14, 1.2], [16, 2.4]], dash: [2, 1] },
  { cls: 'path',         rank: 5,  minzoom: 13, width: [[13, 0.5], [14, 1.0], [16, 2.0]], dash: [1, 1.5], also: ['footway', 'steps'] },
  { cls: 'construction', rank: 4,  minzoom: 13, width: [[13, 0.5], [14, 1.2], [16, 2.4]], dash: [2, 2], opacity: 0.8 },
  { cls: 'other',        rank: 3,  minzoom: 13, width: [[13, 0.4], [14, 0.8], [16, 1.6]], opacity: 0.6 },
];

// Groups the UI can toggle (layer ids share the prefix).
export const ROAD_GROUPS = {
  major: ['motorway', 'trunk', 'primary', 'secondary'],
  local: ['tertiary', 'unclassified', 'residential', 'service'],
  rural: ['track'],
  active: ['path', 'cycleway'],
  other: ['construction', 'other'],
};

function roadLayers(m) {
  const layers = [];
  const classFilter = (c) => ['in', ['get', 'class'], ['literal', [c.cls, ...(c.also || [])]]];
  const linkK = ['case', ['==', ['get', 'link'], true], 0.6, 1];

  // 1. Glow underlay for important roads (the Strava "heat" look). Additive-looking
  //    thanks to low opacity; overlaps of many roads brighten naturally.
  for (const c of ROAD_CLASSES.filter((c) => c.glow && m['road-glow'] !== false)) {
    layers.push({
      id: `roads-glow-${c.cls}`, type: 'line', source: 'roads', 'source-layer': 'roads',
      minzoom: c.minzoom, filter: ['all', classFilter(c), ['!=', ['get', 'tunnel'], true]],
      layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': c.rank },
      paint: {
        'line-color': m[`road-${c.cls}`],
        'line-width': W(scale(c.width, 4)),
        'line-blur': W(scale(c.width, 3)),
        'line-opacity': 0.22 * c.glow * (m.glowStrength ?? 1),
      },
    });
  }
  // 2. Core lines, minor classes first so major ones draw on top.
  for (const c of [...ROAD_CLASSES].reverse()) {
    const id = c.cls;
    layers.push({
      id: `roads-${id}`, type: 'line', source: 'roads', 'source-layer': 'roads',
      minzoom: c.minzoom, filter: classFilter(c),
      layout: { 'line-cap': c.dash ? 'butt' : 'round', 'line-join': 'round', 'line-sort-key': c.rank },
      paint: {
        'line-color': m[`road-${c.cls}`],
        'line-width': W(c.width, linkK),
        'line-opacity': ['case', ['==', ['get', 'tunnel'], true], 0.45 * (c.opacity ?? 1), c.opacity ?? 1],
        ...(c.dash ? { 'line-dasharray': c.dash } : {}),
      },
    });
  }
  // 3. Bright inner core for motorway/trunk/primary at high zoom (light-tube effect).
  layers.push({
    id: 'roads-core-highlight', type: 'line', source: 'roads', 'source-layer': 'roads', minzoom: 11,
    filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': m['road-core'] || '#FFF4E0', 'line-width': W([[11, 0.4], [14, 1.4], [16, 3]]), 'line-opacity': m['road-core-opacity'] ?? 0.55 },
  });
  return layers;
}

function schoolLayers(m, c) {
  const status = ['match', ['get', 'status'],
    'connected', c['status-connected'], 'not_connected', c['status-not-connected'], c['status-unknown']];
  return [
    {
      id: 'schools', type: 'circle', source: 'schools',
      paint: {
        'circle-color': status,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1.6, 9, 2.6, 12, 4, 15, 7, 17, 10],
        'circle-stroke-color': m['school-stroke'],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 0.3, 12, 1, 16, 1.5],
        'circle-opacity': 0.95,
      },
    },
    {
      id: 'schools-selected', type: 'circle', source: 'schools', filter: ['==', ['get', 'id'], ''],
      paint: {
        'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': m.selected, 'circle-stroke-width': 3,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 6, 12, 9, 16, 14],
      },
    },
  ];
}

function labelLayers(m) {
  return [{
    id: 'roads-label', type: 'symbol', source: 'roads', 'source-layer': 'roads', minzoom: 13,
    filter: ['all', ['has', 'name'], ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential']]]],
    layout: {
      'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
      'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, 13],
      'text-max-angle': 30, 'symbol-spacing': 300,
    },
    paint: { 'text-color': m['map-label'], 'text-halo-color': m['map-label-halo'], 'text-halo-width': 1.4 },
  }];
}

// Sri Lanka bounds (from roads.pmtiles header, padded).
export const SRI_LANKA_BOUNDS = [[78.9, 5.4], [82.9, 10.3]];

export function buildStyle({ tokens, theme = 'dark', roadsUrl, schoolsData, glyphs, labels = true }) {
  const m = { ...tokens.map[theme] };
  const c = tokens.color[theme];
  if (theme === 'light') { m.glowStrength = 0.35; m['road-core-opacity'] = 0; }
  if (theme === 'a11y') { m['road-glow'] = false; m['road-core-opacity'] = 0; }
  return {
    version: 8,
    name: `pae-${theme}`,
    ...(glyphs ? { glyphs } : {}),
    sources: {
      roads: { type: 'vector', url: `pmtiles://${roadsUrl}`, attribution: '© OpenStreetMap contributors' },
      schools: { type: 'geojson', data: schoolsData, attribution: 'Schools: Giga' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': m['map-land'] } },
      ...roadLayers(m),
      ...(labels && glyphs ? labelLayers(m) : []),
      ...schoolLayers(m, c),
    ],
  };
}
