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
  const ok = !ALERTS_API_TOKEN || req.get('authorization') === `Bearer ${ALERTS_API_TOKEN}`;
  return ok ? next() : res.status(401).json({ error: 'unauthorized' });
});

app.get('/api/alerts', (_req, res) => res.json([...alerts].reverse()));

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
