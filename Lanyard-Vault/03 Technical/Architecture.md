---
tags: [technical]
---
# Architecture

One Cloudflare **Worker** serves the Vue single-page app (static assets), all `/api/*` routes and `/media/*`. Data lives in **D1** (SQLite); images in **R2**. Cron triggers run retention and email jobs.

```
Browser (Vue 3 SPA, PWA)
   |  HTTPS, cookie session
   v
Cloudflare Worker (Hono) ---- ASSETS (dist/)  SPA fallback
   |-- D1  lanyard_db   users, cards, connections, events, orgs, billing...
   |-- R2  lanyard-media   selfies, profile photos, project images, sponsor logos
   |-- KV  LANYARD_KV   legacy v1 data; read-only export tooling only
   |-- Cron  17 3 * * *  daily purge;   47 * * * *  hourly event mail
   '-- Resend  account mail (sign-in codes), host decision mail
```

## Notes
- `run_worker_first = true`, `not_found_handling = single-page-application`, so deep links work.
- Host portal can be served from `host.<domain>` (same Worker, two custom domains). See [[D014 Separate host subdomain]].
- Public pages are code-split to stay under the 50 KB JS budget (checked by `test/budget.mjs`, part of `npm test`); the /app frame, QR, passkey, scanner and a card's connection panel load only where used ([[D024 Signed-in frame and heavy pieces load only where used]]).
- v1 used KV only; v2 moved to D1 + R2. See [[D002 Move from KV to D1 and R2]].

Related: [[Tech Stack]], [[Data Model]], [[Deployment]], [[Codebase Map]]
