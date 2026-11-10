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

## Commands
- Local: `npm run dev` (Vite), `npm run dev:worker` (applies local migrations, `wrangler dev` on 8787)
- Remote DB: `npm run db:remote` (applies migrations with `wrangler.production.toml`)
- Ship: `npm run deploy` = build + `wrangler deploy --config wrangler.production.toml`
- Data tools: `export:prod`, `export:local`, `import:local`, `import:remote`, `migrate:kv`, `smoke:events`

## Config files
`wrangler.toml` (local, localhost origins) and `wrangler.production.toml` (production origins, same D1/R2/KV, crons).

## Go-live checklist (from `wrangler.toml`)
Create D1 and paste id; create R2 bucket; apply migrations remotely; set origins and RP_ID; custom domain; `wrangler secret put ADMIN_TOKEN` (opens `/admin`).

## Gotchas
- Wrangler pinned to 4.20.5 (4.151.0 had broken OAuth scope on Windows).
- `RP_ID` must be the full hostname on workers.dev (public suffix).
- Do not re-run the KV migration against production by mistake.
- The legacy KV binding is kept only for audit; safe to delete after cutover is confirmed.
- `cloudflared.exe` (55 MB) sits in the repo root from the temporary tunnel era; the tunnel dies when the laptop sleeps.

Related: [[Architecture]], [[Testing]]
