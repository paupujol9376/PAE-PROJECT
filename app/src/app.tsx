import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { BellRing, ChevronLeft, ChevronRight, LogOut, Menu } from 'lucide-preact';
import { MapView } from './map/MapView';
import { Breadcrumb, PanelContent } from './components/PanelViews';
import { SearchBox } from './components/SearchBox';
import { Legend, MapControls } from './components/MapChrome';
import { A11yDialog, AboutDialog, LayersDialog, MenuDialog, OfflineDialog, ShareDialog } from './components/Dialogs';
import { AlertCard } from './components/Alerts';
import { dataset, dialog, forceMap, isMobile, lang, levelFilter, online, panelOpen, sheetSnap, slowNetwork, statusFilter, theme, toast, type Snap } from './state';
import { tileKeys } from './offline/offline';
import { navigate, route } from './router';
import { t } from './i18n';
import { currentUser, logout, session } from './auth/session';
import { redirectFor } from './auth/guard';
import { LoginView, LangSelect } from './views/LoginView';
import { KidsView } from './views/KidsView';
import { inbox, startAlerts, stopAlerts } from './alerts/store';
import { StatusDot } from './components/ui';
import { WeatherPanel } from './weather/ui/WeatherPanel';
import { TimePlayer } from './weather/ui/TimePlayer';
import { highRiskOnly, startWeather, stopWeather } from './weather/store';

function Brand() {
  return <span class="brand">PAE <b>Map</b></span>;
}

function MenuButton() {
  return <button class="icon-btn" aria-label={t('menu.open')} aria-haspopup="dialog" onClick={() => (dialog.value = 'menu')}><Menu size={20} /></button>;
}

function LogoutButton() {
  return <button class="icon-btn" aria-label={t('session.logout')} title={t('session.logout')} onClick={logout}><LogOut size={20} /></button>;
}

/** Docked side panel on desktop, top bar + bottom sheet on mobile. */
function Shell(props: { head: ComponentChildren; topbar: ComponentChildren; body: ComponentChildren; label: string }) {
  if (isMobile.value) {
    return (
      <>
        <header class="topbar">{props.topbar}</header>
        <BottomSheet label={props.label}>{props.body}</BottomSheet>
      </>
    );
  }
  const open = panelOpen.value;
  return (
    <>
      <aside class={`panel${open ? '' : ' closed'}`} aria-label={props.label} aria-hidden={!open} inert={!open}>
        <div class="panel-head">{props.head}</div>
        <div class="panel-body">{props.body}</div>
      </aside>
      <button class={`panel-tab${open ? '' : ' closed'}`} aria-expanded={open} aria-label={open ? t('panel.hide') : t('panel.show')}
        onClick={() => (panelOpen.value = !open)}>{open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
    </>
  );
}

const SNAPS: Snap[] = ['peek', 'half', 'full'];
function BottomSheet(props: { label: string; children: ComponentChildren }) {
  const snap = sheetSnap.value;
  const cycle = () => (sheetSnap.value = SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length]);
  const onPointerDown = (e: PointerEvent) => {
    const y0 = e.clientY;
    const up = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      const i = SNAPS.indexOf(sheetSnap.value);
      if (dy < -40) sheetSnap.value = SNAPS[Math.min(i + 1, 2)];
      else if (dy > 40) sheetSnap.value = SNAPS[Math.max(i - 1, 0)];
      removeEventListener('pointerup', up);
    };
    addEventListener('pointerup', up);
  };
  return (
    <section class="sheet" data-snap={snap} aria-label={props.label}>
      <button class="sheet-handle" aria-label={t('sheet.resize')} onClick={cycle} onPointerDown={onPointerDown}
        onKeyDown={(e) => { if (e.key === 'Escape') sheetSnap.value = 'peek'; }}><span /></button>
      <div class="panel-body">{props.children}</div>
    </section>
  );
}

function NetworkBanner() {
  if (!online.value) return <div class="banner" role="status">{t('net.offline')}</div>;
  return null;
}

function LiteMode() {
  return (
    <div class="lite">
      <div style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '420px' }}>
        <p>{t('net.lite')}</p>
        <button class="btn primary" onClick={() => (forceMap.value = true)}>{t('net.loadMap')}</button>
      </div>
    </div>
  );
}

function Toast() {
  return toast.value ? <div class="toast" role="status" aria-live="polite">{toast.value}</div> : null;
}

