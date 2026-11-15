import { useEffect, useState } from 'preact/hooks';
import { getLayer } from '../layers';
import { activeIds, schoolRisk, wxLayers, wxTime } from '../store';
import type { PointValue } from '../types';
import type { RiskResult } from '../risk';
import { fmtNumber, t, type Key } from '../../i18n';

const fmt = (v: number | null, unit: string) => (v == null ? t('wx.noValue') : `${fmtNumber(Math.round(v * 10) / 10)} ${unit}`.trim());
const arrow = { up: '↑', down: '↓', flat: '→' } as const;

/** Values of every active layer at a point (map tap or school), with trend over the next 3 h. */
export function PointWeather(props: { lat: number; lon: number }) {
  const [rows, setRows] = useState<{ layer: string; values: PointValue[] }[] | null>(null);
  const ids = activeIds.value, time = wxTime.value;
  // re-query when layer data arrives (frames/status change), not only when the point changes
  const dataKey = ids.map((id) => `${id}:${wxLayers.value[id]?.status}:${wxLayers.value[id]?.savedAt}`).join();
  useEffect(() => {
    let alive = true;
    Promise.all(ids.map(async (id) => ({ layer: id, values: await getLayer(id)!.getValueAt(props.lat, props.lon, time).catch(() => []) })))
      .then((r) => { if (alive) setRows(r.filter((x) => x.values.length)); });
    return () => { alive = false; };
  }, [props.lat, props.lon, time, dataKey]);
  if (!ids.length) return <p class="small muted">{t('wx.pointEmpty')}</p>;
  if (!rows) return <p class="small muted">{t('wx.status.loading')}</p>;
  return (
    <dl class="dl wx-values">
      {rows.flatMap((r) => r.values.map((v, i) => (
        <>
          <dt key={`${r.layer}-${i}-k`}>{t(v.labelKey)}</dt>
          <dd key={`${r.layer}-${i}-v`}>
            {v.text && v.value == null ? v.text : fmt(v.value, v.unit)}{v.text && v.value != null ? ` ${v.text}` : ''}
            {v.trend && <span class="muted" title={t(`wx.trend.${v.trend}`)}> {arrow[v.trend]} <span class="sr-only">{t(`wx.trend.${v.trend}`)}</span></span>}
          </dd>
        </>
      )))}
    </dl>
  );
}

export function RiskExplain(props: { r: RiskResult }) {
  const r = props.r;
  const top = r.factors.filter((f) => f.weighted > 0).map((f) => `${t(`risk.f.${f.id}` as Key)} ${Math.round(f.weighted * 100)}%`).join(', ');
  return (
    <p class="small">
      <span class={`badge risk-${r.level}`}>{t(`risk.level.${r.level}` as Key)} · {Math.round(r.score * 100)}/100</span>
      {top && <span class="muted"> {t('risk.why', { factors: top })}</span>}
    </p>
  );
}

/** Weather + risk card for one school (school detail view). */
export function SchoolWeather(props: { id: string; lat: number; lon: number }) {
  const r = schoolRisk.value.get(props.id);
  if (!r && !activeIds.value.length) return null;
  return (
    <section class="card" aria-labelledby="sw-h">
      <h3 id="sw-h">{t('risk.school')}</h3>
      {r && <RiskExplain r={r.now} />}
      {r && <p class="small muted">{t('risk.h6')}: {t(`risk.level.${r.max6}` as Key)} · {t('risk.h24')}: {t(`risk.level.${r.max24}` as Key)}</p>}
      <h4 class="small">{t('wx.point')}</h4>
      <PointWeather lat={props.lat} lon={props.lon} />
      <p class="small muted">{t('wx.disclaimer')}</p>
    </section>
  );
}
