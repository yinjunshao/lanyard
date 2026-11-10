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
| `node test/hosts-accounts.mjs` | F10: migration 0018 on data in the old shape (`test/fixtures/old-hosts.sql`), and the host reset script (option B) |
| `node test/hostsecurity.mjs` | F10: host and attendee cookies kept apart on every host route, the host API refused on the main site and from other origins, email-code limits and generic replies, no host route reading attendee identity, aggregates only |
| `node test/hostsite.mjs` | F10: `/host...` 301s to the host site, the two route tables, host code out of `api.js`, config |
| `node test/hostsetup.mjs` | F07 and F10: every host setup step can be signed out of and resumes from the server; source guards for Back, Sign out and no passkey copy |
| `node test/mode.mjs` | F11: migration 0019 on an old profile, `mode` / `company` / `role` validation on create and edit, what card, people list, one person and event room return, export and deletion, `subtitleOf()`, search by company and role, and source guards (no hand-built course line; Privacy Policy lists the fields) |
| `node test/institutions.mjs` | F12: the institution list (unique ids, id = slug of name, pinned ids, domains), migration 0020 on an old profile, institution id validation and clearing on profile and society organisation, export and deletion, the backfill script, source guards (list loaded only by a plain `import()` in the profile editor and host dashboard) |
| `node test/provenance.mjs` | F13: migration 0021 on an old connection (NULL, not a guess), the `via` whitelist and first-write-only rule, what the people list, one person, the card page and the export return, a connection whose event has gone, deletion, that no host code or host response carries it, the wording (`connectedVia`, `connectedShort`, `metStamp`) and source guards for `?s=` on the QR, copy link, scanner and typed code, and for the card page removing it |
| `node test/onboarding.mjs` | F14: migration 0022 on an old profile, profile creation with mode, institution, consent rows and validation, the progress API (resume, Back, finish, refusals), a guest who connected first, the funnel counts and the admin response, the purge, and source guards: every old consent and legal step is still there, the steps share Edit profile's fields, the connect sheet and public card are untouched and `?s=` survives, the banner and My card behave while in the steps |
| `node test/budget.mjs` (also `npm run test:budget`) | F28: the first-load JS budget. It runs `vite build` itself, then reads `dist/`: for Landing, PublicCard, Hosts, Privacy, Terms, Redeem, SignIn and PrivacyRequest it adds up the gzip size of the entry chunk, everything the entry statically imports, the page's chunk and what that imports, and fails over 50 KB (51,200 B) on any of them. It also lists `modulepreload` links in `index.html` (none today) and the chunks a page loads lazily (not counted). Because it builds first it cannot pass on a stale `dist/`; `--no-build` measures `dist/` as it is and fails if `dist/` is older than `src/`, `public/`, `index.html`, the Vite config or `package.json`. `BUDGET_BYTES=45000` lowers the limit, to see it fail. It is the last step of `npm test`, so `npm test` now includes a production build (a few seconds) |
| `node test/perf.mjs` | DB queries per request on hot paths |
| `npm test` | Runs every offline test above except perf, ending with the budget check (which builds) |

The passkey section needs a stub of `@simplewebauthn/server` and skips itself when the real library is installed.

Related: [[Security]], [[Deployment]]
