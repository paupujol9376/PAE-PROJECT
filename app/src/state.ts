import { computed, effect, signal } from '@preact/signals';
import type { Connectivity, Dataset, LangCode, Level } from './data/types';

// ---- preferences (per device; localStorage may be unavailable, so every access is guarded) ----
const PREFS_KEY = 'pae.prefs.v1';
type ThemePref = 'system' | 'dark' | 'light';
interface Prefs { lang: LangCode; theme: ThemePref; a11y: boolean; roadGroups: string[]; boundaries: boolean; labels: boolean; legend: boolean }
const defaults: Prefs = { lang: 'en', theme: 'system', a11y: false, roadGroups: ['major', 'local'], boundaries: true, labels: true, legend: true };

function readPrefs(): Prefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return defaults;
  }
}
const p = readPrefs();

export const lang = signal<LangCode>(p.lang);
export const themePref = signal<ThemePref>(p.theme);
export const a11y = signal(p.a11y);
export const roadGroups = signal<Set<string>>(new Set(p.roadGroups));
export const showBoundaries = signal(p.boundaries);
export const showLabels = signal(p.labels);
export const legendOpen = signal(p.legend);

effect(() => {
  const v: Prefs = { lang: lang.value, theme: themePref.value, a11y: a11y.value, roadGroups: [...roadGroups.value], boundaries: showBoundaries.value, labels: showLabels.value, legend: legendOpen.value };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(v)); } catch { /* private mode: keep in memory */ }
});

// ---- environment ----
const mql = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null);
const darkMql = mql('(prefers-color-scheme: dark)');
const mobileMql = mql('(max-width: 639px)');
export const systemDark = signal(darkMql ? darkMql.matches || !mql('(prefers-color-scheme: light)')?.matches : true);
darkMql?.addEventListener('change', (e) => (systemDark.value = e.matches));
export const isMobile = signal(mobileMql?.matches ?? false);
mobileMql?.addEventListener('change', (e) => (isMobile.value = e.matches));

export const online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
addEventListener?.('online', () => (online.value = true));
addEventListener?.('offline', () => (online.value = false));

type NetInfo = { effectiveType?: string; saveData?: boolean; addEventListener?: (t: string, f: () => void) => void };
const conn = (typeof navigator !== 'undefined' ? (navigator as Navigator & { connection?: NetInfo }).connection : undefined);
const isSlow = () => !!conn && (conn.saveData === true || ['slow-2g', '2g'].includes(conn.effectiveType || ''));
export const slowNetwork = signal(isSlow());
conn?.addEventListener?.('change', () => (slowNetwork.value = isSlow()));
/** User chose to load the map despite a slow network. */
export const forceMap = signal(false);

/** Effective UI + map theme. */
export const theme = computed<'dark' | 'light' | 'a11y'>(() =>
  a11y.value ? 'a11y' : themePref.value === 'system' ? (systemDark.value ? 'dark' : 'light') : themePref.value,
);

// ---- data ----
export const dataset = signal<Dataset | null>(null);
export const dataError = signal<string | null>(null);
export const levelFilter = signal<Set<Level>>(new Set());
/** Legend status filter (open = connected / closed = not connected); empty = all. */
export const statusFilter = signal<Set<Connectivity>>(new Set());
/** Legend selection: road classes to highlight on the map (null = none). */
export const roadHighlight = signal<string[] | null>(null);
export const mapZoom = signal(7);
export interface RoadStats { generatedAt: string; classes: Record<string, { ways: number; km: number; highway: Record<string, number>; refPrefixes: Record<string, number> }> }
export const roadStats = signal<RoadStats | null>(null);

// ---- UI ----
export type DialogName = 'menu' | 'layers' | 'share' | 'about' | 'offline' | 'a11y' | null;
export const dialog = signal<DialogName>(null);
export const panelOpen = signal(true);
export type Snap = 'peek' | 'half' | 'full';
export const sheetSnap = signal<Snap>('half');
export const toast = signal<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), 4000);
}
/** Map camera requests from the panel (fly to a school or area). */
export const flyRequest = signal<{ center?: [number, number]; zoom?: number; bbox?: [number, number, number, number]; key: number } | null>(null);
export function flyTo(r: Omit<NonNullable<typeof flyRequest.value>, 'key'>) {
  flyRequest.value = { ...r, key: Date.now() };
}
