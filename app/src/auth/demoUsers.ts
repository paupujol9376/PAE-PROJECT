// ⚠️ DEMO ONLY. FRONTEND AUTHENTICATION IS NOT SECURITY.
// These accounts and secrets ship inside the JavaScript bundle, so anyone can read them.
// They exist so the three role views can be shown and tested offline. A real deployment
// needs a backend: accounts in a database, passwords stored with a slow hash (argon2/bcrypt),
// short-lived signed tokens, and access control enforced on the server for every request.
// All names, phone numbers and credentials below are fictitious.
import type { Avatar, Role, User } from './types';

interface DemoAccount extends User {
  username?: string;
  phone?: string;
  password?: string;
  pin?: string;
  code?: string;
}

/** ABAKOLAWEWA K.V. (Hambantota), a real school from the Giga export, used as the demo "my school". */
export const DEMO_SCHOOL_ID = '024a82db-7ed8-381a-8d13-4287abe8ec4d';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: 'u-auth-1', role: 'authorities', name: 'Demo district officer', username: 'officer.demo', password: 'demo-officer-2026' },
  {
    id: 'u-adult-1', role: 'adult', name: 'Demo parent', username: 'parent.demo', phone: '+94700000000', password: 'demo-parent-2026',
    schoolId: DEMO_SCHOOL_ID, district: 'Hambantota',
  },
  {
    id: 'u-kid-1', role: 'kids', name: 'Elephant', avatar: 'elephant', pin: '1234', code: 'KID-4821',
    schoolId: DEMO_SCHOOL_ID, district: 'Hambantota',
  },
];

const normPhone = (s: string) => s.replace(/[^\d+]/g, '').replace(/^0/, '+94');
const strip = ({ username: _u, phone: _p, password: _w, pin: _n, code: _c, ...user }: DemoAccount): User => user;

export type Credentials =
  | { role: 'authorities'; username: string; password: string }
  | { role: 'adult'; identifier: string; password: string }
  | { role: 'kids'; avatar: Avatar; pin: string }
  | { role: 'kids'; code: string };

/** Returns the user for valid demo credentials, or null. */
export function checkCredentials(c: Credentials): User | null {
  const of = (role: Role) => DEMO_ACCOUNTS.filter((a) => a.role === role);
  let hit: DemoAccount | undefined;
  if (c.role === 'authorities') {
    hit = of('authorities').find((a) => a.username === c.username.trim().toLowerCase() && a.password === c.password);
  } else if (c.role === 'adult') {
    const id = c.identifier.trim().toLowerCase();
    hit = of('adult').find((a) => (a.username === id || (!!a.phone && a.phone === normPhone(id))) && a.password === c.password);
  } else if ('code' in c) {
    hit = of('kids').find((a) => a.code === c.code.trim().toUpperCase());
  } else {
    hit = of('kids').find((a) => a.avatar === c.avatar && a.pin === c.pin);
  }
  return hit ? strip(hit) : null;
}

export function userById(id: string): User | null {
  const a = DEMO_ACCOUNTS.find((x) => x.id === id);
  return a ? strip(a) : null;
}