/** Authorities: the full map app (unchanged) + send alert and sign out. */
function AuthoritiesView() {
  const u = currentUser.value!;
  useEffect(() => { startAlerts(u); return stopAlerts; }, [u.id]);
  useEffect(() => { startWeather(); return stopWeather; }, []);
  const lite = slowNetwork.value && !forceMap.value;
  const showMap = !!tileKeys.value && !lite;
  const alertsBtn = <button class="icon-btn" aria-label={t('alerts.open')} title={t('alerts.open')} aria-pressed={route.value.name === 'alerts'} onClick={() => navigate({ name: 'alerts' })}><BellRing size={20} /></button>;
  const brandRow = <div class="brand-row"><MenuButton /><Brand />{alertsBtn}<LogoutButton /></div>;
  return (
    <>
      {/* DOM order = keyboard order: panel first, then map controls, then the map canvas. */}
      <Shell label={t('overview.title')}
        head={<>{brandRow}<SearchBox /><Breadcrumb /></>}
        topbar={<>{brandRow}<SearchBox /></>}
        body={<>{isMobile.value && <Breadcrumb />}<PanelContent /></>} />
      {showMap && <MapControls />}
      {showMap && <MapView />}
      {lite && <LiteMode />}
      {showMap && !isMobile.value && <Legend mode="full" />}
      {showMap && <WeatherPanel />}
      {showMap && <TimePlayer />}
      <NetworkBanner />
      <MenuDialog /><LayersDialog /><A11yDialog /><ShareDialog /><AboutDialog /><OfflineDialog />
    </>
  );
}

/** Adult: read-only basic map + alerts inbox + their school. No management tools. */
function AdultView() {
  const u = currentUser.value!;
  useEffect(() => { startAlerts(u); return stopAlerts; }, [u.id]);
  useEffect(() => { startWeather(); return stopWeather; }, []);
  const s = u.schoolId ? dataset.value?.byId.get(u.schoolId) : undefined;
  const lite = slowNetwork.value && !forceMap.value;
  const showMap = !!tileKeys.value && !lite;
  const head = <div class="brand-row"><Brand /><LangSelect /><LogoutButton /></div>;
  const body = (
    <>
      <p class="small muted">{t('session.signedInAs', { name: u.name })} · {t('adult.readOnly')}</p>
      {s && (
        <section class="card my-school" aria-labelledby="my-school-h">
          <h3 id="my-school-h">{t('adult.mySchool')}</h3>
          <p class="my-school-name">{s.name}</p>
          <p class={`pill st-${s.connectivity}`}><StatusDot status={s.connectivity} />{t('school.status')}: {t(`status.${s.connectivity}`)}{dataset.value?.connectivity?.kind === 'estimate' && s.connectivity !== 'unknown' ? ` (${t('status.estimated')})` : ''}</p>
          {dataset.value?.connectivity?.kind === 'estimate' && <p class="notice">{t('notice.estimate')}</p>}
        </section>
      )}
      <section class="card" aria-labelledby="inbox-h">
        <h3 id="inbox-h">{t('inbox.title')}</h3>
        {inbox.value.length === 0 ? <p class="muted">{t('inbox.empty')}</p> : inbox.value.map((a) => <AlertCard key={a.id} alert={a} />)}
      </section>
    </>
  );
  return (
    <>
      <Shell label={t('inbox.title')} head={head} topbar={head} body={body} />
      {showMap && <MapControls basic />}
      {showMap && <MapView mode="basic" highlightSchool={u.schoolId} />}
      {lite && <LiteMode />}
      {showMap && !isMobile.value && <Legend mode="basic" />}
      {showMap && <WeatherPanel readOnly />}
      {showMap && <TimePlayer />}
      <NetworkBanner />
      <A11yDialog /><OfflineDialog />
    </>
  );
}

export function App() {
  // reflect theme + language on <html> (tokens.css themes, Sinhala/Tamil line heights)
  const role = session.value?.role ?? null;
  useEffect(() => {
    document.documentElement.dataset.theme = role === 'kids' ? 'kids' : theme.value;
    document.documentElement.lang = lang.value;
    document.title = t('app.title');
  }, [theme.value, lang.value, role]);
  // School filters live in memory per tab: start every session with all schools visible,
  // so a filter left on by a previous user never hides the map's schools.
  useEffect(() => {
    levelFilter.value = new Set(); statusFilter.value = new Set(); highRiskOnly.value = false;
  }, [session.value?.userId]);
  // Route guard: no session -> login; a role on someone else's view -> its own view.
  useEffect(() => {
    const to = redirectFor(role, route.value);
    if (to) navigate(to, true);
  }, [role, route.value]);
  // move the mobile sheet up when something is selected
  useEffect(() => {
    if (isMobile.value && route.value.name !== 'home' && sheetSnap.peek() === 'peek') sheetSnap.value = 'half';
  }, [route.value]);

  const blocked = redirectFor(role, route.value) !== null;
  return (
    <>
      {!blocked && !role && <LoginView />}
      {!blocked && role === 'kids' && <KidsView />}
      {!blocked && role === 'adult' && <AdultView />}
      {!blocked && role === 'authorities' && <AuthoritiesView />}
      <Toast />
      <span hidden data-testid="ready">{dataset.value ? 'data' : ''}</span>
      <span hidden data-testid="view">{blocked ? '' : role ?? 'login'}</span>
    </>
  );
}
