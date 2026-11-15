// School risk index from combined phenomena. The formula is shown in the app and every number
// below can be changed there (saved per device):
//
//   factor_i = clamp((x_i - low_i) / (high_i - low_i), 0, 1)        for rain, gusts, 24 h rain
//   official = 1 if an official alert (GDACS Orange/Red for Sri Lanka) is active or the school
//              is inside a cyclone wind/cone polygon, else 0
//   score    = Σ w_i · factor_i / Σ w_i                                (0 … 1)
//   level    = low < moderate ≤ score < high ≤ score < severe ≤ score
//
// "High risk" in filters and counters means level high or severe. Informative only: official
// warnings always prevail.
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';

export interface RiskConfig {
  weights: { rain: number; gust: number; accum: number; official: number };
  ranges: { rain: [number, number]; gust: [number, number]; accum: [number, number] }; // mm/h, km/h, mm (24 h)
  levels: { moderate: number; high: number; severe: number };
}

export const DEFAULT_RISK: RiskConfig = {
  weights: { rain: 0.3, gust: 0.2, accum: 0.3, official: 0.2 },
  ranges: { rain: [5, 30], gust: [40, 90], accum: [50, 200] },
  levels: { moderate: 0.25, high: 0.5, severe: 0.75 },
};

export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe';
export interface RiskInputs { rain: number | null; gust: number | null; accum: number | null; official: boolean }
export interface RiskFactor { id: 'rain' | 'gust' | 'accum' | 'official'; value: number | null; factor: number; weighted: number }
export interface RiskResult { score: number; level: RiskLevel; factors: RiskFactor[] }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const norm = (v: number | null, [lo, hi]: [number, number]) => (v == null ? 0 : clamp01((v - lo) / (hi - lo)));

export function riskScore(x: RiskInputs, c: RiskConfig = DEFAULT_RISK): RiskResult {
  const w = c.weights;
  const total = w.rain + w.gust + w.accum + w.official || 1;
  const factors: RiskFactor[] = [
    { id: 'rain', value: x.rain, factor: norm(x.rain, c.ranges.rain), weighted: 0 },
    { id: 'gust', value: x.gust, factor: norm(x.gust, c.ranges.gust), weighted: 0 },
    { id: 'accum', value: x.accum, factor: norm(x.accum, c.ranges.accum), weighted: 0 },
    { id: 'official', value: x.official ? 1 : 0, factor: x.official ? 1 : 0, weighted: 0 },
  ];
  for (const f of factors) f.weighted = (w[f.id] * f.factor) / total;
  const score = factors.reduce((s, f) => s + f.weighted, 0);
  const level: RiskLevel = score >= c.levels.severe ? 'severe' : score >= c.levels.high ? 'high' : score >= c.levels.moderate ? 'moderate' : 'low';
  factors.sort((a, b) => b.weighted - a.weighted);
  return { score, level, factors };
}

export const isHigh = (l: RiskLevel) => l === 'high' || l === 'severe';

// ---- point in polygon (cyclone cones / wind buffers) ----
function inRing(ring: number[][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(p: number[][][], x: number, y: number) {
  return inRing(p[0], x, y) && !p.slice(1).some((h) => inRing(h, x, y));
}
export function insideAny(fc: FeatureCollection | null | undefined, lon: number, lat: number): boolean {
  if (!fc) return false;
  return fc.features.some((f: Feature) => {
    const g = f.geometry;
    if (g?.type === 'Polygon') return inPolygon((g as Polygon).coordinates, lon, lat);
    if (g?.type === 'MultiPolygon') return (g as MultiPolygon).coordinates.some((p) => inPolygon(p, lon, lat));
    return false;
  });
}

// ---- config persistence ----
const KEY = 'pae.risk.v1';
export function loadRiskConfig(): RiskConfig {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s ? { ...DEFAULT_RISK, ...s, weights: { ...DEFAULT_RISK.weights, ...s.weights }, ranges: { ...DEFAULT_RISK.ranges, ...s.ranges }, levels: { ...DEFAULT_RISK.levels, ...s.levels } } : DEFAULT_RISK;
  } catch {
    return DEFAULT_RISK;
  }
}
export function saveRiskConfig(c: RiskConfig) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ }
}
