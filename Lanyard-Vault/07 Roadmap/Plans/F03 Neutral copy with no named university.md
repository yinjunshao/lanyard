---
tags: [roadmap, feature, copy]
id: F03
priority: P0
phase: 0
size: S
status: Done
needs: []
---
# F03 Neutral copy with no named university

**Priority:** P0 · **Phase:** 0 Quick fixes · **Size:** S · **Needs:** nothing · back to [[00 Master To-Do]]

## What the owner asked for
Search the whole platform for example text that names a specific university or society, for example "UCL Careers Fair" on the host event form. No example, placeholder or demo may name a real university or society.

## Found so far (2026-11-10, not complete)
| File | Text | Replace with |
| --- | --- | --- |
| `src/views/HostDashboard.vue` ~436 | placeholder `UCL Careers Fair` | `Spring networking night` |
| `src/views/HostDashboard.vue` ~457 | `Step-free via the lift on Gower St` | `Step-free entrance at the side door` |
| `src/views/HostDashboard.vue` ~153 | `(for example name@ucl.ac.uk)` | `(for example name@university.ac.uk)` |
| `worker/hostorg.js` ~27 | `(for example name@ucl.ac.uk)` | same as above |
| `src/views/EditProfile.vue` ~185 | placeholder `e.g. UCL` | removed by [[F12 Institution picker]]; until then `Your university` |
| `src/views/Landing.vue` ~20 | demo card `uni: "UCL"` | a made-up name that is clearly not real, or drop the field. Done: field dropped |
| `src/views/HostLive.vue` ~247 (found in the F03.1 sweep) | placeholder `Step-free via the lift on Gower St` | `Step-free entrance at the side door` |
| `scripts/smoke-events.mjs` ~38 (found in the F03.1 sweep) | test profile `uni: "UCL"` | `Example University` |

Fine to keep: generic phrases like "Careers fair" (`CardForm.vue`, `FeedbackEditor.vue` templates). The legal address and operator name in Privacy/Terms stay. The reserved-code blocklist in `worker/codes.js` (`UCL`, `UCLSU`) is not copy and stays.

## Tasks
- [x] F03.1 Sweep `src/`, `worker/`, `public/` (manifest, `index.html` meta), and the email templates in `worker/mail*.js` for: `UCL`, `ucl.ac.uk`, `Imperial`, `King's`, `KCL`, `LSE`, `SOAS`, `QMUL`, `Oxford`, `Cambridge`, `Bartlett`, `Gower`, `Bloomsbury`, `Students' Union` / `SU` used as a name, and any named society. Fix each one. Add any you find to the table above.
- [x] F03.2 Add `test/copycheck.mjs`, which fails if those names appear in `src/` or `worker/`. Allow-list the institution data file from [[F12 Institution picker]] (`src/data/institutions-*.json`), `codes.js` and the legal pages' address lines. Wire it into `npm test`.

## Acceptance checks
- [x] `npm test` includes the copy check and passes.
- [x] Creating an event, editing a profile and the landing demo show no real institution or society.

## Log
- 2026-11-10: Replaced the named examples (event name, access, university email, profile placeholder, landing demo card) with neutral ones. The sweep also found `Gower St` on the HostLive Access field and `uni: "UCL"` in `scripts/smoke-events.mjs`; both fixed and added to the table. Landing demo card now has no university.
- `test/copycheck.mjs` (in `npm test`) scans `src/`, `worker/`, `public/` and `index.html` with whole-word patterns, and checks its own patterns on sample strings. Allow-list: `worker/codes.js`, `src/data/institutions-*.json` (F12), address lines in Terms and Privacy. Nothing in the allow-list is currently needed except `codes.js`.
- Acceptance check 2 was verified from the source and the built bundle (no `UCL` or `Gower` in `dist/`; the event name placeholder is in the HostDashboard chunk), not by looking at the rendered pages. Left alone: test fixtures in `test/features.mjs` (UCL addresses and "UCL Robotics" are test data, never shown) and `docs/`.
- Owner steps: review and `git push`, then `npm run deploy` (no migrations).

Related: [[Design System]] · back to [[00 Master To-Do]]
