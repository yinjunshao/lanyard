---
tags: [technical, security]
---
# Security

## Implemented (per code)
- Sessions stored hashed; HttpOnly cookies; SameSite Lax.
- Per-IP rate limits on new guests, wrong-code guesses, webhooks (`worker/ratelimit.js`).
- Passkey challenges held server-side (`webauthn_challenges`), single use.
- Private media: selfies served only to people in the connection.
- TOTP secrets encrypted at rest.
- Webhooks: https only, no IP literals or internal hostnames, no redirects followed, HMAC-SHA256 signature `Lanyard-Signature: t=...,v1=...`, 5 s timeout.
- Host API keys prefixed `lyk_`, webhook secrets `whsec_`.
- Security headers on every response (`worker/security.js`): CSP (self only, no framing), nosniff, Referrer-Policy, Permissions-Policy (camera self), HSTS on https, X-Frame-Options DENY, API responses `no-store`.
- Same-origin check on all state-changing `/api` calls (CSRF defence on top of SameSite=Lax). The attendee API does not accept the host portal's origin.
- Host portal (F10): separate host-only cookie `__Host-lanyard_host` (SameSite=Strict), host API only on the host site and only from its own pages (Origin and Sec-Fetch-Site on reads and writes), email codes hashed with limits per email, per IP and per code, and replies that never reveal whether an account exists. Tested in `test/hostsecurity.mjs`. See [[Auth and Sessions]].
- AI (F21, [[D028 AI goes through one Worker-side foundation that fails closed]]): the key is a Worker secret read only by `worker/ai/client.js`, never returned, stored or logged; guests and signed-out callers are refused; per-person quota, burst and address limits, daily and monthly budgets, a kill switch and a timeout each fall back with a friendly message and cost nothing; the cache is keyed per person; data is delimited and escaped, replies are rebuilt from a schema; admin AI routes sit behind `ADMIN_TOKEN`; AI is off in production config and the local-only stub is refused off a local origin. Tested in `test/ai.mjs` and `test/ai-injection.mjs`.

## History
`test/baseline-security.txt` records an early snapshot where many checks FAILED (headers, CSRF, media access, challenge reuse). The headers and same-origin checks above now exist in code, so treat that file as the **before** state. **TODO:** rerun `npm run test:security` and record the current result here.

## Open items
- Run a fresh test pass and pin the result.
- Penetration test or external review before real sponsor lead lists.

Related: [[Testing]], [[Auth and Sessions]], [[Privacy and Data Retention]]
