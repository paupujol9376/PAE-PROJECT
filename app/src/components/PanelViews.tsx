import { useMemo, useState } from 'preact/hooks';
import { Crosshair, Share2 } from 'lucide-preact';
import { dataset, dataError, dialog, flyTo, levelFilter, roadGroups } from '../state';
import { href, navigate, route, type Route } from '../router';
import { areaName, fmtDate, fmtNumber, t, type Key } from '../i18n';
import type { AdminArea, Dataset, Level, School } from '../data/types';
import { StatusDot } from './ui';

const LEVELS: Level[] = ['primary', 'secondary', 'primary_secondary'];

function Link(props: { to: Route; children: preact.ComponentChildren; class?: string; onNav?: () => void }) {
  return (
    <a class={props.class} href={href(props.to)} onClick={(e) => { e.preventDefault(); navigate(props.to); props.onNav?.(); }}>
      {props.children}
    </a>
  );
}

export function Breadcrumb() {
  const ds = dataset.value;
  const r = route.value;
  const items: { label: string; to?: Route }[] = [{ label: t('crumb.country'), to: { name: 'home' } }];
  if (ds) {
    let school: School | undefined, district: AdminArea | undefined, province: AdminArea | undefined;
    if (r.name === 'school') { school = ds.byId.get(r.id); district = school?.district; province = school?.province; }
    if (r.name === 'district') { district = ds.districts[r.id]; province = provinceOf(ds, district); }
    if (r.name === 'province') province = ds.provinces[r.id];
    if (province) items.push({ label: areaName(province), to: { name: 'province', id: province.id } });
    if (district) items.push({ label: areaName(district), to: { name: 'district', id: district.id } });
    if (school) items.push({ label: school.name });
  }
  items[items.length - 1].to = undefined;
  return (
    <nav class="crumb" aria-label={t('crumb.label')}>
      <ol>
        {items.map((it, i) => (
          <li key={i}>{it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}

function provinceOf(ds: Dataset, d?: AdminArea) {
  if (!d) return undefined;
  const s = ds.schools.find((x) => x.district?.id === d.id && x.province);
  return s?.province;
}

function DataAge() {
  const ds = dataset.value;
  return ds ? <p class="small muted">{t('data.age', { date: fmtDate(ds.exportedAt || ds.generatedAt) })} · © OpenStreetMap</p> : null;
}

function ConnectivityCard(props: { schools: School[] }) {
  const connected = props.schools.filter((s) => s.connectivity === 'connected').length;
  const withSpeed = props.schools.filter((s) => s.downloadMbps?.length).length;
  const hasData = props.schools.some((s) => s.connectivity !== 'unknown');
  const estimate = dataset.value?.connectivity?.kind === 'estimate';
  return (
    <>
      <section class="card" aria-labelledby="kpi-h">
        <h3 id="kpi-h">{t('kpi.title')}</h3>
        <div class="kpis">
          <div class="kpi"><b data-testid="kpi-total">{fmtNumber(props.schools.length)}</b><span>{t('kpi.onMap')}</span></div>
          <div class="kpi"><b data-testid="kpi-connected">{hasData ? `${estimate ? '≈' : ''}${fmtNumber(connected)}` : '–'}</b><span>{t('kpi.connected')}{estimate ? ` (${t('status.estimated')})` : ''}</span></div>
          <div class="kpi"><b>{withSpeed ? fmtNumber(withSpeed) : '–'}</b><span>{t('kpi.withSpeed')}</span></div>
        </div>
        {estimate && <p class="notice">{t('notice.estimate')}</p>}
      </section>
      <section class="card" aria-labelledby="speed-h">
        <h3 id="speed-h">{t('speed.title')}</h3>
        <div class="metric">{t('speed.noData')}</div>
        {!hasData && <p class="notice">{t('notice.noConnectivity')}</p>}
      </section>
    </>
  );
}

function LevelFilter() {
  const sel = levelFilter.value;
  const toggle = (l: Level) => {
    const next = new Set(sel);
    next.has(l) ? next.delete(l) : next.add(l);
    levelFilter.value = next;
  };
  return (
    <section class="card" aria-labelledby="lvl-h">
      <h3 id="lvl-h">{t('filters.title')}</h3>
      <div class="chips" role="group" aria-labelledby="lvl-h">
        {LEVELS.map((l) => (
          <button key={l} class="chip" aria-pressed={sel.has(l)} onClick={() => toggle(l)}>{t(`level.${l}` as Key)}</button>
        ))}
      </div>
      {sel.size > 0 && <button class="link small" onClick={() => (levelFilter.value = new Set())}>{t('filters.clear')}</button>}
    </section>
  );
}

export function RoadChips() {
  const groups: [string, Key][] = [['major', 'roads.major'], ['local', 'roads.local'], ['rural', 'roads.rural'], ['active', 'roads.active'], ['other', 'roads.other']];
  const sel = roadGroups.value;
  return (
    <section class="card" aria-labelledby="roads-h">
      <h3 id="roads-h">{t('roads.title')}</h3>
      <div class="chips" role="group" aria-labelledby="roads-h">
        {groups.map(([g, k]) => (
          <button key={g} class="chip" aria-pressed={sel.has(g)} onClick={() => {
            const n = new Set(sel);
            n.has(g) ? n.delete(g) : n.add(g);
            roadGroups.value = n;
          }}>{t(k)}</button>
        ))}
      </div>
    </section>
  );
}

function AreaList(props: { title: string; areas: AdminArea[]; kind: 'district' | 'province'; counts: Map<number, number> }) {
  return (
    <section class="card" aria-label={props.title}>
      <h3>{props.title}</h3>
      <ul class="list">
        {[...props.areas].sort((a, b) => areaName(a).localeCompare(areaName(b))).map((a) => (
          <li key={a.id}>
            <Link to={{ name: props.kind, id: a.id }} onNav={() => flyTo({ bbox: a.bbox })}>
              <span>{areaName(a)}</span><span class="count">{t('area.schools', { n: fmtNumber(props.counts.get(a.id) ?? 0) })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function useFiltered(schools: School[]) {
  const sel = levelFilter.value;
  return useMemo(() => (sel.size ? schools.filter((s) => sel.has(s.level)) : schools), [schools, sel]);
}

export function Overview() {
  const ds = dataset.value!;
  const schools = useFiltered(ds.schools);
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of schools) if (s.province) m.set(s.province.id, (m.get(s.province.id) ?? 0) + 1);
    return m;
  }, [schools]);
  return (
    <>
      <h1 class="title">{t('overview.title')}</h1>
      <ConnectivityCard schools={schools} />
      <LevelFilter />
      <RoadChips />
      <AreaList title={t('provinces.title')} areas={ds.provinces} kind="province" counts={counts} />
      <ShareRow />
      <DataAge />
    </>
  );
}

export function AreaView(props: { kind: 'district' | 'province'; id: number }) {
  const ds = dataset.value!;
  const area = (props.kind === 'district' ? ds.districts : ds.provinces)[props.id];
  const inArea = useMemo(() => ds.schools.filter((s) => (props.kind === 'district' ? s.district : s.province)?.id === props.id), [ds, props.kind, props.id]);
  const schools = useFiltered(inArea);
  const [limit, setLimit] = useState(100);
  const districtCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of schools) if (s.district) m.set(s.district.id, (m.get(s.district.id) ?? 0) + 1);
    return m;
  }, [schools]);
  if (!area) return <NotFound />;
  const districts = props.kind === 'province' ? ds.districts.filter((d) => districtCounts.has(d.id)) : [];
  const sorted = [...schools].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <h1 class="title">{areaName(area)}</h1>
      <p class="muted">{t(props.kind === 'district' ? 'kind.district' : 'kind.province')}</p>
      <ConnectivityCard schools={schools} />
      <LevelFilter />
      {props.kind === 'province' && <AreaList title={t('districts.title')} areas={districts} kind="district" counts={districtCounts} />}
      {props.kind === 'district' && (
        <section class="card" aria-label={t('area.list')}>
          <h3>{t('area.list')}</h3>
          <ul class="list">
            {sorted.slice(0, limit).map((s) => (
              <li key={s.id}>
                <Link to={{ name: 'school', id: s.id }} onNav={() => flyTo({ center: [s.lon, s.lat], zoom: 14 })}>
                  <span>{s.name}</span><span class="count">{t(`level.${s.level}` as Key)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {sorted.length > limit && <button class="btn" onClick={() => setLimit(limit + 200)}>{t('area.showMore', { n: fmtNumber(Math.min(200, sorted.length - limit)) })}</button>}
        </section>
      )}
      <ShareRow />
      <DataAge />
    </>
  );
}

export function SchoolView(props: { id: string }) {
  const ds = dataset.value!;
  const s = ds.byId.get(props.id);
  if (!s) return <NotFound />;
  return (
    <>
      <h1 class="title">{s.name}</h1>
      <p class="status"><StatusDot status={s.connectivity} />{t('school.status')}: {t(`status.${s.connectivity}` as Key)}{ds.connectivity?.kind === 'estimate' && s.connectivity !== 'unknown' ? ` (${t('status.estimated')})` : ''}</p>
      {ds.connectivity?.kind === 'estimate' && <p class="notice">{t('notice.estimate')}</p>}
      <section class="card" aria-labelledby="sd-h">
        <h3 id="sd-h">{t('school.details')}</h3>
        <dl class="dl">
          <dt>{t('school.level')}</dt><dd>{t(`level.${s.level}` as Key)}</dd>
          {s.district && <><dt>{t('school.district')}</dt><dd><Link to={{ name: 'district', id: s.district.id }}>{areaName(s.district)}</Link></dd></>}
          {s.province && <><dt>{t('school.province')}</dt><dd><Link to={{ name: 'province', id: s.province.id }}>{areaName(s.province)}</Link></dd></>}
          <dt>{t('school.location')}</dt><dd>{s.lat.toFixed(5)}, {s.lon.toFixed(5)}</dd>
          <dt>{t('school.gigaId')}</dt><dd class="small">{s.id}</dd>
          <dt>{t('school.source')}</dt><dd>{t('school.sourceValue')}</dd>
        </dl>
      </section>
      <section class="card" aria-labelledby="speed-s">
        <h3 id="speed-s">{t('speed.title')}</h3>
        <div class="metric">{t('speed.noData')}</div>
      </section>
      <div class="btn-row">
        <button class="btn" onClick={() => flyTo({ center: [s.lon, s.lat], zoom: 15 })}><Crosshair size={18} aria-hidden="true" />{t('school.zoomTo')}</button>
        <button class="btn" onClick={() => (dialog.value = 'share')}><Share2 size={18} aria-hidden="true" />{t('share.button')}</button>
      </div>
      <DataAge />
    </>
  );
}

function ShareRow() {
  return (
    <div class="btn-row">
      <button class="btn" onClick={() => (dialog.value = 'share')}><Share2 size={18} aria-hidden="true" />{t('share.button')}</button>
    </div>
  );
}

function NotFound() {
  return (
    <>
      <p class="notice danger">{t('school.notFound')}</p>
      <Link to={{ name: 'home' }} class="link">{t('crumb.country')}</Link>
    </>
  );
}

export function PanelContent() {
  const ds = dataset.value;
  const r = route.value;
  if (dataError.value) return <ErrorState />;
  if (!ds) return <Loading />;
  if (r.name === 'school') return <SchoolView id={r.id} />;
  if (r.name === 'district' || r.name === 'province') return <AreaView kind={r.name} id={r.id} />;
  return <Overview />;
}

function Loading() {
  return (
    <div aria-busy="true" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <p class="muted">{t('data.loading')}</p>
      <div class="skeleton" /><div class="skeleton" /><div class="skeleton" style={{ width: '60%' }} />
    </div>
  );
}

function ErrorState() {
  return (
    <div role="alert" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <p class="notice danger">{t('data.error')}</p>
      <button class="btn" onClick={() => location.reload()}>{t('data.retry')}</button>
    </div>
  );
}
