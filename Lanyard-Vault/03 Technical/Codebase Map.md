---
tags: [technical, code]
---
# Codebase Map

Folder: `D:\Hackathons\ClaudeBuildersClub\lanyard`

| Path | What |
| --- | --- |
| `src/` | Vue app: `views/` (pages), `components/`, `lib/` (api, qr, scanner, search, photo, offline, theme), `router/`, `styles/main.css` |
| `src/views/Settings.vue`, `src/views/settings/` | Settings ([[F09 Settings in category pages]]): the layout (list, page, Log out) and one file per page. Add a row to a page by editing its file; add a page by adding it to `PAGES` in `Settings.vue` and the list `rows`. `src/router/settingsRedirect.js` maps the old `#` anchors. `components/DevicesSheet.vue` is the signed-in devices sheet |
| `src/lib/profile.js` | F11: `subtitleOf(profile, { year })` and `subtitleParts`, the one formatter for the line under a name (Student: Course · University; Career: Role at Company). Screens must use it; `test/mode.mjs` guards that. `Badge.vue` and `lib/qr.js` take the finished line as a `subtitle` so the Landing page loads no formatter |
| `src/components/ui/` | The custom pickers ([[F08 Custom pickers and dropdowns]]): `UiSheet` (phone sheet or popover shell), `UiSelect`, `UiCombobox`, `UiDatePicker`, `UiTimePicker`, `UiDateTimePicker`. Date maths is `src/lib/dates.js`, search matching `src/lib/match.js` |
| `worker/` | API: `index.js` (core routes), `hosts.js` (host portal, largest), `host-auth.js` (host accounts: guard, cookie, email-code sign-in, F10), `events.js`, `feedback.js`, `admin.js`, `auth.js`, `session.js`, `passkeys.js`, `totp.js`, `email-auth.js`, `plans.js`, `codes.js`, `purge.js`, `security.js`, `ratelimit.js`, `integrations.js`, `mail*.js`, `media.js`, `unsub.js`, `legal.js` |
| `migrations/` | D1 schema 0001-0019 |
| `src/router/routes.attendee.js`, `routes.host.js`, `src/lib/hostapi.js`, `src/components/HostSetup.vue` | F10: the main site's and the host portal's pages, the host API client, host sign-in and setup |
| `.migrations/` | KV export/import artifacts for v1 to v2 |
| `scripts/` | export-kv, import-v2, migrate-kv, smoke-events, `reset-hosts.mjs` (F10 host reset, dry run by default) |
| `test/` | security, features, eventmail, vuecheck, perf |
| `docs/` | Product plan, opportunity brief, activity-mode strategy |
| `logo-kit/`, `logo-concepts/` | Brand assets and generator |
| `brag-output*/` | Demo video sources and renders |
| `build-deck.mjs`, `Lanyard-pitch.pptx` | Pitch deck generator and output |
| `dist/`, `public/` | Build output, static assets |
| `.dev.vars` | Local secrets (gitignored; do not commit or share) |

Related: [[Architecture]], [[Source Documents]]
