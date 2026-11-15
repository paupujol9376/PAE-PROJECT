import { useEffect } from 'preact/hooks';
import { ChevronLeft, ChevronRight, Menu } from 'lucide-preact';
import { MapView } from './map/MapView';
import { Breadcrumb, PanelContent } from './components/PanelViews';
import { SearchBox } from './components/SearchBox';
import { Legend, MapControls } from './components/MapChrome';
import { A11yDialog, AboutDialog, LayersDialog, MenuDialog, OfflineDialog, ShareDialog } from './components/Dialogs';
import { dataset, dialog, forceMap, isMobile, lang, online, panelOpen, sheetSnap, slowNetwork, theme, toast, type Snap } from './state';
import { tileKeys } from './offline/offline';
import { route } from './router';
import { t } from './i18n';

function Brand() {
  return <span class="brand">PAE <b>Map</b></span>;
}

function MenuButton() {
  return <button class="icon-btn" aria-label={t('menu.open')} aria-haspopup="dialog" onClick={() => (dialog.value = 'menu')}><Menu size={20} /></button>;
}

function SidePanel() {
  const open = panelOpen.value;
  return (
    <>
      <aside class={`panel${open ? '' : ' closed'}`} aria-label={t('overview.title')} aria-hidden={!open} inert={!open}>
        <div class="panel-head">
          <div class="brand-row"><MenuButton /><Brand /></div>
          <SearchBox />
          <Breadcrumb />
        </div>
        <div class="panel-body"><PanelContent /></div>
      </aside>
      <button class={`panel-tab${open ? '' : ' closed'}`} aria-expanded={open} aria-label={open ? t('panel.hide') : t('panel.show')}
        onClick={() => (panelOpen.value = !open)}>{open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
    </>
  );
}

const SNAPS: Snap[] = ['peek', 'half', 'full'];
function BottomSheet() {
  const snap = sheetSnap.value;
  const cycle = () => (sheetSnap.value = SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length]);
  // simple drag: up = bigger, down = smaller
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
    <section class="sheet" data-snap={snap} aria-label={t('overview.title')}>
      <button class="sheet-handle" aria-label={t('sheet.resize')} onClick={cycle} onPointerDown={onPointerDown}
        onKeyDown={(e) => { if (e.key === 'Escape') sheetSnap.value = 'peek'; }}><span /></button>
      <div class="panel-body">
        <Breadcrumb />
        <PanelContent />
      </div>
    </section>
  );
}

function TopBar() {
  return (
    <header class="topbar">
      <div class="brand-row"><MenuButton /><Brand /></div>
      <SearchBox />
    </header>
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

export function App() {
  // reflect theme + language on <html> (tokens.css themes, Sinhala/Tamil line heights)
  useEffect(() => {
    document.documentElement.dataset.theme = theme.value;
    document.documentElement.lang = lang.value;
    document.title = t('app.title');
  }, [theme.value, lang.value]);
  // move the mobile sheet up when something is selected
  useEffect(() => {
    if (isMobile.value && route.value.name !== 'home' && sheetSnap.peek() === 'peek') sheetSnap.value = 'half';
  }, [route.value]);

  const lite = slowNetwork.value && !forceMap.value;
  const showMap = !!tileKeys.value && !lite;
  return (
    <>
      {/* DOM order = keyboard order: panel first, then map controls, then the map canvas. */}
      {isMobile.value ? <><TopBar /><BottomSheet /></> : <SidePanel />}
      {showMap && <MapControls />}
      {showMap && <MapView />}
      {lite && <LiteMode />}
      {showMap && !isMobile.value && <Legend />}
      <NetworkBanner />
      <MenuDialog /><LayersDialog /><A11yDialog /><ShareDialog /><AboutDialog /><OfflineDialog />
      {toast.value && <div class="toast" role="status" aria-live="polite">{toast.value}</div>}
      <span hidden data-testid="ready">{dataset.value ? 'data' : ''}</span>
    </>
  );
}
