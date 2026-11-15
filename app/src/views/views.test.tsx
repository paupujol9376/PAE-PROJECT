// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/preact';

// The real map needs WebGL; the views are tested around it.
vi.mock('../map/MapView', () => ({ MapView: (p: { mode?: string }) => <div data-testid="map" data-mode={p.mode ?? 'full'} /> }));
vi.mock('../offline/offline', async (orig) => {
  const m = await orig<typeof import('../offline/offline')>();
  m.tileKeys.value = { roads: 'roads.pmtiles', base: 'base.pmtiles' };
  return m;
});

const { App } = await import('../app');
const { login, logout } = await import('../auth/session');
const { route, navigate } = await import('../router');
const { MockAlertService } = await import('../alerts/MockAlertService');
const { userById } = await import('../auth/demoUsers');

afterEach(() => { cleanup(); logout(); });

describe('role views', () => {
  it('shows the login with three role cards when nobody is signed in', async () => {
    navigate({ name: 'home' });
    render(<App />);
    await waitFor(() => expect(route.value.name).toBe('login'));
    for (const name of [/Student/, /Parent or teacher/, /Authorities/]) expect(await screen.findByRole('button', { name })).toBeTruthy();
    expect(screen.queryByTestId('map')).toBeNull();
  });

  it('kids: three big buttons, no map, no menu', async () => {
    login({ role: 'kids', avatar: 'elephant', pin: '1234' });
    navigate({ name: 'home' }); // not theirs -> redirected
    render(<App />);
    await waitFor(() => expect(route.value.name).toBe('kids'));
    for (const name of ['Message', 'My school', 'I need help']) expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    expect(screen.queryByTestId('map')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('adult: read-only basic map and alerts inbox, no send tools', async () => {
    login({ role: 'adult', identifier: 'parent.demo', password: 'demo-parent-2026' });
    navigate({ name: 'alerts' }); // authorities-only -> redirected
    render(<App />);
    await waitFor(() => expect(route.value.name).toBe('adult'));
    expect(screen.getByTestId('map').dataset.mode).toBe('basic');
    expect(screen.getByRole('heading', { name: 'Alerts' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send alert' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Map settings' })).toBeNull();
  });

  it('authorities: the full map app plus send-alert and sign-out', async () => {
    login({ role: 'authorities', username: 'officer.demo', password: 'demo-officer-2026' });
    navigate({ name: 'home' });
    render(<App />);
    expect(screen.getByTestId('map').dataset.mode).toBe('full');
    expect(screen.getByRole('combobox', { name: /Search a school/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Map settings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send alert' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('a mock alert sent by authorities appears in the kids view', async () => {
    login({ role: 'kids', avatar: 'elephant', pin: '1234' });
    navigate({ name: 'kids' });
    render(<App />);
    await new MockAlertService().send(
      { type: 'evacuation', text: 'Leave the building now.', lang: 'en', recipients: { kind: 'school', schools: [userById('u-kid-1')!.schoolId!] } },
      userById('u-auth-1')!,
    );
    const card = await screen.findByRole('alertdialog', {}, { timeout: 3000 });
    expect(card.textContent).toContain('Evacuation');
    expect(card.textContent).toContain('Leave now with your teacher.');
    expect(card.textContent).toContain('Leave the building now.');
  });
});
