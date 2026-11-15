// Weather UI state shared by the panel, the player, the map and the school views.
import { computed, effect, signal } from '@preact/signals';
import { allLayers, getLayer } from './layers';
import { buildSteps, frameFor, Player } from './timeline';
import { models, loadModels } from './openMeteo';
import { accumulation, fieldAt, valueAt } from './grid';
import { insideAny, isHigh, loadRiskConfig, riskScore, saveRiskConfig, type RiskConfig, type RiskLevel, type RiskResult } from './risk';
import { lkAlerts } from './providers/warningsGdacs';
import type { Frame } from './types';
import { dataset, isMobile } from '../state';

export type LayerStatus = 'off' | 'loading' | 'live' | 'cached' | 'unavailable';
export interface LayerState { on: boolean; opacity: number; status: LayerStatus; frames: Frame[]; savedAt: number | null }

const PREFS = 'pae.weather.v1';
function readPrefs(): Record<string, { on: boolean; opacity: number }> {
  try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; }
}

export const wxPanelOpen = signal(false);
export const wxLayers = signal<Record<string, LayerState>>(
  Object.fromEntries(allLayers().map((l) => {
    const p = readPrefs()[l.id];
    return [l.id, { on: l.status === 'enabled' && !!p?.on, opacity: p?.opacity ?? l.defaultOpacity, status: 'off' as LayerStatus, frames: [], savedAt: null }];
  })),
);
effect(() => {
  const v = Object.fromEntries(Object.entries(wxLayers.value).map(([k, s]) => [k, { on: s.on, opacity: s.opacity }]));
  try { localStorage.setItem(PREFS, JSON.stringify(v)); } catch { /* ignore */ }
});

/** Desktop: any number of layers; mobile: at most 2 at once (performance). */
export const MAX_MOBILE = 2;
export const activeIds = computed(() => Object.entries(wxLayers.value).filter(([, s]) => s.on).map(([id]) => id));

function patch(id: string, p: Partial<LayerState>) {
  wxLayers.value = { ...wxLayers.value, [id]: { ...wxLayers.value[id], ...p } };
}

export function setOpacity(id: string, opacity: number) { patch(id, { opacity }); }

/** Returns false when the mobile limit blocks turning a layer on. */
export function toggleLayer(id: string): boolean {
  const s = wxLayers.value[id];
  if (!s || getLayer(id)?.status !== 'enabled') return false;
  if (!s.on && isMobile.value && activeIds.value.length >= MAX_MOBILE) return false;
  patch(id, { on: !s.on, status: !s.on ? 'loading' : 'off' });
  if (!s.on) refreshLayer(id);
  return true;
}

// ---- data refresh (per layer cadence, paused while the tab is hidden) ----
const lastRefresh: Record<string, number> = {};
export async function refreshLayer(id: string) {
  const l = getLayer(id);
  if (!l || l.status !== 'enabled') return;
  lastRefresh[id] = Date.now();
  try {
    const frames = await l.getFrames();
    const t = l.dataTime();
    // "cached" = shown from the device cache (offline or provider failure), with its age in the UI
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const cached = offline || (isModel(id) && models().stale);
    patch(id, { frames, savedAt: t, status: cached ? 'cached' : 'live' });
  } catch {
    patch(id, { frames: [], status: 'unavailable' });
  }
  rebuildSteps();
  if (isModel(id)) recomputeRisk();
}
const isModel = (id: string) => ['precipFcst', 'wind', 'temperature', 'rainAccum', 'waves'].includes(id);

let tick: ReturnType<typeof setInterval> | null = null;
export function startWeather() {
  if (tick) return;
  for (const id of activeIds.value) refreshLayer(id);
  // risk needs the model grid and official alerts even if their layers are off
  loadModels().then(recomputeRisk);
  getLayer('warningsGdacs')?.getFrames().then(recomputeRisk).catch(() => undefined);
  tick = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    for (const id of activeIds.value) {
      const l = getLayer(id);
      if (l && Date.now() - (lastRefresh[id] ?? 0) > l.refreshMinutes * 60_000) refreshLayer(id);
    }
  }, 60_000);
  document.addEventListener('visibilitychange', onVisibility);
}
export function stopWeather() {
  if (tick) clearInterval(tick);
  tick = null;
  player.pause();
  document.removeEventListener('visibilitychange', onVisibility);
}
function onVisibility() {
  if (document.hidden) player.pause();
}

