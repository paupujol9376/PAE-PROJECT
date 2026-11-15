import { useMemo, useState } from 'preact/hooks';
import { Send } from 'lucide-preact';
import { alertService, ALERT_TYPES, type Alert, type AlertType, type Recipients } from '../alerts';
import { history, refreshAlerts } from '../alerts/store';
import { currentUser } from '../auth/session';
import type { Role } from '../auth/types';
import { dataset, showToast } from '../state';
import { buildIndex } from '../data/search';
import type { LangCode } from '../data/types';
import { fmtDate, t, type Key } from '../i18n';
import { AlertTypeIcon } from './KidsIcons';

const LANGS: LangCode[] = ['si', 'ta', 'en'];

function recipientsText(r: Recipients): string {
  const ds = dataset.value;
  if (r.kind === 'all') return t('alerts.toAll');
  if (r.kind === 'role') return r.roles.map((x) => t(`role.${x}` as Key)).join(', ');
  if (r.kind === 'district') return r.districts.join(', ');
  return r.schools.map((id) => ds?.byId.get(id)?.name ?? id).join(', ');
}

/** Detailed alert card (authorities history, adult inbox). */
export function AlertCard(props: { alert: Alert; showStatus?: boolean }) {
  const a = props.alert;
  return (
    <article class={`alert-card type-${a.type}`} aria-labelledby={`al-${a.id}`}>
      <div class="alert-icon"><AlertTypeIcon type={a.type} size={32} /></div>
      <div class="alert-body">
        <h4 id={`al-${a.id}`}>{t(`alertType.${a.type}` as Key)}</h4>
        <p class="alert-text" lang={a.lang}>{a.text}</p>
        <p class="small muted">
          {fmtDate(a.createdAt)} {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {t('alerts.by', { name: a.author.name })}
          {' · '}{t('alerts.inLang', { lang: t(`lang.${a.lang}` as Key) })}
        </p>
        <p class="small muted">{t('alerts.recipients', { to: recipientsText(a.recipients) })}</p>
        {props.showStatus && <p class="small"><span class={`badge st-${a.status}`}>{t(`alertStatus.${a.status}` as Key)}</span></p>}
      </div>
    </article>
  );
}

export function AlertHistory() {
  const list = history.value;
  return (
    <section class="card" aria-labelledby="hist-h">
      <h3 id="hist-h">{t('alerts.history')}</h3>
      {list.length === 0 ? <p class="muted">{t('alerts.empty')}</p> : list.map((a) => <AlertCard key={a.id} alert={a} showStatus />)}
    </section>
  );
}

export function SendAlertPanel() {
  const user = currentUser.value!;
  const ds = dataset.value;
  const [type, setType] = useState<AlertType>('flood');
  const [text, setText] = useState('');
  const [lang, setLang] = useState<LangCode>('si');
  const [kind, setKind] = useState<Recipients['kind']>('all');
  const [districts, setDistricts] = useState<string[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>(['kids', 'adult']);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const index = useMemo(() => (ds ? buildIndex(ds) : null), [ds]);
  const schoolHits = useMemo(() => (index && q.trim() ? index.search(q, 8).filter((h) => h.kind === 'school') : []), [index, q]);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const recipients = (): Recipients | null => {
    if (kind === 'all') return { kind };
    if (kind === 'district') return districts.length ? { kind, districts } : null;
    if (kind === 'school') return schools.length ? { kind, schools } : null;
    return roles.length ? { kind, roles } : null;
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    const r = recipients();
    if (!text.trim()) return setError(t('alerts.needText'));
    if (!r) return setError(t('alerts.needRecipients'));
    setBusy(true);
    try {
      await alertService.send({ type, text, lang, recipients: r }, user);
      setText('');
      showToast(t('alerts.sent'));
      await refreshAlerts(user);
    } catch {
      setError(t('alerts.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="card send-alert" onSubmit={submit} aria-labelledby="send-h">
      <h3 id="send-h">{t('alerts.title')}</h3>
      <p class="small muted">{t(alertService.name === 'sms' ? 'alerts.mode.sms' : 'alerts.mode.mock')}</p>

      <fieldset>
        <legend class="fs">{t('alerts.type')}</legend>
        <div class="type-grid">
          {ALERT_TYPES.map((x) => (
            <label key={x} class={`type-opt type-${x}`}>
              <input type="radio" name="atype" checked={type === x} onChange={() => setType(x)} />
              <AlertTypeIcon type={x} size={28} />
              <span>{t(`alertType.${x}` as Key)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label class="field">
        <span class="fs">{t('alerts.message')}</span>
        <textarea rows={3} maxLength={480} value={text} lang={lang} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
        <span class={`small ${text.length > 160 ? 'warn' : 'muted'}`}>{t('alerts.chars', { n: text.length })}</span>
      </label>

      <label class="field">
        <span class="fs">{t('alerts.lang')}</span>
        <select class="select" value={lang} onChange={(e) => setLang((e.target as HTMLSelectElement).value as LangCode)}>
          {LANGS.map((l) => <option key={l} value={l} lang={l}>{t(`lang.${l}` as Key)}</option>)}
        </select>
      </label>

      <fieldset>
        <legend class="fs">{t('alerts.to')}</legend>
        <div class="chips" role="radiogroup" aria-label={t('alerts.to')}>
          {(['all', 'district', 'school', 'role'] as const).map((k) => (
            <button type="button" key={k} class="chip" role="radio" aria-checked={kind === k} aria-pressed={kind === k} onClick={() => setKind(k)}>{t(`to.${k}` as Key)}</button>
          ))}
        </div>
        {kind === 'district' && ds && (
          <div class="check-grid" role="group" aria-label={t('alerts.pickDistricts')}>
            {[...ds.districts].sort((a, b) => a.name.en.localeCompare(b.name.en)).map((d) => (
              <label key={d.id} class="radio"><input type="checkbox" checked={districts.includes(d.name.en)} onChange={() => setDistricts(toggle(districts, d.name.en))} />{d.name.en}</label>
            ))}
          </div>
        )}
        {kind === 'school' && (
          <div class="field">
            <input class="text-input" type="search" placeholder={t('search.placeholder')} aria-label={t('alerts.pickSchool')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
            <ul class="list">
              {schoolHits.map((h) => h.kind === 'school' && (
                <li key={h.school.id}><button type="button" onClick={() => { setSchools(toggle(schools, h.school.id)); setQ(''); }}><span>{h.school.name}</span><span class="count">{h.school.district?.name.en}</span></button></li>
              ))}
            </ul>
            <div class="chips">
              {schools.map((id) => <button type="button" key={id} class="chip" aria-pressed="true" onClick={() => setSchools(toggle(schools, id))}>{ds?.byId.get(id)?.name ?? id} ✕</button>)}
            </div>
          </div>
        )}
        {kind === 'role' && (
          <div class="check-grid" role="group" aria-label={t('alerts.pickRoles')}>
            {(['kids', 'adult', 'authorities'] as Role[]).map((r) => (
              <label key={r} class="radio"><input type="checkbox" checked={roles.includes(r)} onChange={() => setRoles(toggle(roles, r))} />{t(`role.${r}` as Key)}</label>
            ))}
          </div>
        )}
      </fieldset>

      {error && <p class="notice danger" role="alert">{error}</p>}
      <button class="btn primary" type="submit" disabled={busy}><Send size={18} aria-hidden="true" />{t('alerts.send')}</button>
    </form>
  );
}

export function AlertsPanel() {
  return (
    <>
      <h1 class="title">{t('alerts.title')}</h1>
      <SendAlertPanel />
      <AlertHistory />
    </>
  );
}
