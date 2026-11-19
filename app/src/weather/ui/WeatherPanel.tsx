import { useEffect, useState } from 'preact/hooks';
import { ExternalLink, X } from 'lucide-preact';
import { allLayers } from '../layers';
import { activeIds, autoNotices, highRiskOnly, MAX_MOBILE, notices, riskConfig, riskCounts, schoolRisk, setOpacity, toggleLayer, wxLayers, wxPanelOpen } from '../store';
import { DEFAULT_RISK, isHigh, type RiskConfig } from '../risk';
import { models } from '../openMeteo';
import type { WeatherProvider } from '../types';
import { dataset, isMobile, showToast } from '../../state';
import { navigate } from '../../router';
import { alertDraft } from '../../alerts/store';
import { fmtNumber, t, type Key } from '../../i18n';
import { Switch } from '../../components/ui';

export function ago(ts: number | null) {
  if (!ts) return '–';
  const m = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  return m < 90 ? t('wx.ago.min', { n: m }) : t('wx.ago.h', { n: Math.round(m / 60) });
}

function LegendBar(props: { p: WeatherProvider }) {
  const lg = props.p.getLegend();
  if (!lg.stops.length) return null;
  return (
    <div class="wx-legend" aria-label={`${t(props.p.titleKey)} ${lg.unit}`}>
      <div class="wx-ramp" style={{ background: `linear-gradient(90deg, ${lg.stops.map((s) => s.color).join(', ')})` }} />
      <div class="wx-ticks small muted">
        {lg.unit && lg.stops.length > 2 ? <><span>{lg.stops[0].value}</span><span>{lg.stops[Math.floor(lg.stops.length / 2)].value}</span><span>{lg.stops[lg.stops.length - 1].value} {lg.unit}</span></> : null}
      </div>
      {lg.noteKey && <p class="small muted">{t(lg.noteKey)}</p>}
    </div>
  );
}

function LayerRow(props: { p: WeatherProvider }) {
  const p = props.p;
  const st = wxLayers.value[p.id];
  const cov = p.getCoverage();
  const disabled = p.status === 'disabled';
  const [opt, setOpt] = useState<Record<string, string>>({});
  const onToggle = () => { if (!toggleLayer(p.id)) showToast(t('wx.limitMobile')); };
  const statusText = !st?.on ? '' : st.status === 'loading' ? t('wx.status.loading') : st.status === 'unavailable' ? t('wx.status.unavailable')
    : st.status === 'cached' ? t('wx.status.cached', { ago: ago(st.savedAt) }) : t('wx.status.live', { ago: ago(st.savedAt) });
  return (
    <li class={`wx-row${disabled ? ' disabled' : ''}`}>
      {disabled ? (
        <div class="switch-row"><span>{t(p.titleKey)}</span><span class="badge">{t('wx.status.unavailable')}</span></div>
      ) : (
        <Switch id={`wx-${p.id}`} label={t(p.titleKey)} checked={!!st?.on} onChange={onToggle} />
      )}
      {disabled && <p class="small muted">{t(p.disabledReasonKey!)}</p>}
      {disabled && p.link && <a class="link small" href={p.link.url} target="_blank" rel="noopener">{t(p.link.labelKey)} <ExternalLink size={12} aria-hidden="true" /></a>}
      {!disabled && st?.on && (
        <div class="wx-detail">
          <p class={`small ${st.status === 'unavailable' ? 'warn' : 'muted'}`} aria-live="polite">{statusText}</p>
          <label class="wx-opacity small">
            <span>{t('wx.opacityLabel')}</span>
            <input type="range" min="0.1" max="1" step="0.05" value={st.opacity} aria-label={t('wx.opacity', { name: t(p.titleKey) })}
              onInput={(e) => setOpacity(p.id, Number((e.target as HTMLInputElement).value))} />
          </label>
          {p.options?.map((o) => (
            <label key={o.id} class="wx-opacity small">
              <span>{t(o.labelKey)}</span>
              <select class="select" value={opt[o.id] ?? o.values[0].value} onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                setOpt({ ...opt, [o.id]: v }); p.setOption?.(o.id, v);
                wxLayers.value = { ...wxLayers.value }; // repaint
              }}>
                {o.values.map((v) => <option key={v.value} value={v.value}>{t(v.labelKey)}</option>)}
              </select>
            </label>
          ))}
          <LegendBar p={p} />
          <details class="more">
            <summary>{t('common.moreInfo')}</summary>
            <p class="small muted">
              {t('wx.coverage', { cov: t(`wx.${cov.sriLanka}` as Key), fc: t(cov.forecast ? 'wx.yes' : 'wx.no'), res: cov.resolution, upd: cov.update })}
              {cov.latency ? ` · ${cov.latency}` : ''}
            </p>
            <p class="small muted">{t('wx.source')}: <a class="link" href={p.getAttribution().url} target="_blank" rel="noopener">{p.getAttribution().text}</a></p>
            {p.link && <a class="link small" href={p.link.url} target="_blank" rel="noopener">{t(p.link.labelKey)} <ExternalLink size={12} aria-hidden="true" /></a>}
          </details>
        </div>
      )}
    </li>
  );
}

function Num(props: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label class="risk-num small"><span>{props.label}</span>
      <input class="text-input" type="number" step={props.step ?? 1} value={props.value} onChange={(e) => props.onChange(Number((e.target as HTMLInputElement).value))} />
    </label>
  );
}

