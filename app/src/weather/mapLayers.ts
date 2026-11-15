// Draws the active weather layers on the MapLibre map, ABOVE the base map and roads and BELOW the
// school dots (inserted before the "schools" layer). Generic per render type, so new providers
// need no changes here.
//  - raster: two sources per layer (front/back). The back one preloads the next frame; on each
//    step they swap with a short opacity cross-fade (no flicker). At most 2 frames per layer.
//  - heat: the model grid is painted client-side into a small image (bilinear), one image source.
//  - wind: arrows (SDF icon) rotated to where the wind blows, coloured and sized by speed.
//  - vector: GeoJSON; features may carry `_color` (fill/line/circle).
import { effect } from '@preact/signals';
import type { GeoJSONSource, ImageSource, Map as MLMap, RasterTileSource } from 'maplibre-gl';
import { allLayers, getLayer } from './layers';
import { activeIds, frameOf, reducedMotion, wxLayers, wxPlayer, wxTime } from './store';
import { GRID_BOUNDS, valueAt } from './grid';
import { rampColor, WIND_RAMP } from './colors';
import type { GridField, LegendStop, WeatherProvider } from './types';

const BEFORE = 'schools';
const attr = (p: WeatherProvider) => { const a = p.getAttribution(); return a.text ? `<a href="${a.url}" target="_blank" rel="noopener">${a.text}</a>` : undefined; };
const [W, S, E, N] = GRID_BOUNDS;
const IMG_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [[W, N], [E, N], [E, S], [W, S]];

