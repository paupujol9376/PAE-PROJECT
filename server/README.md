# PAE alerts server (example)

Reference backend for the app's **SMS mode**. It is not deployed and not production-ready (see the
list at the top of `index.js`). It exists to show where secrets live and what the endpoint looks like.

## Endpoint

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| `POST` | `/api/alerts` | `Authorization: Bearer <ALERTS_API_TOKEN>` if the token is set | `{ type, text, lang, recipients, author }` | `201` the stored alert (+ `smsSent`, `smsFailed`) |
| `GET` | `/api/alerts` | same | — | `200` alerts, newest first |

`type` ∈ `flood | evacuation | school_closed | all_clear`; `lang` ∈ `en | si | ta`;
`recipients` is `{kind:'all'}`, `{kind:'district', districts:[...]}`, `{kind:'school', schools:[gigaId...]}`
or `{kind:'role', roles:['kids'|'adult'|'authorities']}` (same model as `app/src/alerts/types.ts`).

## Run

```bash
cd server
npm install
cp ../.env.example .env   # fill TWILIO_* and ALERTS_API_TOKEN here, on the server only
npm start                 # http://localhost:8787  (Node 20.6+ for --env-file)
```

Add the phone numbers that may receive SMS to `DIRECTORY` in `index.js` (only numbers you own or
have consent for). Without Twilio variables the server stores alerts but sends no SMS.

## Connect the app

Build the app with public settings only:

```bash
cd app
VITE_ALERTS_MODE=sms VITE_ALERTS_API_URL=http://localhost:8787 npm run build
```

The app never sees the Twilio keys. The app cannot hold `ALERTS_API_TOKEN` either (it would be
public), so for a local demo leave `ALERTS_API_TOKEN` empty: the server then accepts requests
without a token and prints a warning. **Never expose it like that on the internet.** A real
deployment issues per-user tokens from this server at login and checks the role (only
authorities may send) on every request, which means moving authentication to the backend.
