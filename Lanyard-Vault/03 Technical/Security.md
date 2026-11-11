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
- Follow-up drafts (F22): the model's input is read from the database for a connection the asker is in (the other person's card as shared with them, never their email, links, headline or hidden fields), the browser can only pick from what was offered, the request is inspected in tests, the reply is cleaned of links, emails, phone numbers and markup and cut to length, and nothing is sent by Lanyard. Attack cases: `test/ai-injection.mjs`. [[D032 Follow-up drafts are built from database rows and checked on the way out]]
- AI feedback summaries (F23): host routes behind the existing host guards (host site only, host cookie only, setup finished, the event's own organisation, 404 otherwise). The threshold of 5 written answers to one question is enforced in code before any model call. Attendees' words reach the model only after cleaning and redaction (names of the people at the event and the organisers, titles, phone numbers, handles), as data inside one `<data>` block; the reply is rebuilt from the schema, every sentence checked (no digits, number or count words, single-person phrases or names), counts worked out from the answer ids the model cites (different people, at least 3), quotes exact and from a well-answered question only. Plain text on the page, never HTML. What code cannot catch is a free sentence of the model's that is only words; the host reads it beside the real figures and the answers, labelled as written by AI.
- People search (F24): who is searched is decided in code before the model (own connections only; `blockedSet` and `searchableIds`; the card each person shared with the asker, read through the same card rule as `sharedCard`). The model sees opaque ids and cleaned, capped fields. Its reply is trusted only as far as it can be proved: an offered id, and a quote that is really in that person's record (a match with no such quote is dropped; a reply of invented matches falls back to keywords); a reason that names a number, an acronym, a capitalised word or an id that is not in the record is replaced by the quote. The asker's question is cleaned and goes in as data. Tested in `test/people-search.mjs` and `test/ai-injection.mjs`.
- AI who to meet (F25): the pool is `presenceCandidates()`, the same rows the usual list can show, gathered in code on every request; the model only re-orders it and the answer is rebuilt from rows gathered on that request, so a cached reply can never name someone who has left, been blocked or turned presence off. Opted-out people (`searchableIds`) are not sent and stay in the usual order after the picks. The model sees opaque ids and cleaned, capped fields; a field that reads like an instruction is left out (`looksLikeInstruction`); a pick stands only with a quote really in that person's record (F24's `verifyMatches`). The wish is read from the database, never from the request. The route refuses outside the event's live window before the cache is read, and the kept replies are deleted on withdrawal, block and erasure.

## History
`test/baseline-security.txt` records an early snapshot where many checks FAILED (headers, CSRF, media access, challenge reuse). The headers and same-origin checks above now exist in code, so treat that file as the **before** state. **TODO:** rerun `npm run test:security` and record the current result here.

## Open items
- Run a fresh test pass and pin the result.
- Penetration test or external review before real sponsor lead lists.

Related: [[Testing]], [[Auth and Sessions]], [[Privacy and Data Retention]]
