---
tags: [decision]
status: Accepted
date: 2026-11-13
---
# D037 Create event in steps keeps the old request and one draft per host and organisation

**Status:** Accepted  ·  **Date:** 2026-11-13

## Context
[[F30 Create event in steps]] turns the host's one long Create event form into a stepper. The owner wanted stages, not new behaviour: what an event is made of, and what the server checks, must not change. Public pages have almost no JS headroom ([[D024 Signed-in frame and heavy pieces load only where used]]; the card page has under 200 B), so the stepper must not touch shared code or add a chunk name to the entry.

## Decision
- **Five steps:** Basics (name, start, end, venue, "Start from"), Look (theme, brand colour), At the event (perks, access, food, sign-ups, attendee room; [[F31 Named attendance with check-in notice]] adds its section here), Questions (check-in questions, feedback form), Review (every choice, Change links, the cost, Create). The order goes from what the host knows first (what and when) to what they can leave alone (questions).
- **The request is unchanged.** `submitPlan` in `src/lib/eventsteps.js` returns what the old form's Create sent: a copy sends `{ name, startsAt, endsAt }` to the duplicate route, a new event sends `createBody(form)`. `test/steps.mjs` builds the old choice word for word and compares the body, then creates events both ways against the real Worker and compares the stored rows and what the host and attendee routes read back.
- **The server stays the source of truth.** Checks per step (a name, an end after the start, sign-ups a whole number, at most ten perks, feedback questions with text and two options) only stop the host a step early; each mirrors something the server refuses or silently drops. A server refusal about the name or the end time returns the host to that step with the message at the field; any other refusal (no credits, network) stays on Review beside Create.
- **The step is in the address** (`/?step=N` on the existing dashboard route), so no route, no new name in either router, and the browser's Back button moves between steps. Next and Back push entries; Cancel and Create replace. A later step reached without the earlier ones goes to the first step with a problem.
- **The draft is in session storage**, in the one tab, under a key made from the host's email and organisation. Every read and write is inside try/catch and the form works with storage off. Reading it removes any other host's or organisation's draft; Create, Cancel and host sign-out (`hostSignOutAndReload` in `hostapi.js`, host pages only, so `store.js` is untouched) clear it. Nothing is stored on the server before Create.
- **A copy shows what it brings, read-only.** Steps 2 to 4 and Review show the earlier event's theme, colour, perks, notes, questions, feedback and sponsors, read through the host's own `/api/host/events/:id/live`. They are not editable because Create does not send them: the server copies the earlier event. The preview now shows for a copy too.
- **Sponsors:** the old form had no sponsor field (only a copy brings them), so none was added; a copy shows them on the Questions step.
- **No new chunk.** The step components are imported by `HostDashboard.vue` and ride in its chunk; `EventPreview` was already a shared lazy chunk.

## Consequences
A host who wants to change a copy's perks must do it under Details afterwards, as before. A draft is lost when the tab is closed (session storage), on purpose. F31 adds fields to the same form object, so they join the draft once it adds them to `blankForm`, `createBody` and `reviewGroups`.

**Evidence:** `src/lib/eventsteps.js`, `src/lib/eventdraft.js`, `src/components/EventCreate.vue`, `EventStep*.vue`, `src/views/HostDashboard.vue`, `test/steps.mjs`

Related: [[D029 A preview is the real component fed from the same data]], [[D030 Present and the poster share one route, one address and one QR path]], [[F30 Create event in steps]] · back to [[Decision Log]]
