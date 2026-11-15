// NASA GIBS (Global Imagery Browse Services): WMTS tiles, free, no key, CORS enabled.
// https://nasa-gibs.github.io/gibs-api-docs/ — "We acknowledge the use of imagery from NASA's
// Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)."
import { cachePut, cacheGet, isOffline } from './cache';
import type { Frame } from './types';
import { whenOf } from './timeline';

const BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

export function gibsTileUrl(layer: string, level: number, time: number) {
  const iso = new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `${BASE}/${layer}/default/${iso}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.png`;
}

/**
 * Latest available time of a layer, via WMTS DescribeDomains limited to the last 2 days
 * (a few hundred bytes instead of the 5.8 MB capabilities document).
 * Response domain looks like "2026-11-14/2026-11-15T10:30:00Z/PT30M": we take the end.
 */
export function parseLatest(xml: string): number | null {
  const d = /<Domain>([^<]+)<\/Domain>/.exec(xml)?.[1];
  if (!d) return null;
  const last = d.split(',').pop()!.split('/');
  const end = last.length >= 2 ? last[1] : last[0];
  const t = Date.parse(end);
  return Number.isNaN(t) ? null : t;
}

export async function gibsLatest(layer: string, level: number, signal?: AbortSignal): Promise<number | null> {
  const from = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const url = `${BASE}/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0&LAYER=${layer}&TILEMATRIXSET=GoogleMapsCompatible_Level${level}&TIME=${from}/${to}`;
  const key = `gibs-latest-${layer}`;
  try {
    if (isOffline()) throw new Error('offline');
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const t = parseLatest(await r.text());
    if (t) await cachePut(key, t);
    return t;
  } catch {
    return (await cacheGet<number>(key))?.value ?? null;
  }
}

/** Frames ending at `latest`, every `stepMin` minutes, covering `hours`. */
export function gibsFrames(latest: number, stepMin: number, hours: number, now = Date.now()): Frame[] {
  const n = Math.floor((hours * 60) / stepMin);
  return Array.from({ length: n + 1 }, (_, i) => latest - (n - i) * stepMin * 60_000)
    .map((time) => ({ time, kind: whenOf(time, now) }));
}

export const GIBS_ATTRIBUTION = { text: "Imagery: NASA GIBS / ESDIS", url: 'https://earthdata.nasa.gov/gibs' };

/** Nearest colormap entry for an RGB pixel (reverse lookup → physical value). */
export function reverseColor(table: [number, number, number, number][], r: number, g: number, b: number, maxDist = 30): number | null {
  let best = -1, bd = Infinity;
  for (let i = 0; i < table.length; i++) {
    const [tr, tg, tb] = table[i];
    const d = (tr - r) ** 2 + (tg - g) ** 2 + (tb - b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best >= 0 && Math.sqrt(bd) <= maxDist ? table[best][3] : null;
}

/** Reads one pixel of a GIBS tile at (lat, lon) and returns its RGBA, or null (no CORS image / no data). */
export async function samplePixel(urlTemplate: string, level: number, lat: number, lon: number): Promise<[number, number, number, number] | null> {
  const z = level;
  const n = 2 ** z;
  const xf = ((lon + 180) / 360) * n;
  const yf = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const x = Math.floor(xf), y = Math.floor(yf);
  const url = urlTemplate.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, -Math.floor((xf - x) * img.width), -Math.floor((yf - y) * img.height));
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  } catch {
    return null;
  }
}
