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
- Same-origin check on all state-changing `/api` calls (CSRF defence on top of SameSite=Lax).

## History
`test/baseline-security.txt` records an early snapshot where many checks FAILED (headers, CSRF, media access, challenge reuse). The headers and same-origin checks above now exist in code, so treat that file as the **before** state. **TODO:** rerun `npm run test:security` and record the current result here.

## Open items
- Run a fresh test pass and pin the result.
- Penetration test or external review before real sponsor lead lists.

Related: [[Testing]], [[Auth and Sessions]], [[Privacy and Data Retention]]