function RiskSection() {
  const c = riskCounts.value;
  const cfg = riskConfig.value;
  const hasData = !!models().grid && schoolRisk.value.size > 0;
  const set = (fn: (x: RiskConfig) => void) => { const n = structuredClone(cfg); fn(n); riskConfig.value = n; };
  const prepare = () => {
    const ds = dataset.value;
    if (!ds) return;
    const ids = [...schoolRisk.value.entries()].filter(([, r]) => isHigh(r.max6)).map(([id]) => id);
    const schools = ids.map((id) => ds.byId.get(id)!).filter(Boolean);
    const cyclone = [...schoolRisk.value.values()].some((r) => isHigh(r.max6) && r.now.factors[0]?.id === 'official');
    const type = cyclone ? 'evacuation' : 'flood';
    const recipients = schools.length > 0 && schools.length <= 30
      ? { kind: 'school' as const, schools: schools.map((s) => s.id) }
      : { kind: 'district' as const, districts: [...new Set(schools.map((s) => s.district?.name.en).filter(Boolean) as string[])] };
    alertDraft.value = { type, text: t(cyclone ? 'risk.draft.evacuation' : 'risk.draft.flood'), recipients };
    navigate({ name: 'alerts' });
  };
  return (
    <section class="wx-risk" aria-labelledby="risk-h">
      <h3 id="risk-h">{t('risk.title')}</h3>
      {!hasData ? <p class="small muted">{t('risk.noData')}</p> : (
        <>
          <p class="small">{t('risk.counts')}:</p>
          <div class="kpis">
            <div class="kpi"><b>{fmtNumber(c.now)}</b><span>{t('risk.now')}</span></div>
            <div class="kpi"><b>{fmtNumber(c.h6)}</b><span>{t('risk.h6')}</span></div>
            <div class="kpi"><b>{fmtNumber(c.h24)}</b><span>{t('risk.h24')}</span></div>
          </div>
          <Switch id="risk-only" label={t('risk.onlyHigh')} checked={highRiskOnly.value} onChange={(v) => (highRiskOnly.value = v)} />
          <button class="btn primary" disabled={c.h6 === 0} onClick={prepare}>{t('risk.prepare')}</button>
          <p class="small muted">{t('risk.prepareHint')}</p>
          <Switch id="risk-auto" label={t('risk.auto')} checked={autoNotices.value} onChange={(v) => (autoNotices.value = v)} />
          {autoNotices.value && notices.value.slice(0, 3).map((n) => (
            <p key={n.time} class="notice" role="status">{t('risk.notice', { n: fmtNumber(n.count), w: t('risk.h6') })} · {ago(n.time)}</p>
          ))}
        </>
      )}
      <details class="risk-formula">
        <summary>{t('risk.formula')}</summary>
        <p class="small muted">{t('risk.formulaText')}</p>
        {(['rain', 'gust', 'accum'] as const).map((k) => (
          <fieldset key={k} class="risk-grid">
            <legend class="fs small">{t(`risk.f.${k}` as Key)}</legend>
            <Num label={t('risk.weight')} step={0.05} value={cfg.weights[k]} onChange={(v) => set((x) => { x.weights[k] = v; })} />
            <Num label={t('risk.low')} value={cfg.ranges[k][0]} onChange={(v) => set((x) => { x.ranges[k][0] = v; })} />
            <Num label={t('risk.high')} value={cfg.ranges[k][1]} onChange={(v) => set((x) => { x.ranges[k][1] = v; })} />
          </fieldset>
        ))}
        <fieldset class="risk-grid">
          <legend class="fs small">{t('risk.f.official')}</legend>
          <Num label={t('risk.weight')} step={0.05} value={cfg.weights.official} onChange={(v) => set((x) => { x.weights.official = v; })} />
        </fieldset>
        <fieldset class="risk-grid">
          <legend class="fs small">{t('risk.levels')}</legend>
          {(['moderate', 'high', 'severe'] as const).map((l) => <Num key={l} label={t(`risk.level.${l}` as Key)} step={0.05} value={cfg.levels[l]} onChange={(v) => set((x) => { x.levels[l] = v; })} />)}
        </fieldset>
        <button class="btn" onClick={() => (riskConfig.value = DEFAULT_RISK)}>{t('risk.reset')}</button>
      </details>
    </section>
  );
}

/** Weather layer panel. readOnly (adult): layers and legends only, no risk tools or alerts. */
export function WeatherPanel(props: { readOnly?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') wxPanelOpen.value = false; };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  if (!wxPanelOpen.value) return null;
  return (
    <section class="wx-panel" aria-labelledby="wx-h">
      <div class="dlg-head">
        <h2 id="wx-h">{t('wx.title')}</h2>
        <button class="icon-btn" aria-label={t('wx.close')} onClick={() => (wxPanelOpen.value = false)}><X size={20} /></button>
      </div>
      <p class="small muted">{t('wx.disclaimer')}</p>
      {isMobile.value && <p class="small muted">{t('wx.limitMobile')} ({activeIds.value.length}/{MAX_MOBILE})</p>}
      <ul class="wx-list">{allLayers().map((p) => <LayerRow key={p.id} p={p} />)}</ul>
      {!props.readOnly && <RiskSection />}
    </section>
  );
}
