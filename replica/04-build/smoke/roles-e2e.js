const { chromium } = require('playwright');
const OUT = process.env.OUT_DIR, B = 'http://127.0.0.1:4173';
const res = []; const ok = (n, c, x = '') => { const l = `${c ? 'PASS' : 'FAIL'}  ${n} ${x}`; res.push(l); console.log(l); };
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const errs = [];
  const watch = (p) => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); }); };
  // ---- desktop context shared by authorities + adult (same device, like the demo) ----
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', serviceWorkers: 'block' });
  const a = await ctx.newPage(); watch(a);
  await a.goto(B + '/school/xyz'); await a.waitForTimeout(800);
  ok('no session → /login', new URL(a.url()).pathname === '/login', a.url());
  await a.screenshot({ path: `${OUT}/R01-login-roles.jpg`, type: 'jpeg', quality: 82 });
  await a.getByRole('button', { name: /Authorities/ }).click();
  await a.getByLabel('Username').fill('officer.demo'); await a.getByLabel('Password').fill('wrong'); await a.getByRole('button', { name: 'Sign in' }).click();
  ok('wrong password shows error', await a.getByRole('alert').count() === 1);
  await a.getByLabel('Password').fill('demo-officer-2026'); await a.getByRole('button', { name: 'Sign in' }).click();
  await a.waitForSelector('[data-testid=view]:has-text("authorities")', { state: 'attached' });
  await a.waitForSelector('body[data-map-idle="1"]', { timeout: 30000 });
  ok('authorities lands on the map', new URL(a.url()).pathname === '/', a.url());
  await a.screenshot({ path: `${OUT}/R02-authorities-home.jpg`, type: 'jpeg', quality: 82 });
  // send alert
  await a.getByRole('button', { name: 'Send alert' }).first().click(); await a.waitForTimeout(400);
  ok('alerts panel route', new URL(a.url()).pathname === '/alerts');
  await a.locator('.type-opt.type-evacuation').click();
  await a.locator('.send-alert textarea').fill('Rain is rising. Teachers: move students to the upper floor now.');
  await a.locator('.send-alert select').selectOption('en');
  await a.getByRole('radio', { name: 'By school' }).click();
  await a.getByRole('searchbox', { name: 'Schools' }).fill('abakolawewa'); await a.waitForTimeout(300);
  await a.locator('.send-alert .list button').first().click();
  // kids tab on the same device, opened before sending
  const kctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  // (separate context = separate storage; use a page in the SAME context for BroadcastChannel delivery)
  await kctx.close();
  const k = await ctx.newPage(); watch(k);
  await k.setViewportSize({ width: 390, height: 844 });
  await k.addInitScript(() => localStorage.setItem('pae.session.v1', JSON.stringify({ userId: 'u-kid-1', role: 'kids', loginAt: '2026-11-15T00:00:00Z' })));
  await k.goto(B + '/kids'); await k.waitForSelector('[data-testid=view]:has-text("kids")', { state: 'attached' });
  await k.screenshot({ path: `${OUT}/R05-kids-home.jpg`, type: 'jpeg', quality: 82 });
  await a.bringToFront();
  await a.getByRole('button', { name: 'Send alert' }).last().click(); await a.waitForTimeout(800);
  ok('history shows the sent alert', (await a.locator('.alert-card').count()) >= 1);
  await a.screenshot({ path: `${OUT}/R03-authorities-send.jpg`, type: 'jpeg', quality: 82 });
  await k.bringToFront(); await k.waitForTimeout(800);
  ok('kid receives full-screen alert', await k.getByRole('alertdialog').count() === 1);
  await k.screenshot({ path: `${OUT}/R06-kids-alert.jpg`, type: 'jpeg', quality: 82 });
  await k.getByRole('button', { name: 'OK' }).click();
  await k.getByRole('button', { name: /My school/ }).click(); await k.waitForTimeout(300);
  await k.screenshot({ path: `${OUT}/R07-kids-school.jpg`, type: 'jpeg', quality: 82 });
  await k.getByRole('button', { name: /Back/ }).click(); await k.getByRole('button', { name: /I need help/ }).click(); await k.waitForTimeout(300);
  await k.screenshot({ path: `${OUT}/R08-kids-help.jpg`, type: 'jpeg', quality: 82 });
  ok('kids touch targets ≥ 64px', await k.evaluate(() => [...document.querySelectorAll('.kid-btn, .kid-back')].every((e) => { const r = e.getBoundingClientRect(); return r.height >= 64 && r.width >= 64; })));
  // status read back in authorities history
  await a.bringToFront(); await a.waitForTimeout(800);
  ok('status becomes Read', (await a.locator('.alert-card .badge').first().innerText()).trim() === 'Read');
  // adult on the same device: kid route forbidden → redirected
  const ad = await ctx.newPage(); watch(ad);
  await ad.addInitScript(() => localStorage.setItem('pae.session.v1', JSON.stringify({ userId: 'u-adult-1', role: 'adult', loginAt: '2026-11-15T00:00:00Z' })));
  await ad.goto(B + '/kids'); await ad.waitForTimeout(600);
  ok('adult on /kids → /adult', new URL(ad.url()).pathname === '/adult', ad.url());
  await ad.waitForSelector('body[data-map-idle="1"]', { timeout: 30000 }); await ad.waitForTimeout(500);
  ok('adult inbox has the alert', (await ad.locator('.alert-card').count()) === 1);
  await ad.screenshot({ path: `${OUT}/R04-adult.jpg`, type: 'jpeg', quality: 82 });
  // sign out
  await ad.getByRole('button', { name: 'Sign out' }).first().click(); await ad.waitForTimeout(400);
  ok('sign out → login', new URL(ad.url()).pathname === '/login');
  // kids login form
  await ad.getByRole('button', { name: /Student/ }).click(); await ad.getByRole('radio', { name: 'Elephant' }).click();
  await ad.screenshot({ path: `${OUT}/R09-login-kids.jpg`, type: 'jpeg', quality: 82 });
  for (const d of ['1', '2', '3', '4']) await ad.getByRole('button', { name: d, exact: true }).click();
  await ad.waitForTimeout(400);
  ok('kid PIN login → /kids', new URL(ad.url()).pathname === '/kids');
  ok('no console errors', errs.length === 0, errs.join(' | '));
  console.log(res.join('\n'));
  await b.close();
})();