/** Paints a grid field into a PNG data URL (transparent where below the first legend stop). */
export function paintField(f: GridField, stops: LegendStop[], scale = 16): string {
  const w = (f.lons.length - 1) * scale + 1, h = (f.lats.length - 1) * scale + 1;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const lat = N - (y / (h - 1)) * (N - S);
    for (let x = 0; x < w; x++) {
      const lon = W + (x / (w - 1)) * (E - W);
      const [r, g, b, a] = rampColor(stops, valueAt(f, lat, lon));
      const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function arrowImage(): ImageData {
  const s = 32, c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(16, 2); ctx.lineTo(27, 18); ctx.lineTo(19, 16); ctx.lineTo(19, 30); ctx.lineTo(13, 30); ctx.lineTo(13, 16); ctx.lineTo(5, 18);
  ctx.closePath(); ctx.fill();
  return ctx.getImageData(0, 0, s, s);
}

interface RasterState { front: 'a' | 'b'; times: { a: number | null; b: number | null } }

export function attachWeather(map: MLMap): () => void {
  const raster = new Map<string, RasterState>();
  const before = () => (map.getLayer(BEFORE) ? BEFORE : undefined);
  const fade = () => (reducedMotion.value ? 0 : 350);

  const remove = (id: string) => {
    for (const suffix of ['', '-a', '-b', '-fill', '-line', '-circle']) {
      if (map.getLayer(`wx-${id}${suffix}`)) map.removeLayer(`wx-${id}${suffix}`);
    }
    for (const suffix of ['', '-a', '-b', '-attr']) if (map.getSource(`wx-${id}${suffix}`)) map.removeSource(`wx-${id}${suffix}`);
    raster.delete(id);
  };

  const ensureRaster = (p: WeatherProvider, url: string, opacity: number) => {
    if (p.render.type !== 'raster') return;
    for (const k of ['a', 'b'] as const) {
      const sid = `wx-${p.id}-${k}`;
      if (!map.getSource(sid)) map.addSource(sid, { type: 'raster', tiles: [url], tileSize: 256, maxzoom: p.render.maxzoom, attribution: attr(p) });
      if (!map.getLayer(sid)) {
        map.addLayer({ id: sid, type: 'raster', source: sid, paint: { 'raster-opacity': k === 'a' ? opacity : 0, 'raster-fade-duration': 0, 'raster-opacity-transition': { duration: fade(), delay: 0 } } as never }, before());
      }
    }
    if (!raster.has(p.id)) raster.set(p.id, { front: 'a', times: { a: null, b: null } });
  };

  const syncRaster = (p: WeatherProvider, opacity: number) => {
    if (p.render.type !== 'raster') return;
    const f = frameOf(p.id);
    if (!f) { remove(p.id); return; }
    ensureRaster(p, p.render.tileUrl(f), opacity);
    const st = raster.get(p.id)!;
    const back = st.front === 'a' ? 'b' : 'a';
    const src = (k: 'a' | 'b') => map.getSource(`wx-${p.id}-${k}`) as RasterTileSource;
    if (st.times[st.front] !== f.time) {
      if (st.times[back] !== f.time) { src(back).setTiles([p.render.tileUrl(f)]); st.times[back] = f.time; }
      // swap: the preloaded back becomes visible
      map.setPaintProperty(`wx-${p.id}-${back}`, 'raster-opacity', opacity);
      map.setPaintProperty(`wx-${p.id}-${st.front}`, 'raster-opacity', 0);
      st.front = back;
    } else {
      map.setPaintProperty(`wx-${p.id}-${st.front}`, 'raster-opacity', opacity);
    }
    // preload the next step into the hidden source (max 2 frames in memory)
    const pl = wxPlayer.value, nextT = pl.steps[(pl.index + 1) % Math.max(pl.steps.length, 1)];
    const nf = nextT != null ? frameOf(p.id, nextT) : null;
    const hidden = st.front === 'a' ? 'b' : 'a';
    if (nf && nf.time !== st.times[hidden] && nf.time !== st.times[st.front]) { src(hidden).setTiles([p.render.tileUrl(nf)]); st.times[hidden] = nf.time; }
  };

  const syncHeat = (p: WeatherProvider, opacity: number) => {
    if (p.render.type !== 'heat') return;
    const f = p.render.field(wxTime.value);
    if (!f) { remove(p.id); return; }
    const url = paintField(f, p.getLegend().stops);
    const sid = `wx-${p.id}`;
    const s = map.getSource(sid) as ImageSource | undefined;
    if (s) s.updateImage({ url, coordinates: IMG_COORDS });
    else {
      map.addSource(sid, { type: 'image', url, coordinates: IMG_COORDS });
      // image sources cannot carry attribution: an empty GeoJSON source shows it in the map footer
      if (!map.getSource(`${sid}-attr`)) map.addSource(`${sid}-attr`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: attr(p) });
    }
    if (!map.getLayer(sid)) map.addLayer({ id: sid, type: 'raster', source: sid, paint: { 'raster-opacity': opacity, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, before());
    else map.setPaintProperty(sid, 'raster-opacity', opacity);
  };

  const syncWind = (p: WeatherProvider, opacity: number) => {
    if (p.render.type !== 'wind') return;
    const w = p.render.field(wxTime.value);
    if (!w) { remove(p.id); return; }
    const data = {
      type: 'FeatureCollection' as const,
      features: w.speed.values.map((sp, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [w.speed.lons[i % w.speed.lons.length], w.speed.lats[Math.floor(i / w.speed.lons.length)]] },
        properties: { speed: sp ?? 0, to: ((w.dir.values[i] ?? 0) + 180) % 360 },
      })),
    };
    const sid = `wx-${p.id}`;
    if (!map.hasImage('wx-arrow')) map.addImage('wx-arrow', arrowImage(), { sdf: true });
    const s = map.getSource(sid) as GeoJSONSource | undefined;
    if (s) s.setData(data);
    else map.addSource(sid, { type: 'geojson', data, attribution: attr(p) });
    const color = ['interpolate', ['linear'], ['get', 'speed'], ...WIND_RAMP.flatMap((s) => [s.value, s.color])];
    if (!map.getLayer(sid)) {
      map.addLayer({
        id: sid, type: 'symbol', source: sid,
        layout: { 'icon-image': 'wx-arrow', 'icon-rotate': ['get', 'to'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['get', 'speed'], 0, 0.45, 60, 1.1] },
        paint: { 'icon-color': color as never, 'icon-opacity': opacity },
      }, before());
    } else map.setPaintProperty(sid, 'icon-opacity', opacity);
  };

  const syncVector = (p: WeatherProvider, opacity: number) => {
    if (p.render.type !== 'vector') return;
    const data = p.render.data(wxTime.value);
    if (!data) { remove(p.id); return; }
    const sid = `wx-${p.id}`;
    const s = map.getSource(sid) as GeoJSONSource | undefined;
    if (s) s.setData(data);
    else map.addSource(sid, { type: 'geojson', data, attribution: attr(p) });
    const col = ['coalesce', ['get', '_color'], '#f2d64b'] as never;
    const add = (suffix: string, spec: Record<string, unknown>) => { if (!map.getLayer(sid + suffix)) map.addLayer({ id: sid + suffix, source: sid, ...spec } as never, before()); };
    add('-fill', { type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': col, 'fill-opacity': 0.25 * opacity, 'fill-outline-color': col } });
    add('-line', { type: 'line', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': col, 'line-width': 2.5, 'line-opacity': opacity, 'line-dasharray': [2, 1] } });
    add('-circle', { type: 'circle', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': col, 'circle-radius': ['coalesce', ['get', '_radius'], 7], 'circle-opacity': opacity, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
    map.setPaintProperty(`${sid}-fill`, 'fill-opacity', 0.25 * opacity);
    map.setPaintProperty(`${sid}-line`, 'line-opacity', opacity);
    map.setPaintProperty(`${sid}-circle`, 'circle-opacity', opacity);
  };

  const sync = () => {
    if (!map.getLayer(BEFORE)) return; // style not ready
    const on = new Set(activeIds.value);
    for (const p of allLayers()) {
      const st = wxLayers.value[p.id];
      if (!on.has(p.id) || !st?.frames.length) { remove(p.id); continue; }
      try {
        if (p.render.type === 'raster') syncRaster(p, st.opacity);
        else if (p.render.type === 'heat') syncHeat(p, st.opacity);
        else if (p.render.type === 'wind') syncWind(p, st.opacity);
        else if (p.render.type === 'vector') syncVector(p, st.opacity);
      } catch (e) {
        console.warn('[PAE] weather layer', p.id, (e as Error).message); // degrade quietly
      }
    }
  };

  const stop = effect(() => { wxLayers.value; wxTime.value; reducedMotion.value; sync(); });
  const onStyle = () => { raster.clear(); sync(); };
  map.on('style.load', onStyle);
  map.on('load', sync);
  return () => { stop(); map.off('style.load', onStyle); for (const p of allLayers()) remove(p.id); };
}

export { getLayer };