// ---- shared player ----
export const wxPlayer = signal({ steps: [] as number[], index: 0, playing: false, speed: 1 as 1 | 2 });
export const player = new Player((p) => (wxPlayer.value = { steps: p.steps, index: p.index, playing: p.playing, speed: p.speed }));
export const wxTime = computed(() => wxPlayer.value.steps[wxPlayer.value.index] ?? Date.now());
export const reducedMotion = signal(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

export function rebuildSteps() {
  const sets = activeIds.value.map((id) => (getLayer(id)?.animated ? wxLayers.value[id].frames : [])).filter((f) => f.length);
  player.setSteps(buildSteps(sets, Date.now()), Date.now());
}

/** The frame a raster layer should show at the player time (newest at or before it). */
export function frameOf(id: string, time = wxTime.value) {
  const l = getLayer(id);
  const frames = wxLayers.value[id]?.frames ?? [];
  if (!l?.animated) return frames[frames.length - 1] ?? null;
  return frameFor(frames, time, 3 * 3600_000);
}

// ---- risk per school ----
export const riskConfig = signal<RiskConfig>(loadRiskConfig());
effect(() => saveRiskConfig(riskConfig.value));
export interface SchoolRisk { now: RiskResult; max6: RiskLevel; max24: RiskLevel }
export const schoolRisk = signal<Map<string, SchoolRisk>>(new Map());
export const highRiskOnly = signal(false);

const ORDER: RiskLevel[] = ['low', 'moderate', 'high', 'severe'];
const maxLevel = (a: RiskLevel, b: RiskLevel) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

/** Inputs for one point at one time from the model grid + official alerts + cyclone polygons. */
export function riskInputsAt(lat: number, lon: number, time: number) {
  const g = models().grid;
  const rain = g ? valueAt(fieldAt(g, 'precipitation', time) ?? emptyField, lat, lon) : null;
  const gust = g ? valueAt(fieldAt(g, 'wind_gusts_10m', time) ?? emptyField, lat, lon) : null;
  const acc = g ? accumulation(g, time, 24) : null;
  const accum = acc ? valueAt(acc, lat, lon) : null;
  const cyclone = getLayer('cyclones');
  const geoms = cyclone?.render.type === 'vector' ? cyclone.render.data(time) : null;
  const official = lkAlerts().some((e) => e.level !== 'Green') || insideAny(geoms, lon, lat);
  return { rain, gust, accum, official };
}
const emptyField = { lats: [0, 1], lons: [0, 1], values: [null, null, null, null] };

export function recomputeRisk() {
  const ds = dataset.value;
  const g = models().grid;
  if (!ds || !g) return;
  const cfg = riskConfig.value, H = 3600_000, now = Math.floor(Date.now() / H) * H;
  // Fields are computed once per hour step (25 steps), then each school only interpolates.
  const steps = Array.from({ length: 25 }, (_, h) => now + h * H).map((t) => ({
    rain: fieldAt(g, 'precipitation', t), gust: fieldAt(g, 'wind_gusts_10m', t), acc: accumulation(g, t, 24),
    geoms: (() => { const c = getLayer('cyclones'); return c?.render.type === 'vector' ? c.render.data(t) : null; })(),
  }));
  const officialLk = lkAlerts().some((e) => e.level !== 'Green');
  const out = new Map<string, SchoolRisk>();
  for (const s of ds.schools) {
    const at = (k: number) => {
      const st = steps[k];
      return riskScore({
        rain: st.rain ? valueAt(st.rain, s.lat, s.lon) : null,
        gust: st.gust ? valueAt(st.gust, s.lat, s.lon) : null,
        accum: st.acc ? valueAt(st.acc, s.lat, s.lon) : null,
        official: officialLk || insideAny(st.geoms, s.lon, s.lat),
      }, cfg);
    };
    const nowR = at(0);
    let max6 = nowR.level, max24 = nowR.level;
    for (let k = 1; k < steps.length; k++) {
      const l = at(k).level;
      if (k <= 6) max6 = maxLevel(max6, l);
      max24 = maxLevel(max24, l);
    }
    out.set(s.id, { now: nowR, max6, max24 });
  }
  schoolRisk.value = out;
}
effect(() => { riskConfig.value; dataset.value; recomputeRisk(); });

export const riskCounts = computed(() => {
  let now = 0, h6 = 0, h24 = 0;
  for (const r of schoolRisk.value.values()) {
    if (isHigh(r.now.level)) now++;
    if (isHigh(r.max6)) h6++;
    if (isHigh(r.max24)) h24++;
  }
  return { now, h6, h24 };
});

// ---- internal automatic notices (authorities, opt-in) ----
export const autoNotices = signal(false);
export const notices = signal<{ time: number; count: number; window: '6h' | '24h' }[]>([]);
let lastNoticeKey = '';
effect(() => {
  const c = riskCounts.value;
  if (!autoNotices.value || c.h6 === 0) return;
  const key = `${c.h6}-${new Date().getHours()}`;
  if (key === lastNoticeKey) return;
  lastNoticeKey = key;
  notices.value = [{ time: Date.now(), count: c.h6, window: '6h' as const }, ...notices.value].slice(0, 10);
});
