---
tags: [technical, stack]
---
# Tech Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Front end | Vue 3.5 (Composition API, `<script setup>`), Vue Router 4, Vite 8 | No UI library; plain CSS variables. See [[Design System]] |
| API | Cloudflare Workers + Hono 4 | `worker/index.js` and feature modules |
| Database | Cloudflare D1 (SQLite) | 14 migration files (0001-0013) in `migrations/` |
| Media | Cloudflare R2 | Selfies compressed in browser to WebP (max 1080px) |
| Auth | Cookie sessions + passkeys (`@simplewebauthn` v14), email codes, TOTP | See [[Auth and Sessions]] |
| QR | `qrcode` to generate; BarcodeDetector API with `jsqr` fallback to scan | Card PNG drawn on canvas 1080 x 1920 |
| Email | Resend (two keys: accounts and decisions) | See [[Integrations and Email]] |
| Fonts | Atkinson Hyperlegible Next, self-hosted, Latin subset | |
| Tooling | Wrangler 4.20.5 pinned (newer broke OAuth on Windows) | See [[Deployment]] |
| Pitch deck build | `pptxgenjs` (`build-deck.mjs`) | See [[Demo Video and Pitch Deck]] |
| Payments | None yet; Stripe planned | See [[D009 Manual invoicing before Stripe]] |

## Secrets (names only; values live in `.dev.vars` / `wrangler secret`)
`ADMIN_TOKEN`, `TOTP_KEY`, `RESEND_ACCOUNTS_KEY`, `RESEND_DECISIONS_KEY`, `CLAUDE_API_KEY` (present in the example file; check whether used).

Related: [[Architecture]]
