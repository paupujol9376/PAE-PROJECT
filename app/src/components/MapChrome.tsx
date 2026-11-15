import { useEffect, useState } from 'preact/hooks';
import { Accessibility, Layers, List, Minus, Plus } from 'lucide-preact';
import type { Map as MLMap } from 'maplibre-gl';
import { a11y, dialog, legendOpen, theme } from '../state';
import { t, type Key } from '../i18n';
import { StatusDot } from './ui';

const map = () => (window as unknown as { __map?: MLMap }).__map;

export function MapControls() {
  return (
    <div class="controls" role="toolbar" aria-label="Map controls" aria-orientation="vertical">
      <button class="icon-btn" aria-label={t('controls.zoomIn')} title={t('controls.zoomIn')} onClick={() => map()?.zoomIn()}><Plus size={20} /></button>
      <button class="icon-btn" aria-label={t('controls.zoomOut')} title={t('controls.zoomOut')} onClick={() => map()?.zoomOut()}><Minus size={20} /></button>
      <button class="icon-btn" aria-label={t('a11y.title')} title={t('a11y.title')} aria-pressed={a11y.value} onClick={() => (dialog.value = 'a11y')}><Accessibility size={20} /></button>
      <button class="icon-btn" aria-label={t('layers.title')} title={t('layers.title')} onClick={() => (dialog.value = 'layers')}><Layers size={20} /></button>
      <button class="icon-btn" aria-label={t(legendOpen.value ? 'controls.legendHide' : 'controls.legendShow')} title={t('legend.title')} aria-pressed={legendOpen.value}
        onClick={() => (legendOpen.value = !legendOpen.value)}><List size={20} /></button>
    </div>
  );
}

const ROAD_ROWS: [string, Key][] = [
  ['motorway', 'road.motorway'], ['trunk', 'road.trunk'], ['primary', 'road.primary'], ['secondary', 'road.secondary'],
  ['tertiary', 'road.tertiary'], ['residential', 'road.local'], ['track', 'road.track'], ['path', 'road.path'],
];

export function LegendBody() {
  theme.value; // re-render on theme change (swatches read CSS variables)
  return (
    <>
      <h4>{t('legend.status')}</h4>
      {(['connected', 'not_connected', 'unknown'] as const).map((s) => (
        <div class="li" key={s}><StatusDot status={s} />{t(`status.${s}` as Key)}</div>
      ))}
      <h4>{t('legend.roads')}</h4>
      {ROAD_ROWS.map(([cls, k]) => (
        <div class="li" key={cls}><span class="swatch" aria-hidden="true" style={{ background: `var(--road-${cls})`, color: `var(--road-${cls})` }} />{t(k)}</div>
      ))}
    </>
  );
}

export function Legend() {
  if (!legendOpen.value) return null;
  return <section class="legend" aria-label={t('legend.title')}><LegendBody /></section>;
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
