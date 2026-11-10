---
tags: [roadmap, feature, profile]
id: F11
priority: P1
phase: 1
size: M
status: Done
needs: []
---
# F11 Student and Career mode

**Priority:** P1 · **Phase:** 1 Foundations · **Size:** M · **Needs:** nothing (the switch uses the existing `.seg` style) · **Unlocks:** [[F12 Institution picker]], [[F14 Onboarding revamp]], [[F16 Shared ground without AI]], the AI features · back to [[00 Master To-Do]]

## What the owner asked for
Support people who are working, not only current students. In profile editing, below Name and above University, add a two-way switch: **Student** / **Career**. Career mode focuses on their current company and job or role.

## Data
Migration (next free number) on `profiles`:
- `mode TEXT NOT NULL DEFAULT 'student'` (`student` | `career`)
- `company TEXT` (≤ 80), `role TEXT` (≤ 80)
- Keep `uni`, `course` and `year`. In career mode they mean "Studied at" and are optional.

## UI (`EditProfile.vue`, and later [[F14 Onboarding revamp]])
- Segmented switch "Student | Career" directly under Name. Use the existing `.seg` style from Settings → Appearance.
- **Student:** University (from [[F12 Institution picker]]), Course, Year (optional).
- **Career:** Company, Role (job title), then "Studied at (optional)" as a collapsed row showing the institution picker.
- Switching keeps values typed in the other mode (nothing is deleted), but only the active mode's fields show on the card.
- "Come to me for" suggestion chips change by mode. Career: "Hiring", "Referrals", "Industry advice", "Mentoring", "Side projects". Student: the existing set.

## Display
One shared formatter, `src/lib/profile.js` → `subtitleOf(profile)`:
- Student: `Course · University` (or `Year 2 · Course` if no uni).
- Career: `Role at Company` (or just one of them).

Use it everywhere a subtitle is built today: `Badge.vue`, `PublicCard.vue`, `People.vue` rows, `EventDetail.vue` room, `MyCard.vue`. Grep for `course, p.uni` / `[p.course, p.uni]` patterns.

- Show the verified-student mark only in student mode.
- Search (`src/lib/search.js` `fieldsOf`): add "Company" and "Role" fields.
- Data export (`/api/account/export`) includes mode, company and role.
- The Privacy Policy data table lists company and role.

## API
`POST/PUT /api/profile` accept `mode` (whitelist), `company` and `role` (trimmed, length-capped). `/api/c/:cardId` and the room return them only when the card shows them, the same way as today's fields.

## Tasks
- [x] F11.1 Migration and API validation, with tests.
  - `migrations/0019_profile_mode.sql` adds `mode` (default `student`), `company` and `role` (both `NOT NULL DEFAULT ""`, like `uni`). `mode` outside `student`/`career` is a 400 on create and edit; company and role are trimmed to 80. Card, people list, one person and event room return the three fields. `test/mode.mjs` (18 checks, in `npm test`) covers all of this, plus the export and deletion.
- [x] F11.2 Switch and fields in `EditProfile.vue`.
  - A Student / Career `.seg` switch under Name. Student keeps University, Course, Year. Career shows Company and Role, with "Add where you studied (optional)" opening one Studied at field (open already when it is filled; Course and Year are student-mode fields and are kept, not shown, in Career). Values for the other mode stay in the form and are saved, never cleared. The "Come to me for" suggestions change by mode. Plain inputs for now; F12 turns the institution field into the picker.
- [x] F11.3 `subtitleOf()` used everywhere.
  - `src/lib/profile.js` has `subtitleOf(profile, { year })` and `subtitleParts`. Used by `MyCard.vue` (which hands the line to `Badge.vue` and to the card image in `lib/qr.js` as a `subtitle`, so neither imports the formatter and the Landing page, which shows a fixed demo badge, loads nothing new), `PublicCard.vue` (and its vCard: ORG and TITLE become company and role in Career mode), `People.vue`, `EventDetail.vue` and `Connect.vue`. A student reads exactly as before; the year is added only on the badge, public card and card image, where it was shown before. The plan said "Year 2 · Course if no uni"; that would have changed old cards, so it is not done. Career reads "Role at Company", plus "Studied at ..." only when filled in. The Finish your card step on My card asks for company and role in Career mode. The verified-student mark is not drawn on any card today, so there was nothing to hide. `test/mode.mjs` guards that no screen builds the line by hand.
