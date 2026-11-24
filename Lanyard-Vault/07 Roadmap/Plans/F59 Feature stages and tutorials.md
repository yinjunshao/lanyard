---
tags: [roadmap, feature, onboarding, ui]
id: F59
priority: P1
phase: 10
size: L
status: Not started
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
- [ ] F59.1 Registry, progress in "me", the `user_stages` table and seen route, Settings > Help "Show tips again"; tests (trigger rules, once per account, one a day, unknown id 400, signed out 401, deletion and export).
- [ ] F59.2 `StageTour.vue` (lazy) with the ring, card, keyboard and focus rules; the AI Finder stage at 3 connections; tests.
- [ ] F59.3 Stages 2 to 6, each with `data-tip` targets; the admin funnel; vault notes ([[Features]], [[Data Model]], [[API Surface]], [[Screens and Routes]]); browser check of every stage at 375 and 1280 px, light, dark and midnight, keyboard only and with reduced motion.

## Acceptance checks
- [ ] A test account with AI on (stub) and 2 connections sees no AI Finder tour; after a third connection, opening People starts it; finishing it and reloading does not show it again, on another browser either.
- [ ] With AI off, the AI Finder and Draft a message stages never show.
- [ ] After the first connection, the person's page shows the follow-up reminder tour once.
- [ ] Never two tours on one day (test with a fixed clock).
- [ ] Escape skips a tour, focus returns to where it was, and the skipped tour does not come back unless "Show tips again" is pressed.
- [ ] No tour code loads on public pages (budget unchanged).
- [ ] `npm test` passes.

## Log
-

Related: [[F14 Onboarding revamp]] · [[F24 Do I know someone who]] · back to [[00 Master To-Do]]
