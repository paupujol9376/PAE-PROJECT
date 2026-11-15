// Build gate: fail if any Giga API key or key variable name leaked into dist/.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const envFile = path.resolve(here, '../../.env');
// Variable names that must never appear in the browser bundle (Giga keys, SMS provider, server tokens).
const needles = ['GIGA_SCHOOL_LOCATION_API_KEY', 'GIGA_COUNTRY_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'ALERTS_API_TOKEN'];
if (fs.existsSync(envFile)) {
  for (const m of fs.readFileSync(envFile, 'utf8').matchAll(/^(?:GIGA|TWILIO|ALERTS_API)_\w+='?([^'\n]+)'?/gm)) if (m[1].length > 12) needles.push(m[1].slice(0, 24));
}
let bad = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'data') walk(p); continue; }
    if (!/\.(js|html|css|json|webmanifest|txt|map)$/.test(e.name)) continue;
    const s = fs.readFileSync(p, 'utf8');
    for (const n of needles) if (s.includes(n)) { console.error(`SECRET LEAK in ${p}`); bad++; }
  }
};
walk(dist);
if (bad) process.exit(1);
console.log(`check-dist: no secrets (Giga, Twilio, alerts token) in dist/ (${needles.length} patterns checked)`);
