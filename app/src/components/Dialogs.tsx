import { useEffect, useState } from 'preact/hooks';
import { Copy, Download, Trash2 } from 'lucide-preact';
import { Dialog, Switch } from './ui';
import { a11y, dialog, lang, showBoundaries, showLabels, showToast, themePref } from '../state';
import { navigate, syncUrl } from '../router';
import { logout } from '../auth/session';
import { fmtBytes, fmtDate, t } from '../i18n';
import {
  cancelDownload, downloadAll, downloadError, manifest, offlineReady, opfsSupported, progress, removeOffline, storageEstimate, TILE_FILES, type TileName,
} from '../offline/offline';
import type { LangCode } from '../data/types';

export function MenuDialog() {
  return (
    <Dialog name="menu" title={t('app.title')}>
      <label class="radio" style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <span>{t('menu.language')}</span>
        <select class="select" value={lang.value} onChange={(e) => { lang.value = (e.target as HTMLSelectElement).value as LangCode; syncUrl(); }}>
          {(['en', 'si', 'ta'] as LangCode[]).map((l) => <option key={l} value={l} lang={l}>{t(`lang.${l}`)}</option>)}
        </select>
      </label>
      <button class="btn" onClick={() => (dialog.value = 'offline')}><Download size={18} aria-hidden="true" />{t('menu.offline')}</button>
      <button class="btn" onClick={() => (dialog.value = 'about')}>{t('menu.about')}</button>
      <button class="btn" onClick={() => { dialog.value = null; navigate({ name: 'alerts' }); }}>{t('alerts.open')}</button>
      <button class="btn" onClick={() => { dialog.value = null; logout(); }}>{t('session.logout')}</button>
    </Dialog>
  );
}

export function LayersDialog() {
  return (
    <Dialog name="layers" title={t('layers.title')}>
      <fieldset>
        <legend class="fs">{t('theme.title')}</legend>
        {(['system', 'dark', 'light'] as const).map((v) => (
          <label class="radio" key={v}>
            <input type="radio" name="theme" checked={themePref.value === v} onChange={() => (themePref.value = v)} />
            {t(`theme.${v}`)}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend class="fs">{t('overlays.title')}</legend>
        <Switch id="sw-bounds" label={t('overlays.boundaries')} checked={showBoundaries.value} onChange={(v) => (showBoundaries.value = v)} />
        <Switch id="sw-labels" label={t('overlays.labels')} checked={showLabels.value} onChange={(v) => (showLabels.value = v)} />
      </fieldset>
    </Dialog>
  );
}

export function A11yDialog() {
  return (
    <Dialog name="a11y" title={t('a11y.title')}>
      <Switch id="sw-a11y" label={a11y.value ? t('a11y.on') : t('a11y.off')} checked={a11y.value} onChange={(v) => (a11y.value = v)} />
      <p class="muted">{t('a11y.desc')}</p>
    </Dialog>
  );
}

export function ShareDialog() {
  const url = location.href;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t('share.copied'));
    } catch {
      (document.getElementById('share-url') as HTMLInputElement | null)?.select();
    }
  };
  const canShare = typeof navigator.share === 'function';
  return (
    <Dialog name="share" title={t('share.title')}>
      <div class="url-row">
        <input id="share-url" readOnly value={url} aria-label={t('share.title')} onFocus={(e) => (e.target as HTMLInputElement).select()} />
        <button class="btn primary" onClick={copy}><Copy size={18} aria-hidden="true" />{t('share.copy')}</button>
      </div>
      {canShare && <button class="btn" onClick={() => navigator.share({ title: document.title, url }).catch(() => undefined)}>{t('share.native')}</button>}
    </Dialog>
  );
}

export function AboutDialog() {
  return (
    <Dialog name="about" title={t('about.title')}>
      <p>{t('about.p1')}</p>
      <p class="muted">{t('about.p2')}</p>
      <p class="small muted">
        {t('about.licence')} <a class="link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">openstreetmap.org/copyright</a>
      </p>
    </Dialog>
  );
}

export function OfflineDialog() {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const open = dialog.value === 'offline';
  const busy = progress.value.roads !== null || progress.value.base !== null;
  useEffect(() => { if (open) storageEstimate().then(setEst); }, [open, busy, offlineReady.value]);
  const size = (t: TileName) => manifest.value?.files[TILE_FILES[t]]?.size ?? 0;
  const need = (['roads', 'base'] as TileName[]).filter((x) => !offlineReady.value[x]).reduce((a, x) => a + size(x), 0);
  const noSpace = !!est && est.quota > 0 && need > est.quota - est.usage;
  const allReady = offlineReady.value.roads && offlineReady.value.base;

  const row = (label: string, status: string, pct?: number | null) => (
    <div class="off-row">
      <span>{label}</span>
      <span class="muted">{status}</span>
      {pct != null && <div class="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}><span style={{ width: `${pct}%` }} /></div>}
    </div>
  );
  const tileStatus = (x: TileName) =>
    progress.value[x] != null ? t('offline.downloading', { p: progress.value[x]! }) : offlineReady.value[x] ? t('offline.ready') : `${t('offline.notDownloaded')} · ${fmtBytes(size(x))}`;

  return (
    <Dialog name="offline" title={t('offline.title')}>
      <p class="muted">{t('offline.desc')}</p>
      {!opfsSupported && <p class="notice danger">{t('offline.unsupported')}</p>}
      <div>
        {row(t('offline.app'), t('offline.auto'))}
        {row(t('offline.schools'), t('offline.auto'))}
        {row(t('offline.roads'), tileStatus('roads'), progress.value.roads)}
        {row(t('offline.base'), tileStatus('base'), progress.value.base)}
      </div>
      {est && est.quota > 0 && <p class="small muted">{t('offline.storage', { used: fmtBytes(est.usage), quota: fmtBytes(est.quota) })}</p>}
      {noSpace && <p class="notice danger">{t('offline.noSpace', { need: fmtBytes(need) })}</p>}
      {downloadError.value && <p class="notice danger" role="alert">{t('offline.error')} ({downloadError.value})</p>}
      <div class="btn-row">
        {!allReady && !busy && (
          <button class="btn primary" disabled={!opfsSupported || noSpace} onClick={() => downloadAll(() => showToast(t('offline.done')))}>
            <Download size={18} aria-hidden="true" />{t('offline.downloadAll', { size: fmtBytes(need) })}
          </button>
        )}
        {busy && <button class="btn" onClick={cancelDownload}>{t('offline.cancel')}</button>}
        {(offlineReady.value.roads || offlineReady.value.base) && !busy && (
          <button class="btn" onClick={removeOffline}><Trash2 size={18} aria-hidden="true" />{t('offline.remove')}</button>
        )}
      </div>
      {manifest.value && <p class="small muted">{fmtDate(manifest.value.generatedAt)}</p>}
    </Dialog>
  );
}