- [x] F11.4 Search, export and policy text.
  - Search (`src/lib/search.js`) gains Company and Role, and indexes only the chosen mode: a career profile is found by company, role and studied-at, not by its kept course; a student is not found by a kept company. The export already returned the whole profile row, so mode, company and role are in it (checked in `test/mode.mjs`). The Privacy Policy table in `Privacy.vue` lists them. Vault notes updated: Data Model, API Surface, Privacy and Data Retention, Codebase Map, Testing, Features, Screens and Routes. The Terms and Privacy version string was not changed (see Log).

## Acceptance checks
- [x] A career profile's badge reads "Product designer at Acme", with no course or university unless "Studied at" is filled. (Checked in a browser with a local account that still had a course typed: My card badge read "Product designer at Acme"; with Studied at filled the public card read "Product designer at Acme · Studied at Some University". `test/mode.mjs` checks the formatter both ways.)
- [x] Switching mode and back loses nothing. (In the Edit profile form in a browser: Career to Student showed the kept course, back showed the kept company and role; a real save from Student mode left company and role in `/api/me`. `test/mode.mjs` checks it through the API.)
- [x] Old profiles show exactly as before (default `student`). (`test/mode.mjs` applies migration 0019 to a profile in the old shape and checks it reads `student` with its course and university untouched; the formatter returns the same line as the old code, including the year on the badge and public card.)

## Log
- 2026-11-10 (Claude subagent): Profiles now have a mode (`student` default, or `career`), a company and a role (migration 0019, additive). Edit profile has a Student / Career switch under Name; Career asks for company and role, with an optional "Studied at". One formatter, `src/lib/profile.js`, builds the line under a name everywhere; search covers company and role; the Privacy Policy table lists them. Four task commits plus fixes.
- First-load JS, gzip of entry + static imports + page chunk, from `dist/`, same method on a clean copy of the commit before F11 and on the result: Landing 65,201 to 65,172 B (no growth; a first version pulled the formatter into the Landing chunk through the badge and the card-image chunk, so `Badge.vue` and `lib/qr.js` now take the finished line as a `subtitle` and Landing passes a literal). Public card 59,267 to 59,568 B (+301 B: the formatter's own shared chunk, about 254 B, and its use in the page for the line and the vCard). Both pages were already over 50 KB and stay with F28. Edit profile chunk 5,415 to 5,927 B gzip.
- Decisions made without the owner: search indexes only the chosen mode (a kept course is not searchable on a career profile, a kept company not on a student), so nothing hidden on a card can be found; in Career the "Studied at" row is the institution only, and Course and Year stay student-mode fields; the plan's "Year 2 · Course if no uni" was not done because it would change how existing cards read. The verified-student mark is not drawn on any card or list today, so there was nothing to hide in Career. The Terms and Privacy version string was not bumped (two more profile fields shown as the person chooses); that is the owner's call, bumping makes everyone accept again.
- Not done, left for later rows: the institution picker for "Studied at" and University ([[F12 Institution picker]]); the onboarding form ([[F14 Onboarding revamp]]) should reuse the same switch and the company and role fields from `EditProfile.vue`; [[F16 Shared ground without AI]] should read `mode`, `company`, `role` and `subtitleOf()` rather than `course` and `uni` directly. Event reports for hosts still count courses in aggregate from `profiles.course`, including kept courses of career profiles; consider counting only student-mode profiles there. Not checked in a browser: the People list and event room rows (same formatter, API fields covered by tests); the screen-reader reading of the switch.

### Owner steps
- Review the F11 commits, `git push`, `npm run db:remote` (applies `0019_profile_mode.sql`; it only adds three columns with defaults and is safe to apply before the new code), then `npm run deploy`.
- Decide whether to bump the Terms and Privacy version for the two new profile fields.

Related: [[Data Model]], [[D015 Profile split from cards]] · back to [[00 Master To-Do]]
