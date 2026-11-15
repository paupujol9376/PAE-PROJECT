const { chromium } = require('playwright');
const SESSIONS = { authorities: { userId: 'u-auth-1', role: 'authorities', loginAt: '2026-11-15T00:00:00Z' }, adult: { userId: 'u-adult-1', role: 'adult', loginAt: '2026-11-15T00:00:00Z' }, kids: { userId: 'u-kid-1', role: 'kids', loginAt: '2026-11-15T00:00:00Z' } };
const OUT = process.env.OUT_DIR;
const results = []; const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript((v) => localStorage.setItem('pae.session.v1', JSON.stringify(v)), SESSIONS.authorities);
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)); });
  await p.goto('http://127.0.0.1:4173/'); await p.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached' });
  await p.waitForSelector('body[data-map-idle="1"]');
  // keyboard: Tab to menu, then search
  await p.keyboard.press('Tab'); ok('first Tab focuses menu button', await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Open menu');
  await p.keyboard.press('Tab'); ok('Tab 2: send alert', await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Send alert');
  await p.keyboard.press('Tab'); ok('Tab 3: sign out', await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Sign out');
  await p.keyboard.press('Tab'); ok('Tab 4 focuses search', await p.evaluate(() => document.activeElement?.getAttribute('role')) === 'combobox');
  await p.keyboard.type('galle', { delay: 30 }); await p.waitForTimeout(400);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
  ok('keyboard search → route', /\/(school|district)\//.test(new URL(p.url()).pathname), p.url());
  // deep link: school page loads directly, breadcrumb + selection
  await p.goto('http://127.0.0.1:4173/school/024a82db-7ed8-381a-8d13-4287abe8ec4d?lang=ta'); await p.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached' });
  await p.waitForSelector('body[data-map-idle="1"]');
  ok('deep link school title', (await p.locator('h1.title').textContent()) === 'ABAKOLAWEWA K.V.');
  ok('deep link language ta', await p.evaluate(() => document.documentElement.lang) === 'ta');
  ok('popup shown', await p.locator('.maplibregl-popup .pop strong').count() === 1);
  await p.screenshot({ path: `${OUT}/C10b-school-popup-ta.jpg`, type: 'jpeg', quality: 82 });
  // back to English home
  await p.goto('http://127.0.0.1:4173/?lang=en'); await p.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached' }); await p.waitForSelector('body[data-map-idle="1"]');
  // dialogs: layers opens with keyboard and Escape closes, focus returns
  await p.getByRole('button', { name: 'Map settings' }).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('layers dialog opens', await p.locator('dialog.dlg[open]').count() === 1);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('Escape closes dialog', await p.locator('dialog.dlg[open]').count() === 0);
  ok('focus returns to opener', await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Map settings');
  // road chip hides layer
  await p.getByRole('button', { name: 'Main', exact: true }).click(); await p.waitForTimeout(300);
  ok('Main chip hides primary roads', await p.evaluate(() => window.__map.getLayoutProperty('roads-primary', 'visibility')) === 'none');
  await p.getByRole('button', { name: 'Main', exact: true }).click();
  // level filter reduces count
  await p.getByRole('button', { name: 'Secondary', exact: true }).click(); await p.waitForTimeout(300);
  ok('level filter updates KPI', (await p.getByTestId('kpi-total').textContent()) === '983', await p.getByTestId('kpi-total').textContent());
  await p.getByRole('button', { name: 'Show all levels' }).click();
  // theme switch via a11y dialog
  await p.getByRole('button', { name: 'Accessibility mode' }).click(); await p.locator('#sw-a11y').click(); await p.keyboard.press('Escape'); await p.waitForTimeout(800);
  ok('a11y theme applied', await p.evaluate(() => document.documentElement.dataset.theme) === 'a11y');
  ok('a11y map style', await p.evaluate(() => window.__map.getStyle().name) === 'pae-a11y');
  // share copies URL
  await p.getByRole('button', { name: 'Share' }).first().click(); await p.getByRole('button', { name: 'Copy link' }).click(); await p.waitForTimeout(300);
  ok('share copies link', (await p.evaluate(() => navigator.clipboard.readText())).startsWith('http://127.0.0.1:4173/'));
  ok('toast shown', await p.locator('.toast').count() === 1);
  await p.keyboard.press('Escape');
  // panel collapse
  await p.getByRole('button', { name: 'Hide panel' }).click(); await p.waitForTimeout(400);
  ok('panel collapses', await p.locator('aside.panel.closed').count() === 1);
  // map click on a school opens details
  await p.getByRole('button', { name: 'Show panel' }).click();
  await p.evaluate(() => window.__map.jumpTo({ center: [80.635, 7.293], zoom: 13 })); await p.waitForSelector('body[data-map-idle="1"]'); await p.waitForTimeout(300);
  const pt = await p.evaluate(() => { for (const f of window.__map.queryRenderedFeatures({ layers: ['schools'] })) { const q = window.__map.project(f.geometry.coordinates); if (document.elementFromPoint(q.x, q.y)?.tagName === 'CANVAS') return q; } return null; });
  if (pt) { await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(500); }
  ok('click on school dot → school route', /\/school\//.test(p.url()), p.url());
  ok('no console errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  await b.close();
})();
