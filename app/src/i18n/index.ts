import { en, type Key } from './en';
import { si } from './si';
import { ta } from './ta';
import { lang } from '../state';
import type { LangCode } from '../data/types';

const dict: Record<LangCode, Record<Key, string>> = { en, si, ta };
const locales: Record<LangCode, string> = { en: 'en-LK', si: 'si-LK', ta: 'ta-LK' };

/** Translate a key in the current language; `{name}` placeholders are filled from vars. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = dict[lang.value][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function fmtNumber(n: number): string {
  return new Intl.NumberFormat(locales[lang.value]).format(n);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Intl.DateTimeFormat(locales[lang.value], { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));
}

export function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}

/** Name of an admin area in the current language, falling back to English. */
export function areaName(a: { name: { en: string; si?: string; ta?: string } }): string {
  return a.name[lang.value] || a.name.en;
}

export type { Key };
