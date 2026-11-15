// Session persisted in localStorage so a logged-in user keeps working offline.
// ⚠️ DEMO ONLY: a client-side session can be edited by the user. See demoUsers.ts.
import { computed, signal } from '@preact/signals';
import { checkCredentials, userById, type Credentials } from './demoUsers';
import type { Session, User } from './types';

const KEY = 'pae.session.v1';

function read(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Session | null;
    return s && userById(s.userId)?.role === s.role ? s : null;
  } catch {
    return null;
  }
}

export const session = signal<Session | null>(read());
export const currentUser = computed<User | null>(() => (session.value ? userById(session.value.userId) : null));

export function login(c: Credentials): User | null {
  const user = checkCredentials(c);
  if (!user) return null;
  const s: Session = { userId: user.id, role: user.role, loginAt: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: session lasts for this tab */ }
  session.value = s;
  return user;
}

export function logout() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  session.value = null;
}
