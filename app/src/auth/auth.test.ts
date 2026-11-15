import { describe, expect, it } from 'vitest';
import { checkCredentials } from './demoUsers';
import { canAccess, homeFor, redirectFor } from './guard';

describe('demo credentials', () => {
  it('accepts each demo account and rejects wrong secrets', () => {
    expect(checkCredentials({ role: 'authorities', username: 'officer.demo', password: 'demo-officer-2026' })?.role).toBe('authorities');
    expect(checkCredentials({ role: 'authorities', username: 'officer.demo', password: 'nope' })).toBeNull();
    expect(checkCredentials({ role: 'adult', identifier: 'parent.demo', password: 'demo-parent-2026' })?.role).toBe('adult');
    expect(checkCredentials({ role: 'adult', identifier: '070 000 0000', password: 'demo-parent-2026' })?.role).toBe('adult');
    expect(checkCredentials({ role: 'kids', avatar: 'elephant', pin: '1234' })?.role).toBe('kids');
    expect(checkCredentials({ role: 'kids', avatar: 'turtle', pin: '1234' })).toBeNull();
    expect(checkCredentials({ role: 'kids', code: 'kid-4821' })?.role).toBe('kids');
  });
  it('never returns secrets with the user', () => {
    const u = checkCredentials({ role: 'authorities', username: 'officer.demo', password: 'demo-officer-2026' }) as unknown as Record<string, unknown>;
    expect(u.password).toBeUndefined();
    expect(u.username).toBeUndefined();
  });
  it('an adult cannot sign in through the authorities form', () => {
    expect(checkCredentials({ role: 'authorities', username: 'parent.demo', password: 'demo-parent-2026' })).toBeNull();
  });
});

describe('route access per role', () => {
  it('sends a visitor without session to login', () => {
    expect(redirectFor(null, { name: 'home' })).toEqual({ name: 'login' });
    expect(redirectFor(null, { name: 'kids' })).toEqual({ name: 'login' });
    expect(redirectFor(null, { name: 'login' })).toBeNull();
  });
  it('keeps each role on its own view', () => {
    expect(redirectFor('kids', { name: 'home' })).toEqual({ name: 'kids' });
    expect(redirectFor('kids', { name: 'adult' })).toEqual({ name: 'kids' });
    expect(redirectFor('adult', { name: 'school', id: 'x' })).toEqual({ name: 'adult' });
    expect(redirectFor('adult', { name: 'alerts' })).toEqual({ name: 'adult' });
    expect(redirectFor('authorities', { name: 'kids' })).toEqual({ name: 'home' });
  });
  it('lets authorities use every map route and the alerts panel', () => {
    for (const r of [{ name: 'home' }, { name: 'school', id: 'x' }, { name: 'district', id: 1 }, { name: 'province', id: 2 }, { name: 'alerts' }] as const) {
      expect(canAccess('authorities', r)).toBe(true);
    }
  });
  it('sends a signed-in user away from the login page', () => {
    expect(redirectFor('adult', { name: 'login' })).toEqual(homeFor('adult'));
  });
});
