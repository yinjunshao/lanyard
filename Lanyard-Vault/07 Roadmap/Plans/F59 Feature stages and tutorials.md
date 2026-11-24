---
tags: [roadmap, feature, onboarding, ui]
id: F59
priority: P1
phase: 10
size: L
status: In progress
needs: [F24, F60]
---
# F59 Feature stages and tutorials

**Priority:** P1 · **Phase:** 10 Owner requests (2026-11-24) · **Size:** L · **Needs:** [[F24 Do I know someone who]], [[F60 Intention at check-in and who to meet for everyone]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"I want to introduce stages for the onboarding. This is basically features that are to, like, if I make 5 connections and this is the first time I made 5 connections, then introduce using like a tutorial the AI Finder feature. So that would be you introduce how that can be used, etc. Also find other potential candidates and features that could require something like this or could benefit from something like this. Maybe not 5 connections, maybe be it like more than 1 at least."

Asked when the AI Finder tutorial should start, the owner chose (2026-11-24) **after 3 connections**.

## Current state
- Onboarding ([[F14 Onboarding revamp]]) is the one-question-a-screen welcome at `/app/welcome`, tracked by `profiles.onboarding_step` (`worker/onboarding.js`). Nothing teaches features after it.
- The AI Finder is "Do I know someone who" ([[F24 Do I know someone who]]): `src/components/PeopleAsk.vue`, opened from `src/views/People.vue` line 21. It shows only when AI is on for the person.
- No tour or tip system exists.

## Plan
**Stages** are moments when a feature becomes useful. Each has a trigger the app already knows, and a short tutorial: two to four steps, each a small card pointing at the real control (a ring around it and a short line), with Next, Back and Got it, or Skip. A stage shows once per account (seen on the server, so not again on another device), at most one stage per day, never during a sheet or a form, never on public pages. Settings > Help gets "Show tips again".

The first stages (candidates found in the app, ordered by value):
1. **AI Finder** (the owner's): the first time someone has 3 or more connections and AI is on for them. On People: "Ask who you know" -> type a need such as "someone who works in finance" -> see who and why -> it only uses what their cards show. Not shown if AI is off.
2. **Follow-up reminders**: after the first connection. On that person's page: set a reminder (Tomorrow, In 3 days) -> we email you then ([[F48 Follow-up reminder emails]]).
3. **Draft a message**: the first time someone opens a person they met at an event, with AI on. Shows Draft a message and the tone choice ([[F22 AI follow-up drafts]]).
4. **Who to meet**: the first check-in to an event with suggestions on. On the event hub: your intention -> who to meet -> Suggest me can be unticked ([[F60 Intention at check-in and who to meet for everyone]]).
5. **More than one card**: after a second event check-in, or 5 connections. On My cards: "Make a card for a careers fair or a club" and the card code.
6. **Add to home screen**: on a phone browser, not installed, after the second connection. Points at the install steps (`InstallGuide.vue`).

Building it:
- A registry `src/lib/stages.js`: id, trigger (a function of a small "progress" object), the page it runs on, and its steps (a target selector by `data-tip="..."` attribute, title, one or two lines).
- Progress comes from the Worker in the existing "me" response, counts only: connections, events checked in, cards, AI available, installed is from the browser. Seen stages in a new table `user_stages (user_id, stage, seen_at, PRIMARY KEY (user_id, stage))` (next free migration, additive), written by `POST /api/stages/:id/seen` (signed in, rate limited, only known ids). Deleted with the account; in the export.
- The tutorial UI is one lazy component `src/components/StageTour.vue`, loaded only when a stage is due: a dim layer with a cut-out ring around the target, a card beside it (a sheet on phones), motion from the tokens ([[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]]), focus moves into the card and back after, Escape skips, the target can still be pressed in the last step ("Try it"). If the target is missing on the page, the stage waits.
- A counts-only funnel on the admin page (shown, finished, skipped per stage per day), like `onboarding_stats`; nothing about who.
- Copy: UK English, plain words, no emoji, no named universities.

## Tasks
- [x] F59.1 Registry, progress in "me", the `user_stages` table and seen route, Settings > Help "Show tips again"; tests (trigger rules, once per account, one a day, unknown id 400, signed out 401, deletion and export).
- [x] F59.2 `StageTour.vue` (lazy) with the ring, card, keyboard and focus rules; the AI Finder stage at 3 connections; tests.
- [x] F59.3 Stages 2 to 6, each with `data-tip` targets; the admin funnel; vault notes ([[Features]], [[Data Model]], [[API Surface]], [[Screens and Routes]]); browser check of every stage at 375 and 1280 px, light, dark and midnight, keyboard only. (Reduced motion could not be emulated: it is the one open acceptance check below.)

## Acceptance checks
- [x] A test account with AI on (stub) and 2 connections sees no AI Finder tour; after a third connection, opening People starts it; finishing it and reloading does not show it again, on another browser either.
- [x] With AI off, the AI Finder and Draft a message stages never show.
- [x] After the first connection, the person's page shows the follow-up reminder tour once.
- [x] Never two tours on one day (test with a fixed clock).
- [x] Escape skips a tour, focus returns to where it was, and the skipped tour does not come back unless "Show tips again" is pressed.
- [x] No tour code loads on public pages (budget unchanged).
- [ ] With reduced motion on, the tour card fades in and out and does not slide (the tokens turn the slide into a fade; the browser pane cannot emulate reduced motion, so this needs one look in a browser with the system setting on).
- [x] `npm test` passes.

## Log
- 2026-11-24 (Claude subagent): F59 needs F24 and F60. Both are built and tested with a stub but unticked (each waits on a real-model check that needs a key production does not have). Built on F24 and F60 as they stand, with the owner's say-so (2026-11-11, the same for every AI item since). No real model was called; `.dev.vars` was not opened.
- F59.1: `migrations/0041_user_stages.sql` (additive: `user_stages` and the counts-only `stage_stats`); `src/lib/stages.js` (the six stages, their trigger rules and `dueStage()`, no imports, so the Worker reads the id list from it); `worker/stages.js` (`GET /api/stages`, `POST /api/stages/:id/seen`, `DELETE /api/stages`, the export, the funnel and the clean-up); `src/lib/stagesState.js`; Settings > Help "Show tips again". Decision made without the owner: progress is **not** in the "me" response or the store. It has its own route, so no public page or the offline copy of "me" carries it, and the shared store did not change. "One a day" is the UTC calendar day, enforced by one conditional insert (two devices asking at once: one wins). Progress is counts plus two yes/no answers (AI on for the AI Finder, AI on for Draft a message) worked out by `aiOnFor()`, the same checks `callModel` makes before it spends anything, and it never calls a model. `test/stages.mjs` (before the budget check); the two lists of migrations pinned in `test/card-colours.mjs` and `test/people-search.mjs` now name 0041.
- F59.2: `src/components/StageTour.vue` (the dim layer with a hole, the ring, the card as a sheet on a phone, Back, Next, Skip, Try it, Got it) and `src/components/StageHost.vue` (decides what is due on the page, waits for the control and for any sheet, open editor or focused field to go, fetches the tour with a plain `import()` and only then records the tip). The host is mounted only by the signed-in frame (`AppShell.vue`), so no public page, the entry file or the router mentions it (guarded in `test/stages.mjs`). The AI Finder tip points at the real row on People (`data-tip="ai-ask"`), three steps, the last with Try it. Motion: the shared keyframes and tokens only (a slide becomes a fade under reduced motion; nothing scales), 220 ms wait before it leaves the page. Walked in the browser pane on a local Worker with a scratch database (no `.dev.vars`), AI in stub mode: with 2 connections no tip, with 3 the tip started by itself on People, Enter went Next, Next, Escape skipped it and `/api/stages` then listed it as seen with the outcome skipped, and the data download listed it; a bug found and fixed on the way (the photo viewer is always in the page and counted as an open dialog).
- F59.3: the other five stages and their `data-tip` marks (Follow up, private note and Draft a message in a connection's panel, which mounts its own host because a person's page `/c/:id` is not in the signed-in frame; Who to meet, the intention field and the Suggest me tick; New card and the first card's Edit; the home-screen panel); the admin "Tips, last 30 days" table (`GET /api/admin/stages`); Privacy Policy sections 2 and 6 (one row each); [[D055 A tip shows once per account, never two on one day, and its progress is counts from its own route]]; [[Features]], [[Data Model]], [[API Surface]], [[Screens and Routes]], [[Privacy and Data Retention]], [[Testing]], [[Codebase Map]]. Public pages after the feature: Landing 44,166 B, PublicCard 47,479 B, Hosts 42,626 B, Privacy 50,134 B (+104, about 1.0 KB left), Terms 46,750 B, Redeem 45,961 B, SignIn 47,094 B, PrivacyRequest 49,811 B (before: 44,172, 47,481, 42,627, 50,030, 46,753, 45,966, 47,094, 49,811). The seen-tips record is new personal data (what, why, how long, in sections 2 and 6); I do not think it is material (nothing new is shared and it goes with the account), so the Terms and Privacy version is **not** bumped. Browser walk (a local Worker and Vite with a scratch database and `AI_STUB`, test accounts made by script, no `.dev.vars`): every stage started by itself on its page; at 1280 px (Dark, Light, Midnight) and 375 px (Light, Dark, Midnight, the phone sheet) the card was always inside the screen and never over the ring, buttons on one row, the control scrolled into view above the sheet; keyboard only (Enter on Next, Tab and Shift+Tab wrapped inside the card, Try it, Escape); focus moved into the card and back to the button it started from; a skipped tip did not return after a reload; with a sheet opened the tip waited and came after it closed; Try it opened the Draft sheet, the card editor and the private note, and only focused the Suggest me tick; the install tip showed on a phone (Midnight, 375 px) and never on a computer; Settings > Help "Show tips again" worked. Bugs found and fixed on the way: the always-present photo viewer counted as an open dialog, the Cards page's open summary counted as an open editor, the last step dropped keyboard focus when Next became Got it, a tip could start on top of a sheet a person had just pressed to open, and Try it on the Suggest me tick would have unticked it. Not checked: reduced motion (cannot be emulated here), a real phone, and a screen reader.
- Owner steps: push; `npm run db:remote` (0041, additive, two new tables, after 0018 to 0040) before `npm run deploy`; look once at a tour with the system's reduced-motion setting on; decide whether the new Privacy Policy lines need the version bump (we think not).

Related: [[F14 Onboarding revamp]] · [[F24 Do I know someone who]] · back to [[00 Master To-Do]]
