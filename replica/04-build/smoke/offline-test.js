const { chromium } = require('playwright');
const OUT = process.env.OUT_DIR, BASE = 'http://127.0.0.1:4173';
const log = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.goto(BASE + '/');
  await p.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached' });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached' });
  log('SW controlling:', await p.evaluate(() => !!navigator.serviceWorker.controller));
  // open menu -> offline dialog -> download all
  await p.getByRole('button', { name: 'Open menu' }).click();
  await p.getByRole('button', { name: 'Offline use' }).click();
  await p.screenshot({ path: `${OUT}/C16-offline-before.jpg`, type: 'jpeg', quality: 82 });
  const t0 = Date.now();
  await p.getByRole('button', { name: /Download all/ }).click();
  await p.waitForFunction(() => [...document.querySelectorAll('.off-row')].filter(r => /Ready/.test(r.textContent)).length >= 2, null, { timeout: 120000 });
  log('download both archives:', Date.now() - t0, 'ms');
  await p.screenshot({ path: `${OUT}/C16-offline-ready.jpg`, type: 'jpeg', quality: 82 });
  const opfs = await p.evaluate(async () => { const d = await navigator.storage.getDirectory(); const out = {}; for await (const [n, h] of d.entries()) out[n] = (await h.getFile()).size; return out; });
  log('OPFS files:', JSON.stringify(opfs));
  // go offline and reload
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForSelector('[data-testid=ready]:has-text("data")', { state: 'attached', timeout: 20000 }).catch(() => errs.push('NO DATA OFFLINE'));
  await p.waitForSelector('body[data-map-idle="1"]', { timeout: 30000 }).catch(() => errs.push('MAP NOT IDLE OFFLINE'));
  await p.waitForTimeout(800);
  const st = await p.evaluate(() => ({ rendered: window.__map?.queryRenderedFeatures().length, roadsUrl: window.__map?.getStyle().sources.roads.url, banner: document.querySelector('.banner')?.textContent }));
  log('offline state:', JSON.stringify(st));
  // zoom into Kandy offline to load z12+ tiles from OPFS
  await p.evaluate(() => window.__map.jumpTo({ center: [80.635, 7.293], zoom: 13.5 }));
  await p.waitForSelector('body[data-map-idle="1"]', { timeout: 30000 }).catch(() => errs.push('ZOOM NOT IDLE'));
  await p.waitForTimeout(800);
  log('offline z13.5 rendered roads:', await p.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['roads-residential', 'roads-tertiary', 'roads-primary'] }).length));
  await p.screenshot({ path: `${OUT}/C16-offline-kandy-z13.jpg`, type: 'jpeg', quality: 82 });
  log('errors:', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
