# Tests

Offline tests that run the real Worker against an in-memory SQLite database
(Node 22+, uses `node:sqlite`). No Wrangler or network needed.

- `npm run test:security` – security checks (sessions, CSRF, headers, passkey
  challenges, private media, uploads, blocking, access control, rate limits).
- `npm run test:features` – feedback, reports/CSV, duplicate/edit/end event,
  webhooks and API keys, follow-ups and tags, retention purge, legacy sessions.
- `npm run test:vue` – compiles every `.vue` template with Vue's compiler and
  syntax-checks each `<script setup>`.
- `node test/perf.mjs` – database queries per request on the hot paths.

The passkey section of the security suite needs a stub of
`@simplewebauthn/server` (it can't produce real authenticator signatures), so it
skips itself when the real library is installed.
