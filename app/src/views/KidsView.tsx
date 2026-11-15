import { useEffect, useState } from 'preact/hooks';
import { arrived, inbox, startAlerts, stopAlerts } from '../alerts/store';
import { alertService, type Alert } from '../alerts';
import { currentUser, logout } from '../auth/session';
import { dataset, lang } from '../state';
import { t, type Key } from '../i18n';
import { canSpeak, chime, speak } from '../kids/feedback';
import { AlertTypeIcon, AvatarIcon, BackIcon, BellIcon, HelpIcon, PhoneIcon, SchoolIcon, SpeakerIcon, SunIcon } from '../components/KidsIcons';
import { LangSelect } from './LoginView';

type Screen = 'home' | 'message' | 'school' | 'help';

/** Big card for one alert: type icon + short phrase in the child's language + the authority's text. */
export function KidsAlertCard(props: { alert: Alert; onClose?: () => void }) {
  const a = props.alert;
  const phrase = t(`kids.say.${a.type}` as Key);
  useEffect(() => { if (currentUser.value) alertService.markRead(a.id, currentUser.value); }, [a.id]);
  return (
    <section class={`kid-alert type-${a.type}`} aria-labelledby="kid-alert-h">
      <div class="kid-alert-icon"><AlertTypeIcon type={a.type} size={120} /></div>
      <h2 id="kid-alert-h">{t(`alertType.${a.type}` as Key)}</h2>
      <p class="kid-phrase">{phrase}</p>
      {a.text && <p class="kid-text" lang={a.lang}>{a.text}</p>}
      <div class="kid-row">
        {canSpeak() && (
          <button class="kid-btn small-kid" onClick={() => speak(`${phrase} ${a.lang === lang.value ? a.text : ''}`, lang.value)}>
            <SpeakerIcon size={40} /><span>{t('kids.listen')}</span>
          </button>
        )}
        {props.onClose && <button class="kid-btn small-kid ok" onClick={props.onClose}><span>{t('kids.ok')}</span></button>}
      </div>
    </section>
  );
}

function SchoolLight() {
  const u = currentUser.value!;
  const s = u.schoolId ? dataset.value?.byId.get(u.schoolId) : undefined;
  const st = s?.connectivity ?? 'unknown';
  const label = st === 'connected' ? t('kids.open') : st === 'not_connected' ? t('kids.closed') : t('kids.unknown');
  return (
    <section class="kid-school" aria-labelledby="kid-school-h">
      <h2 id="kid-school-h" class="sr-only">{t('kids.school')}</h2>
      <div class={`light light-${st}`} role="img" aria-label={label}>
        <span class="lamp red" /><span class="lamp green" />
      </div>
      <p class="kid-phrase">{label}</p>
      {s && <p class="kid-text">{s.name}</p>}
    </section>
  );
}

function Help() {
  return (
    <section class="kid-help" aria-labelledby="kid-help-h">
      <h2 id="kid-help-h">{t('kids.help')}</h2>
      <ol>
        {(['kids.help.1', 'kids.help.2', 'kids.help.3', 'kids.help.4'] as Key[]).map((k, i) => <li key={k}><span class="num" aria-hidden="true">{i + 1}</span>{t(k)}</li>)}
      </ol>
      <a class="kid-btn call" href="tel:117"><PhoneIcon size={40} /><span>{t('kids.call')}</span></a>
    </section>
  );
}

export function KidsView() {
  const u = currentUser.value!;
  const [screen, setScreen] = useState<Screen>('home');
  useEffect(() => {
    startAlerts(u, () => chime());
    return stopAlerts;
  }, [u.id]);
  const latest = inbox.value[0];
  const incoming = arrived.value;

  return (
    <main class="kids-scope kids" lang={lang.value}>
      <header class="kids-head">
        <span class="kid-avatar" title={u.name}><AvatarIcon avatar={u.avatar ?? 'star'} size={40} /></span>
        <div class="kids-head-r">
          <LangSelect />
          <button class="kid-logout" onClick={logout}>{t('session.logout')}</button>
        </div>
      </header>

      {incoming ? (
        <div class="kid-overlay" role="alertdialog" aria-modal="true" aria-label={t('inbox.new')}>
          <KidsAlertCard alert={incoming} onClose={() => (arrived.value = null)} />
        </div>
      ) : screen === 'home' ? (
        <nav class="kid-menu" aria-label={t('kids.menu')}>
          <button class="kid-btn big b1" onClick={() => setScreen('message')}><BellIcon size={72} /><span>{t('kids.message')}</span>{latest && !latest.readBy.includes(u.id) && <span class="dot-new" aria-label={t('inbox.new')} />}</button>
          <button class="kid-btn big b2" onClick={() => setScreen('school')}><SchoolIcon size={72} /><span>{t('kids.school')}</span></button>
          <button class="kid-btn big b3" onClick={() => setScreen('help')}><HelpIcon size={72} /><span>{t('kids.help')}</span></button>
        </nav>
      ) : (
        <div class="kid-screen">
          <button class="kid-back" onClick={() => setScreen('home')}><BackIcon size={36} /><span>{t('kids.back')}</span></button>
          {screen === 'message' && (latest ? <KidsAlertCard alert={latest} /> : <p class="kid-phrase calm"><SunIcon size={96} /><br />{t('kids.noMessage')}</p>)}
          {screen === 'school' && <SchoolLight />}
          {screen === 'help' && <Help />}
        </div>
      )}
    </main>
  );
}
