import { signal } from '@preact/signals';
import { lang } from './state';
import type { LangCode } from './data/types';

// Routes (architecture §4). Sri Lanka is implicit; the language lives in ?lang= so shared
// links open in the sender's language.
export type Route =
  | { name: 'home' }
  | { name: 'school'; id: string }
  | { name: 'district'; id: number }
  | { name: 'province'; id: number };

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function parse(pathname: string): Route {
  const p = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  const m = /^\/(school|district|province)\/([^/]+)\/?$/.exec(p);
  if (!m) return { name: 'home' };
  if (m[1] === 'school') return { name: 'school', id: decodeURIComponent(m[2]) };
  const id = Number(m[2]);
  return Number.isInteger(id) && id >= 0 ? { name: m[1] as 'district' | 'province', id } : { name: 'home' };
}

export function href(r: Route): string {
  const path = r.name === 'home' ? '/' : `/${r.name}/${encodeURIComponent(String(r.id))}`;
  const q = lang.value !== 'en' ? `?lang=${lang.value}` : '';
  return `${BASE}${path}${q}`;
}

export const route = signal<Route>(parse(location.pathname));

const qLang = new URLSearchParams(location.search).get('lang');
if (qLang === 'en' || qLang === 'si' || qLang === 'ta') lang.value = qLang as LangCode;

export function navigate(r: Route, replace = false) {
  const url = href(r);
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  route.value = r;
}

addEventListener('popstate', () => (route.value = parse(location.pathname)));

/** Keep ?lang in the address bar in sync when the language changes. */
export function syncUrl() {
  history.replaceState(null, '', href(route.value));
}
