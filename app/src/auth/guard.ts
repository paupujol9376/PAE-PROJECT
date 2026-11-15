// Route access per role. ⚠️ Client-side only (demo): a real app must also check on the server.
import type { Route } from '../router';
import type { Role } from './types';

const AUTHORITY_ROUTES: Route['name'][] = ['home', 'school', 'district', 'province', 'alerts'];

export function homeFor(role: Role): Route {
  return role === 'kids' ? { name: 'kids' } : role === 'adult' ? { name: 'adult' } : { name: 'home' };
}

export function canAccess(role: Role, r: Route): boolean {
  if (role === 'authorities') return AUTHORITY_ROUTES.includes(r.name);
  return r.name === role;
}

/** Where to go instead of `r`, or null if `r` is allowed. */
export function redirectFor(role: Role | null, r: Route): Route | null {
  if (!role) return r.name === 'login' ? null : { name: 'login' };
  if (r.name === 'login') return homeFor(role);
  return canAccess(role, r) ? null : homeFor(role);
}
