import { useEffect, useState } from 'preact/hooks';
import { Accessibility, Layers, List, Minus, Plus } from 'lucide-preact';
import type { Map as MLMap } from 'maplibre-gl';
import { a11y, dialog, legendOpen, mapZoom, roadHighlight, roadStats, statusFilter, theme } from '../state';
import { ROAD_CLASSES } from '../map/style';
import { fmtDate, fmtNumber, t, type Key } from '../i18n';
import { StatusDot } from './ui';

const map = () => (window as unknown as { __map?: MLMap }).__map;

export function MapControls(props: { basic?: boolean }) {
  return (
    <div class="controls" role="toolbar" aria-label="Map controls" aria-orientation="vertical">
      <button class="icon-btn" aria-label={t('controls.zoomIn')} title={t('controls.zoomIn')} onClick={() => map()?.zoomIn()}><Plus size={20} /></button>
      <button class="icon-btn" aria-label={t('controls.zoomOut')} title={t('controls.zoomOut')} onClick={() => map()?.zoomOut()}><Minus size={20} /></button>
      <button class="icon-btn" aria-label={t('a11y.title')} title={t('a11y.title')} aria-pressed={a11y.value} onClick={() => (dialog.value = 'a11y')}><Accessibility size={20} /></button>
      {!props.basic && <button class="icon-btn" aria-label={t('layers.title')} title={t('layers.title')} onClick={() => (dialog.value = 'layers')}><Layers size={20} /></button>}
      <button class="icon-btn" aria-label={t(legendOpen.value ? 'controls.legendHide' : 'controls.legendShow')} title={t('legend.title')} aria-pressed={legendOpen.value}
        onClick={() => (legendOpen.value = !legendOpen.value)}><List size={20} /></button>
    </div>
  );
}

// Legend row -> swatch colour token -> road classes it stands for (same mapping as the map style).
const ROAD_ROWS: { swatch: string; key: Key; classes: string[] }[] = [
  { swatch: 'motorway', key: 'road.motorway', classes: ['motorway'] },
  { swatch: 'trunk', key: 'road.trunk', classes: ['trunk'] },
  { swatch: 'primary', key: 'road.primary', classes: ['primary'] },
  { swatch: 'secondary', key: 'road.secondary', classes: ['secondary'] },
  { swatch: 'tertiary', key: 'road.tertiary', classes: ['tertiary'] },
  { swatch: 'residential', key: 'road.local', classes: ['residential'] },
  { swatch: 'track', key: 'road.track', classes: ['track'] },
  { swatch: 'path', key: 'road.path', classes: ['path', 'footway', 'steps'] },
];

function sumStats(classes: string[]) {
  const st = roadStats.value;
  if (!st) return null;
  const refs: Record<string, number> = {}, tags: Record<string, number> = {};
  let ways = 0, km = 0;
  for (const c of classes) {
    const x = st.classes[c];
    if (!x) continue;
    ways += x.ways; km += x.km;
    for (const [k, v] of Object.entries(x.refPrefixes)) refs[k] = (refs[k] ?? 0) + v;
    for (const [k, v] of Object.entries(x.highway)) tags[k] = (tags[k] ?? 0) + v;
  }
  return { ways, km, refs, tags, date: st.generatedAt };
}

/** Zoom from which the tiles contain these classes (pipeline/roads.yml min zooms, mirrored in style.ts). */
const minZoom = (classes: string[]) =>
  Math.min(...ROAD_CLASSES.filter((r) => classes.includes(r.cls) || (r.also ?? []).some((a) => classes.includes(a))).map((r) => r.minzoom));

