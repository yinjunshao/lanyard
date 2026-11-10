---
tags: [technical, testing]
---
# Testing

Offline tests run the real Worker against in-memory SQLite (Node 22+, `node:sqlite`). No Wrangler or network.

| Command | Covers |
| --- | --- |
| `npm run test:security` | Sessions, CSRF, headers, passkey challenges, private media, uploads, blocking, access control, rate limits |
| `npm run test:features` | Feedback, reports/CSV, duplicate/edit/end event, webhooks and API keys, follow-ups, tags, retention purge, legacy sessions |
| `node test/eventmail.mjs` | Event email |
| `npm run test:vue` | Compiles every `.vue` template and syntax-checks each `<script setup>` |
| `node test/homepath.mjs` | F02: the signed-in hint, and that every logo uses `homePath()` |
| `node test/copycheck.mjs` | F03: no real university, students' union, street or society named in `src/`, `worker/`, `public/` or `index.html` (whole-word patterns; allow-list in the file) |
| `node test/ui.mjs` | F05, F06: the My card tab uses the `qr` icon; the Edit profile and Cards buttons use `.btn-quiet` (source guards) |
| `node test/dates.mjs` | F08: date maths for the pickers (month lengths, leap years, Monday-first grid, typed times, both UK clock changes). Sets `TZ=Europe/London` itself, so it does not depend on the machine's zone |
| `node test/settings.mjs` | F09: the old `#plus` / `#signin` / `#install` redirects, no `settings#` link left in `src/` or `worker/`, every old Settings control still on a page, the router stays free of settings pages. The session-handle checks (`DELETE /api/auth/sessions/:id`) are under "Signed-in devices" in `test/security.mjs` |
| `node test/pickers.mjs` | F08: search matching for `UiCombobox`, and source guards: no native `<select>` or date input in `src/`, the public card loads its calendar lazily, `/ui-test` is dev-only |
| `node test/perf.mjs` | DB queries per request on hot paths |
| `npm test` | Runs every offline test above except perf |

The passkey section needs a stub of `@simplewebauthn/server` and skips itself when the real library is installed.

Related: [[Security]], [[Deployment]]
