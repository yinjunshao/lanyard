---
tags: [technical, deploy]
---
# Deployment

## Environments
| Name | Address | Stack | Notes |
| --- | --- | --- | --- |
| v1 demo | `lanyard.musea-moderation.workers.dev` | Worker + KV | Hackathon demo; photos base64 in KV with 90-day TTL |
| v2 | `lanyard-v2.musea-moderation.workers.dev` | Worker + D1 + R2 | Deployed as `lanyard-v2` so v1 is untouched |
| Custom domain | `lanyd.fyi` (+ `www`) | Same v2 Worker | `RP_DOMAIN = lanyd.fyi` |
| Host portal | `host.lanyd.fyi` | Same v2 Worker | F10: its own pages, account and cookie; needs the custom domain added (owner step in [[F10 Separate host accounts on host subdomain]]) |

## Commands
- Local: `npm run dev` (Vite), `npm run dev:worker` (applies local migrations, `wrangler dev` on 8787)
- Remote DB: `npm run db:remote` (applies migrations with `wrangler.production.toml`)
- Ship: `npm run deploy` = build + `wrangler deploy --config wrangler.production.toml`
- Data tools: `export:prod`, `export:local`, `import:local`, `import:remote`, `migrate:kv`, `smoke:events`

## Host portal locally (F10)
The host portal is its own site, so locally it has its own address: **http://host.localhost:5173** (modern browsers send `*.localhost` to this machine; nothing to set up).
1. `npm run db:local` (applies migrations to the local D1).
2. `npx wrangler dev --port 8787` (the Worker; `wrangler.toml` has `HOST_ORIGIN = "http://host.localhost:5173"` and `host.localhost:5173` in `APP_ORIGIN`).
3. `npx vite --port 5173`. Vite proxies `/api` to 8787 and keeps the `Host` header, so the Worker knows which site a request is for. `vite.config.js` lists `host.localhost` in `server.allowedHosts`.
4. Main site: http://localhost:5173. Host portal: http://host.localhost:5173.
- `wrangler.toml` sets `MAIL_LOG = "1"`: no email is sent locally, even with real Resend keys in `.dev.vars`. Every email, including the 6-digit host sign-in code, is printed in the wrangler dev console. Remove the line to send for real.
- Over plain http the host cookie is `lanyard_host`; on https it is `__Host-lanyard_host`. Both are kept to the host site by the browser, so being signed in on one site never signs you in on the other.

## Config files

AI (F21) is **off** in `wrangler.production.toml` (`AI_ENABLED = "0"`). Vars: `AI_ENABLED`, `AI_MODEL`, `AI_GATEWAY_URL`, `AI_DAILY_BUDGET_USD`, `AI_MONTHLY_BUDGET_USD`, `AI_PRICE_INPUT_PER_MTOK_USD`, `AI_PRICE_OUTPUT_PER_MTOK_USD`, `AI_ALERT_EMAIL`, `AI_TIMEOUT_MS`; secret `CLAUDE_API_KEY`. Locally, `wrangler.toml` sets `AI_STUB = "1"` (canned replies, no key, no network); the Worker refuses the stub on any non-local `APP_ORIGIN`. wrangler loads `.dev.vars` next to its config; to try the admin or Settings screens without that file, run wrangler with a config copy in another folder and `--var ADMIN_TOKEN:<throwaway>`. The owner steps are in [[F21 AI foundation]].
`wrangler.toml` (local, localhost origins) and `wrangler.production.toml` (production origins, same D1/R2/KV, crons). Production also has `HOST_ORIGIN = https://host.lanyd.fyi` and `host.lanyd.fyi` in `APP_ORIGIN`. A production build (`npm run build`) points the app's host portal links at `https://host.lanyd.fyi` (set in `vite.config.js`; `VITE_HOST_ORIGIN` overrides it).

## Go-live checklist (from `wrangler.toml`)
Drops (F32): `wrangler secret put DROP_KEY` (a long random value, at least 16 characters; without it hosts see "Drops are switched off" and nothing is stored; changing it later makes stored items unreadable) and migration 0029 (additive) with `npm run db:remote`. See [[Security]]. F34 adds migration 0030 (one nullable column, additive): run `npm run db:remote` before the deploy, as for 0029.

Create D1 and paste id; create R2 bucket; apply migrations remotely; set origins and RP_ID; custom domain; `wrangler secret put ADMIN_TOKEN` (opens `/admin`).

## Gotchas
- Wrangler pinned to 4.20.5 (4.151.0 had broken OAuth scope on Windows).
- `RP_ID` must be the full hostname on workers.dev (public suffix).
- Do not re-run the KV migration against production by mistake.
- The legacy KV binding is kept only for audit; safe to delete after cutover is confirmed.
- `cloudflared.exe` (55 MB) sits in the repo root from the temporary tunnel era; the tunnel dies when the laptop sleeps.

Related: [[Architecture]], [[Testing]]