function RoadDetail(props: { classes: string[] }) {
  const s = sumStats(props.classes);
  if (!s) return null;
  // Road numbers: only short letter prefixes (A, B, AB…); free-text refs are left out.
  // Only prefixes on at least 1 % of the segments (min. 5), so stray free-text refs are not shown as road numbers.
  const minRefs = Math.max(5, Math.ceil(s.ways * 0.01));
  const refs = Object.entries(s.refs).filter(([k, v]) => /^[A-Z]{1,2}$/.test(k) && v >= minRefs).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const tags = Object.entries(s.tags).sort((a, b) => b[1] - a[1]).map(([k]) => k).join(', ');
  return (
    <div class="road-detail" aria-live="polite">
      {minZoom(props.classes) > mapZoom.value && <p class="notice">{t('legend.zoomIn', { z: minZoom(props.classes) })}</p>}
      <p><b>{t('legend.ways', { n: fmtNumber(s.ways) })}</b> · <b>{t('legend.km', { km: fmtNumber(Math.round(s.km)) })}</b></p>
      <p>{refs.length ? t('legend.refs', { refs: refs.map(([k, v]) => `${k} ${fmtNumber(v)}`).join(' · ') }) : t('legend.noRefs')}</p>
      <p>{t('legend.osmTags', { tags })}</p>
      <p class="muted">{t('legend.kmNote')} {t('legend.source', { date: fmtDate(s.date) })}</p>
    </div>
  );
}

export function LegendBody(props: { mode?: 'full' | 'basic' }) {
  theme.value; // re-render on theme change (swatches read CSS variables)
  const sf = statusFilter.value;
  const toggleStatus = (s: 'connected' | 'not_connected' | 'unknown') => {
    const n = new Set(sf);
    n.has(s) ? n.delete(s) : n.add(s);
    statusFilter.value = n;
  };
  const statusRows = (['connected', 'not_connected', 'unknown'] as const);
  return (
    <>
      <h4>{t('legend.status')}</h4>
      {props.mode === 'basic' ? statusRows.map((s) => (
        <div class="li" key={s}><StatusDot status={s} />{t(`status.${s}` as Key)}</div>
      )) : (
        <>
          <p class="small muted legend-hint">{t('legend.statusHint')}</p>
          <ul class="road-rows">
            {statusRows.map((s) => (
              <li key={s}><button class="li road-row" aria-pressed={sf.has(s)} onClick={() => toggleStatus(s)}><StatusDot status={s} /><span class="road-name">{t(`status.${s}` as Key)}</span></button></li>
            ))}
          </ul>
        </>
      )}
      {props.mode === 'basic' && (
        <>
          <h4>{t('legend.risk')}</h4>
          <div class="li"><span class="swatch risk" aria-hidden="true" /><span class="muted">{t('legend.riskNoData')}</span></div>
        </>
      )}
      {props.mode === 'basic' ? null : <h4>{t('legend.roads')}</h4>}
      {props.mode !== 'basic' && <p class="small muted legend-hint">{t('legend.hint')}</p>}
      {props.mode !== 'basic' && <ul class="road-rows">
        {ROAD_ROWS.map((r) => {
          const sel = roadHighlight.value;
          const on = !!sel && sel.join() === r.classes.join();
          const s = sumStats(r.classes);
          return (
            <li key={r.swatch}>
              <button class="li road-row" aria-pressed={on} onClick={() => (roadHighlight.value = on ? null : r.classes)}>
                <span class="swatch" aria-hidden="true" style={{ background: `var(--road-${r.swatch})`, color: `var(--road-${r.swatch})` }} />
                <span class="road-name">{t(r.key)}</span>
                {s && <span class="road-km">{t('legend.km', { km: fmtNumber(Math.round(s.km)) })}</span>}
              </button>
              {on && <RoadDetail classes={r.classes} />}
            </li>
          );
        })}
      </ul>}
      {props.mode !== 'basic' && roadHighlight.value && <button class="link small" onClick={() => (roadHighlight.value = null)}>{t('legend.clear')}</button>}
    </>
  );
}

export function Legend(props: { mode?: 'full' | 'basic' }) {
  if (!legendOpen.value) return null;
  return <section class="legend" aria-label={t('legend.title')}><LegendBody mode={props.mode} /></section>;
}

/** Small hook: re-render every second while a value is changing (used for progress). */
export function useTick(active: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => set((x) => x + 1), 1000);
    return () => clearInterval(h);
  }, [active]);
}
