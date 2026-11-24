---
tags: [decision, onboarding, privacy]
status: Accepted
date: 2026-11-24
---
# D055 A tip shows once per account, never two on one day, and its progress is counts from its own route

**Status:** Accepted  ·  **Date:** 2026-11-24  ·  Part of [[F59 Feature stages and tutorials]]

## Context
The owner asked for "stages": short tutorials that introduce a feature when it becomes useful, starting with the AI Finder after the third connection ([[F59 Feature stages and tutorials]]). They must teach without nagging, and the public pages are at their JavaScript budget ([[D024 Signed-in frame and heavy pieces load only where used]] and the F28 budget).

## Decision
- **Once per account, on any device.** A tip is recorded in `user_stages` when it starts, so another browser, a reload or a skip never shows it again. Only "Show tips again" in Settings > Help (this account's rows only) brings them back.
- **At most one a day, enforced by the Worker.** `POST /api/stages/:id/seen` is one conditional insert that succeeds only when no tip was started today (UTC calendar day, the day the quotas and daily counts use); two devices asking at once cannot both win. The client also reads `shownToday`, but the rule does not depend on it.
- **Only known ids, only for people who are ready.** The id list is read from the registry (`src/lib/stages.js`); anything else is 400. Signed out is 401 (no guest is made); someone with no card, still in the welcome steps or who has not agreed to the current Terms gets no counts and cannot record a tip (403).
- **Progress is its own route, not the "me" response.** `GET /api/stages` returns counts about the person themselves (connections, events, cards) and two yes/no answers (AI on for them for the AI Finder, and for Draft a message). It has no names or ids of other people. This departs from the plan's wording ("in the existing me response") on purpose: public pages import the store that the "me" response fills and the offline copy of "me" would keep stale counts; a separate route changed neither and public page sizes did not move.
- **"AI is on for this person" without calling it.** `aiOnFor()` makes the checks `callModel` makes before it spends anything (switched on and set up, not killed, an eligible account, the rollout, a limit for that feature at their tier) and never calls a model. The AI Finder and Draft a message tips never show when it is off.
- **The tour is a lazy chunk, mounted from signed-in code only.** `StageHost.vue` (small) is mounted by the signed-in frame and by a connected person's panel; it decides what is due, waits for the first control to be on the page and still, for any sheet, dialog, open editor or focused field to be gone and for the person to stop pressing, typing and scrolling for 1.5 s, fetches `StageTour.vue` with a plain `import()` (never `defineAsyncComponent`), and only then records the tip. A tip whose control is missing (the home-screen panel on a computer) simply waits and is never recorded. A guard in `test/stages.mjs` fails if any public page, the entry or the router mentions tips.
- **Keyboard, focus, motion.** Focus moves into the card and goes back to where it was; Escape skips; Tab stays in the card; Try it presses a button or link but only focuses a field or tick, so it can never change a choice; motion is the shared keyframes and tokens only (a slide is a fade under reduced motion), 220 ms before it leaves the page.
- **Counts only.** `stage_stats` holds shown, finished and skipped per day and tip, with no column that could say who; the admin page shows them; rows older than 400 days go with the daily clean-up.
- **Privacy.** The seen record is small personal data: in the data download as `stageTips`, deleted with the account (cascade), in the Privacy Policy sections 2 and 6. Not judged material: nothing new is shared, the purpose is the service the person asked for and it goes with the account, so the Terms and Privacy version is not bumped (the owner may disagree).

## Consequences
A person sees at most one tip a day, so the six take at least six days of use. A tip that is started and left (the person walked away) counts as shown and is not repeated. Two browser tabs open at once: the one that gets there first shows it. If a stage's control moves, its `data-tip` must move with it (a test checks every step names a real one).

**Evidence:** `migrations/0041_user_stages.sql`, `src/lib/stages.js`, `src/lib/stagesState.js`, `src/components/StageHost.vue`, `src/components/StageTour.vue`, `worker/stages.js`, `test/stages.mjs`

Related: [[F24 Do I know someone who]], [[F60 Intention at check-in and who to meet for everyone]], [[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]] · back to [[Decision Log]]
