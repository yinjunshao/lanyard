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

Card payments (F36, [[D041 Polar as merchant of record behind one provider module]]): migration 0031 is additive and safe to apply before the code (`npm run db:remote`, in order after 0018 to 0030). Billing stays **off** until the F27 blockers are cleared (legal entity, address, ICO, a lawyer's review): `BILLING_ENABLED` is not set anywhere, and the owner steps are, in order:
1. A Polar account for the business, **sandbox first** (sandbox.polar.sh is a separate account), then live. The account owner is who gets the payouts and passes the ID checks.
2. Products in Polar priced as the code: Plus monthly £1.49 and yearly £11.99 (subscriptions), and each self-serve host pack in `HOST_SKUS` (one-off). Customer Portal on, with cancellation allowed. Check in the sandbox whether prices show with VAT added or included, and make the Plan page say the same.
3. A webhook endpoint `https://lanyd.fyi/api/webhooks/polar` (main site, not host.) with the events `order.paid`, `order.refunded`, `subscription.created`, `subscription.active`, `subscription.updated`, `subscription.canceled`, `subscription.uncanceled`, `subscription.revoked`. Make a new secret (Polar secrets from 8 September 2026 are plain Standard Webhooks; an older one will not verify).
4. `wrangler secret put POLAR_ACCESS_TOKEN` and `wrangler secret put POLAR_WEBHOOK_SECRET` (secrets only, never `[vars]`).
5. Vars in `wrangler.production.toml`: `POLAR_PRODUCTS` (JSON of our product id to Polar's product id, for example `{"plus_month":"…","plus_year":"…","standard_1":"…"}`), `SELLER_NAME` and `SELLER_ADDRESS` (the legal name and full geographic address shown before Pay; checkout is refused until both are set), and `POLAR_SERVER = "sandbox"` while testing against the sandbox.
6. Try it on a local or staging copy against the sandbox: subscribe, cancel in the portal, a pack paid and refunded, a webhook replayed from Polar's dashboard. Confirm the event field names (`checkout_id`, `product_id`, `subtotal_amount`, `current_period_end`) match what `worker/billing/polar.js` reads.
7. Only after the owner signs off: `BILLING_ENABLED = "1"` on the live site, with the live token, secret and product ids.

Create D1 and paste id; create R2 bucket; apply migrations remotely; set origins and RP_ID; custom domain; `wrangler secret put ADMIN_TOKEN` (opens `/admin`).

## Search and link previews (F37)
- No migration, no new secret, no new setting. The Worker builds absolute links from the **first entry of `APP_ORIGIN`**: keep `https://lanyd.fyi` first in `wrangler.production.toml` (a `host.*` entry is skipped; with none usable it falls back to `https://lanyd.fyi`).
- `public/og-image.png` (1200 x 630, about 10 KB) is made by `node scripts/make-og-image.mjs` (needs `sharp`, which wrangler already brings into `node_modules`). Commit the new PNG if it changes; chat apps keep the old picture by address, so a changed picture needs a new file name.
- After the deploy, owner checks (a local run proves the tags, only the real apps prove the previews): paste `https://lanyd.fyi/`, `/hosts`, a real card link and a real event link into the LinkedIn Post Inspector (https://www.linkedin.com/post-inspector/) and opengraph.xyz, the Facebook Sharing Debugger, and send them to yourself on WhatsApp and Slack; each should show the right title and picture. Then Search Console: add `lanyd.fyi`, submit `/sitemap.xml`, and "inspect" a card link to see "noindex" reported. Cards and events must not appear in search.

## Gotchas
- Wrangler pinned to 4.20.5 (4.151.0 had broken OAuth scope on Windows).
- `RP_ID` must be the full hostname on workers.dev (public suffix).
- Do not re-run the KV migration against production by mistake.
- The legacy KV binding is kept only for audit; safe to delete after cutover is confirmed.
- `cloudflared.exe` (55 MB) sits in the repo root from the temporary tunnel era; the tunnel dies when the laptop sleeps.

Related: [[Architecture]], [[Testing]]
