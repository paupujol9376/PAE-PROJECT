const { chromium } = require('playwright');
const OUT = process.env.OUT_DIR, B = 'http://127.0.0.1:4173';
const SESS = (id, role) => ({ userId: id, role, loginAt: '2026-11-15T00:00:00Z' });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`);
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await ctx.addInitScript((s) => { if (!localStorage.getItem('pae.session.v1')) localStorage.setItem('pae.session.v1', JSON.stringify(s)); }, SESS('u-auth-1', 'authorities'));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.goto(B + '/'); await p.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached' }); await p.waitForSelector('body[data-map-idle="1"]');
  await p.getByRole('button', { name: 'Weather layers' }).click();
  ok('weather panel opens', await p.locator('.wx-panel').count() === 1);
  ok('3 layers disabled with reason', await p.locator('.wx-row.disabled').count() === 3);
  for (const name of ['Rain (forecast)', 'Wind and gusts', 'Clouds (infrared satellite)']) await p.getByRole('switch', { name }).click();
  await p.waitForTimeout(6000);
  const st = await p.evaluate(() => Object.fromEntries(['precipFcst', 'wind', 'cloudsIr'].map((id) => [id, !!window.__map.getLayer('wx-' + id) || !!window.__map.getLayer('wx-' + id + '-a')])));
  ok('layers drawn on the map', st.precipFcst && st.wind && st.cloudsIr, JSON.stringify(st));
  const order = await p.evaluate(() => { const ids = window.__map.getStyle().layers.map((l) => l.id); return { wx: ids.findIndex((i) => i.startsWith('wx-')), schools: ids.indexOf('schools'), roads: ids.indexOf('roads-primary') }; });
  ok('weather under schools, over roads', order.wx > order.roads && order.wx < order.schools, JSON.stringify(order));
  ok('status shows source time', (await p.locator('.wx-row').filter({ hasText: 'Rain (forecast)' }).innerText()).includes('Updated'));
  ok('player visible', await p.locator('.wx-player').count() === 1);
  ok('risk counters', await p.locator('.wx-risk .kpi b').count() === 3, (await p.locator('.wx-risk .kpis').innerText().catch(() => '')).replace(/\n/g, ' '));
  await p.screenshot({ path: `${OUT}/W01-panel-layers.jpg`, type: 'jpeg', quality: 82 });
  // player: scrub to the end (forecast)
  const last = await p.locator('.wx-scrub').getAttribute('max');
  await p.locator('.wx-scrub').fill(last); await p.waitForTimeout(1500);
  ok('player shows forecast', (await p.locator('.wx-when').innerText()).trim() === 'Forecast');
  await p.screenshot({ path: `${OUT}/W02-forecast.jpg`, type: 'jpeg', quality: 82 });
  await p.getByRole('button', { name: 'Now', exact: true }).click(); await p.waitForTimeout(800);
  // tap the map (sea-free point in Kandy area) for point values
  await p.getByRole('button', { name: 'Close weather' }).click();
  await p.evaluate(() => window.__map.jumpTo({ center: [80.75, 7.6], zoom: 8 })); await p.waitForTimeout(1500);
  await p.mouse.click(1000, 470); await p.waitForTimeout(2500);
  const pop = await p.locator('.maplibregl-popup .wx-values').innerText().catch(() => '');
  ok('point popup lists values', /Rain \(forecast\)/.test(pop) && /Gusts/.test(pop), pop.replace(/\n/g, ' | '));
  await p.screenshot({ path: `${OUT}/W03-point.jpg`, type: 'jpeg', quality: 82 });
  // school view: risk + weather
  await p.goto(B + '/school/024a82db-7ed8-381a-8d13-4287abe8ec4d'); await p.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached' }); await p.waitForTimeout(5000);
  const sw = await p.locator('#sw-h').locator('..').innerText().catch(() => '');
  ok('school risk card', /Risk at this school/.test(sw) && /\/100/.test(sw), sw.replace(/\n/g, ' | ').slice(0, 220));
  await p.screenshot({ path: `${OUT}/W04-school-risk.jpg`, type: 'jpeg', quality: 82 });
  // high-risk filter + prepare alert (only if any school at risk)
  await p.getByRole('button', { name: 'Weather layers' }).click();
  const h6 = Number((await p.locator('.wx-risk .kpi b').nth(1).innerText()).replace(/\D/g, '') || 0);
  await p.getByRole('switch', { name: 'Show only high-risk schools' }).click(); await p.waitForTimeout(800);
  ok('high-risk filter applied', JSON.stringify(await p.evaluate(() => window.__map.getFilter('schools'))).includes('highRisk'));
  await p.getByRole('switch', { name: 'Show only high-risk schools' }).click();
  if (h6 > 0) {
    await p.getByRole('button', { name: 'Prepare alert' }).click(); await p.waitForTimeout(600);
    const txt = await p.locator('.send-alert textarea').inputValue();
    ok('prepare alert pre-fills, not sent', new URL(p.url()).pathname === '/alerts' && txt.length > 20 && (await p.locator('.alert-card').count()) === 0, `h6=${h6}`);
    await p.screenshot({ path: `${OUT}/W05-prepare-alert.jpg`, type: 'jpeg', quality: 82 });
  } else ok('prepare alert disabled with no high-risk schools', await p.getByRole('button', { name: 'Prepare alert' }).isDisabled(), 'h6=0 (calm weather now)');
  // offline: cached label
  await p.goto(B + '/'); await p.waitForSelector('body[data-map-idle="1"]'); await p.waitForTimeout(3000);
  await ctx.setOffline(true); await p.reload(); await p.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached', timeout: 20000 });
  await p.waitForTimeout(5000);
  await p.getByRole('button', { name: 'Weather layers' }).click().catch(() => undefined);
  const offRow = await p.locator('.wx-row').filter({ hasText: 'Rain (forecast)' }).innerText().catch(() => '');
  ok('offline: cached data with age', /offline/.test(offRow), offRow.replace(/\n/g, ' | ').slice(0, 160));
  await p.screenshot({ path: `${OUT}/W06-offline.jpg`, type: 'jpeg', quality: 82 });
  await ctx.setOffline(false);
  // mobile limit
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await m.addInitScript((s) => localStorage.setItem('pae.session.v1', JSON.stringify(s)), SESS('u-auth-1', 'authorities'));
  await m.goto(B + '/'); await m.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached' }); await m.waitForTimeout(2000);
  await m.getByRole('button', { name: 'Weather layers' }).click();
  for (const name of ['Rain (forecast)', 'Wind and gusts', 'Temperature and feels-like']) await m.getByRole('switch', { name }).click();
  await m.waitForTimeout(1500);
  ok('mobile: max 2 layers', (await m.locator('.wx-panel [role=switch][aria-checked=true]').count()) === 2);
  await m.screenshot({ path: `${OUT}/W07-mobile.jpg`, type: 'jpeg', quality: 82 });
  // adult read-only
  const a = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await a.addInitScript((s) => localStorage.setItem('pae.session.v1', JSON.stringify(s)), SESS('u-adult-1', 'adult'));
  await a.goto(B + '/adult'); await a.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached' }); await a.waitForTimeout(2000);
  await a.getByRole('button', { name: 'Weather layers' }).click();
  ok('adult: layers yes, risk tools no', (await a.locator('.wx-row').count()) === 13 && (await a.getByRole('button', { name: 'Prepare alert' }).count()) === 0);
  ok('no console errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  await b.close();
})();
