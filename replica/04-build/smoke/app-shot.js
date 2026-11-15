const { chromium } = require('playwright');
const OUT = process.env.OUT_DIR, BASE = 'http://127.0.0.1:4173';
const shots = JSON.parse(process.argv[2]);
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  for (const s of shots) {
    const ctx = await b.newContext({ viewport: s.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: !!s.mobile, hasTouch: !!s.mobile, colorScheme: s.scheme || 'dark', serviceWorkers: 'block' });
    if (s.prefs) await ctx.addInitScript((p) => localStorage.setItem('pae.prefs.v1', JSON.stringify(p)), s.prefs);
    const p = await ctx.newPage(); const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
    const t0 = Date.now();
    await p.goto(BASE + s.path, { waitUntil: 'domcontentloaded' });
    try { await p.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached', timeout: 20000 }); } catch { errs.push('NO DATA'); }
    for (const a of s.steps || []) {
      try {
        if (a.type) { await p.locator(a.type[0]).first().click(); await p.keyboard.type(a.type[1], { delay: 40 }); }
        if (a.click) await p.locator(a.click).first().click({ timeout: 5000 });
        if (a.key) await p.keyboard.press(a.key);
        await p.waitForTimeout(a.wait || 800);
      } catch (e) { errs.push('STEP ' + JSON.stringify(a) + ' ' + e.message.split('\n')[0]); }
    }
    try { await p.waitForSelector('body[data-map-idle="1"]', { timeout: 30000 }); } catch { errs.push('MAP NOT IDLE'); }
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/${s.name}.jpg`, type: 'jpeg', quality: 82 });
    console.log(`${s.name}: ${Date.now() - t0} ms; errors: ${errs.length ? errs.join(' | ') : 'none'}`);
    await ctx.close();
  }
  await b.close();
})();
