---
tags: [roadmap, feature, profile]
id: F11
priority: P1
phase: 1
size: M
status: Not started
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
- [ ] F11.1 Migration and API validation, with tests.
- [ ] F11.2 Switch and fields in `EditProfile.vue`.
- [ ] F11.3 `subtitleOf()` used everywhere.
- [ ] F11.4 Search, export and policy text.

## Acceptance checks
- [ ] A career profile's badge reads "Product designer at Acme", with no course or university unless "Studied at" is filled.
- [ ] Switching mode and back loses nothing.
- [ ] Old profiles show exactly as before (default `student`).

## Log
-

Related: [[Data Model]], [[D015 Profile split from cards]] · back to [[00 Master To-Do]]
