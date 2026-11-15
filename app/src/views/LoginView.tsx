import { useState } from 'preact/hooks';
import { ShieldCheck, Users } from 'lucide-preact';
import { login } from '../auth/session';
import type { Avatar, Role } from '../auth/types';
import { lang } from '../state';
import { syncUrl } from '../router';
import { t, type Key } from '../i18n';
import type { LangCode } from '../data/types';
import { AvatarIcon, BackIcon } from '../components/KidsIcons';

const AVATARS: Avatar[] = ['elephant', 'peacock', 'turtle', 'star'];

export function LangSelect() {
  return (
    <select class="select" aria-label={t('menu.language')} value={lang.value}
      onChange={(e) => { lang.value = (e.target as HTMLSelectElement).value as LangCode; syncUrl(); }}>
      {(['en', 'si', 'ta'] as LangCode[]).map((l) => <option key={l} value={l} lang={l}>{t(`lang.${l}`)}</option>)}
    </select>
  );
}

function RoleCard(props: { role: Role; onPick: (r: Role) => void }) {
  const icon = props.role === 'authorities' ? <ShieldCheck size={40} aria-hidden="true" />
    : props.role === 'adult' ? <Users size={40} aria-hidden="true" /> : <AvatarIcon avatar="star" size={40} />;
  return (
    <button class={`role-card role-${props.role}`} onClick={() => props.onPick(props.role)}>
      {icon}
      <span class="role-name">{t(`role.${props.role}` as Key)}</span>
      <span class="role-desc">{t(`role.${props.role}.desc` as Key)}</span>
    </button>
  );
}

function PasswordForm(props: { role: 'authorities' | 'adult' }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  const submit = (e: Event) => {
    e.preventDefault();
    const ok = props.role === 'authorities'
      ? login({ role: 'authorities', username: id, password: pw })
      : login({ role: 'adult', identifier: id, password: pw });
    setErr(!ok);
  };
  return (
    <form class="login-form" onSubmit={submit}>
      <label class="field">
        <span class="fs">{t(props.role === 'adult' ? 'login.identifier' : 'login.username')}</span>
        <input class="text-input" autoComplete="username" value={id} onInput={(e) => setId((e.target as HTMLInputElement).value)} required />
      </label>
      <label class="field">
        <span class="fs">{t('login.password')}</span>
        <input class="text-input" type="password" autoComplete="current-password" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} required />
      </label>
      {err && <p class="notice danger" role="alert">{t('login.error')}</p>}
      <button class="btn primary" type="submit">{t('login.submit')}</button>
    </form>
  );
}

function KidsForm() {
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [pin, setPin] = useState('');
  const [useCode, setUseCode] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState(false);
  const press = (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4 && avatar) {
      const ok = login({ role: 'kids', avatar, pin: next });
      setErr(!ok);
      if (!ok) setPin('');
    }
  };
  if (useCode) {
    return (
      <form class="login-form kids-form" onSubmit={(e) => { e.preventDefault(); setErr(!login({ role: 'kids', code })); }}>
        <label class="field">
          <span class="fs">{t('login.code')}</span>
          <input class="text-input big" autoCapitalize="characters" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} required />
        </label>
        {err && <p class="notice danger" role="alert">{t('login.error')}</p>}
        <button class="btn primary big" type="submit">{t('login.submit')}</button>
        <button class="link" type="button" onClick={() => { setUseCode(false); setErr(false); }}>{t('login.usePin')}</button>
      </form>
    );
  }
  return (
    <div class="login-form kids-form">
      <p class="fs">{t('login.pickAvatar')}</p>
      <div class="avatar-grid" role="radiogroup" aria-label={t('login.pickAvatar')}>
        {AVATARS.map((a) => (
          <button key={a} class="avatar-btn" role="radio" aria-checked={avatar === a} aria-label={t(`avatar.${a}` as Key)} onClick={() => { setAvatar(a); setPin(''); setErr(false); }}>
            <AvatarIcon avatar={a} size={52} />
          </button>
        ))}
      </div>
      {avatar && (
        <>
          <p class="fs" id="pin-l">{t('login.pin')}</p>
          <div class="pin-dots" aria-live="polite" aria-label={`${pin.length}/4`}>{[0, 1, 2, 3].map((i) => <span key={i} class={i < pin.length ? 'on' : ''} />)}</div>
          <div class="pin-pad" role="group" aria-labelledby="pin-l">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} class="pin-key" onClick={() => press(d)}>{d}</button>)}
            <button class="pin-key" aria-label={t('login.delete')} onClick={() => setPin(pin.slice(0, -1))}><BackIcon size={28} /></button>
            <button class="pin-key" onClick={() => press('0')}>0</button>
          </div>
        </>
      )}
      {err && <p class="notice danger" role="alert">{t('login.error')}</p>}
      <button class="link" type="button" onClick={() => { setUseCode(true); setErr(false); }}>{t('login.useCode')}</button>
    </div>
  );
}

export function LoginView() {
  const [role, setRole] = useState<Role | null>(null);
  return (
    <main class={`login ${role === 'kids' ? 'kids-scope' : ''}`}>
      <div class="login-box">
        <div class="login-top">
          <span class="brand">PAE <b>Map</b></span>
          <LangSelect />
        </div>
        <h1 class="title">{role ? t(`role.${role}` as Key) : t('login.chooseRole')}</h1>
        {!role && (
          <div class="role-grid">
            {(['kids', 'adult', 'authorities'] as Role[]).map((r) => <RoleCard key={r} role={r} onPick={setRole} />)}
          </div>
        )}
        {role === 'authorities' && <PasswordForm role="authorities" />}
        {role === 'adult' && <PasswordForm role="adult" />}
        {role === 'kids' && <KidsForm />}
        {role && <button class="btn" onClick={() => setRole(null)}>{t('login.back')}</button>}
        <p class="small muted">{t('login.demo')}</p>
      </div>
    </main>
  );
}
