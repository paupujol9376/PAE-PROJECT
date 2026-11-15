// PAE alerts server: EXAMPLE ONLY (not production-ready, not deployed).
// Receives alerts from the app (VITE_ALERTS_MODE=sms) and sends them as SMS with Twilio.
// All secrets come from environment variables on THIS server (server/.env), never from the app.
//
//   POST /api/alerts   Authorization: Bearer <ALERTS_API_TOKEN>  (only if ALERTS_API_TOKEN is set)
//        body { type, text, lang, recipients, author }  ->  201 Alert
//   GET  /api/alerts   Authorization: Bearer <ALERTS_API_TOKEN>   ->  200 Alert[]
//
// Missing for production: real user accounts and login (tokens issued by this server, not
// a shared secret), role checks per request (only authorities may send), a database instead
// of memory, a phone-number directory per school/district/role with consent, rate limiting,
// delivery callbacks from the SMS provider, audit log, HTTPS.
import express from 'express';
import crypto from 'node:crypto';
import twilio from 'twilio';

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ALERTS_API_TOKEN, ALLOWED_ORIGIN = '*', PORT = 8787 } = process.env;
if (!ALERTS_API_TOKEN) console.warn('WARNING: ALERTS_API_TOKEN not set: /api/alerts is OPEN to anyone. Demo/local use only.');
const sms = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

// Demo directory: who receives SMS. Replace with a database (with consent records).
// Phone numbers here must be numbers you own and may text; these are placeholders.
const DIRECTORY = [
  // { phone: '+94XXXXXXXXX', role: 'adult', district: 'Hambantota', schoolId: '024a82db-7ed8-381a-8d13-4287abe8ec4d' },
];
const TYPES = new Set(['flood', 'evacuation', 'school_closed', 'all_clear']);
const LANGS = new Set(['en', 'si', 'ta']);
const alerts = [];

const matches = (r, p) =>
  r.kind === 'all' || (r.kind === 'role' && r.roles.includes(p.role)) ||
  (r.kind === 'district' && r.districts.includes(p.district)) || (r.kind === 'school' && r.schools.includes(p.schoolId));

const app = express();
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  const ok = req.path.startsWith('/api/weather/') || !ALERTS_API_TOKEN || req.get('authorization') === `Bearer ${ALERTS_API_TOKEN}`;
  return ok ? next() : res.status(401).json({ error: 'unauthorized' });
});

app.get('/api/alerts', (_req, res) => res.json([...alerts].reverse()));

// ---- Weather proxy (optional): Open-Meteo has no key but a daily quota and is non-commercial only.
// The server downloads the Sri Lanka grid once per hour and serves it to every app user.
// Same 0.5° grid and variables as app/src/weather/grid.ts and openMeteo.ts.
const LATS = [5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10], LONS = [79.5, 80, 80.5, 81, 81.5, 82];
const PTS = LATS.flatMap((la) => LONS.map((lo) => [la, lo]));
const COAST = [[9.9, 79.9], [9.6, 80.6], [9.1, 81.1], [8.6, 81.4], [8.0, 81.8], [7.4, 82.0], [6.8, 81.95], [6.3, 81.5], [5.85, 81.0], [5.85, 80.5], [6.0, 80.05], [6.5, 79.8], [7.1, 79.75], [7.7, 79.7], [8.3, 79.65], [8.9, 79.75]];
const wxCache = new Map();
async function cached(key, url) {
  const hit = wxCache.get(key);
  if (hit && Date.now() - hit.at < 60 * 60_000) return hit.body;
  const r = await fetch(url);
  if (!r.ok) { if (hit) return hit.body; throw new Error(`upstream ${r.status}`); }
  const body = await r.text();
  wxCache.set(key, { at: Date.now(), body });
  return body;
}
const q = (o) => new URLSearchParams(o).toString();
app.get('/api/weather/grid', async (_req, res) => {
  try {
    res.type('json').send(await cached('grid', `https://api.open-meteo.com/v1/forecast?${q({ latitude: PTS.map((p) => p[0]).join(','), longitude: PTS.map((p) => p[1]).join(','), hourly: 'precipitation,temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m', past_days: 3, forecast_days: 2, timezone: 'UTC', wind_speed_unit: 'kmh' })}`));
  } catch (e) { res.status(502).json({ error: 'weather unavailable' }); }
});
app.get('/api/weather/marine', async (_req, res) => {
  try {
    res.type('json').send(await cached('marine', `https://marine-api.open-meteo.com/v1/marine?${q({ latitude: COAST.map((p) => p[0]).join(','), longitude: COAST.map((p) => p[1]).join(','), hourly: 'wave_height,wave_period', past_days: 1, forecast_days: 2, timezone: 'UTC' })}`));
  } catch (e) { res.status(502).json({ error: 'weather unavailable' }); }
});

app.post('/api/alerts', async (req, res) => {
  const { type, text, lang, recipients, author } = req.body ?? {};
  if (!TYPES.has(type) || !LANGS.has(lang) || typeof text !== 'string' || !text.trim() || text.length > 480 || !recipients?.kind) {
    return res.status(400).json({ error: 'invalid alert' });
  }
  const alert = {
    id: crypto.randomUUID(), type, text: text.trim(), lang, recipients,
    createdAt: new Date().toISOString(), author: { id: String(author?.id ?? ''), name: String(author?.name ?? '') },
    status: 'sent', deliveredTo: [], readBy: [],
  };
  alerts.push(alert);
  const targets = DIRECTORY.filter((p) => matches(recipients, p));
  if (sms && TWILIO_FROM_NUMBER) {
    const results = await Promise.allSettled(targets.map((p) => sms.messages.create({ from: TWILIO_FROM_NUMBER, to: p.phone, body: alert.text })));
    alert.smsSent = results.filter((r) => r.status === 'fulfilled').length;
    alert.smsFailed = results.length - alert.smsSent;
  } else {
    alert.smsSent = 0; // no provider configured: stored only
  }
  res.status(201).json(alert);
});

app.listen(PORT, () => console.log(`PAE alerts server on http://localhost:${PORT} (SMS ${sms ? 'enabled' : 'disabled'})`));
