---
tags: [decision]
status: Accepted
date: 2026-11-10
---
# D023 Welcome steps keep their place on the server and count only

**Status:** Accepted  ·  **Date:** 2026-11-10

## Context
[[F14 Onboarding revamp]] replaces the one long "Make your card" form with one question a screen. Four things needed deciding: where a person's place is kept, what the funnel may record, how a new route can be added when public pages are over budget ([[F28 Public-page JS budget]]), and what happens to a guest who connected before having a card.

## Decision
- **The place is on the server.** `profiles.onboarding_step` (and `onboarding_max`) say where someone is, so the steps resume on any device and not only in one browser. NULL means "not in the steps": every profile made before migration 0022, and anyone who has finished, so nobody existing is pulled in. The step is also in the address (`?step=3`) so a refresh and the browser Back button stay right; the server follows the address.
- **The funnel is counts, not people.** `onboarding_stats` (day, step, reached, completed) has no id, session or time of day. A step counts when someone first reaches it, so going Back and forward is not counted twice (that is what `onboarding_max` is for), and moving anyone who is not in the steps counts nothing. Step 1 counts people who saved a name; someone who opens the page and leaves is not counted, because counting them would need a visitor counter or a cookie.
- **The welcome page is not an `/app` page.** No tab bar, no account banner and no Terms pop-up sits over the question. Step 1 carries the same 18+ and Terms tick for anyone who has not accepted, and a person who has a card but has not accepted accepts it there through the same call as the pop-up.
- **The route is paid for.** Adding the lazy route grew the entry every page loads by about 70 bytes (gzip). `AccountBanner.vue` is in that entry and imported the email form and the passkey library, which were most of it, so both now load with a plain `import()` when the button is tapped (the same rule as [[D018 Hand-built pickers outside the shared Vue chunk]]). First-load JS of the landing page and the public card went down by about 4.5 KB gzip, so F14 adds nothing to either.
- **Fields are shared, not copied.** `ModeFields`, `TagFields` and `links.js` serve both Edit profile and the steps. Edit profile can only edit now; making a card is the steps' job.
- **A guest who connected first** gets a stub profile that starts at step 1. The connect sheet and the public card are unchanged, so a scanned badge still connects with a name and one tick and `?s=` still survives ([[D022 Record how a connection was made, once and without guessing]]). People asks them by name to finish, and My card carries them on unless they chose Leave in that session.
- **Email at step 5 can be skipped,** except while a promo code is waiting (the email is what lets them claim it). Email is "becoming compulsory" but is not today ([[D003 Guest first with passkeys]]), and the banner still asks, so a hard stop would be a product change for the owner to make.

## Consequences
The steps need migration 0022 before the new code is deployed (it only adds). Old printed links to `/app/profile` still work: with no card they redirect to the steps. The Done screen scrolls on a phone while the install prompt shows. Whether email should become compulsory, and whether to count visitors who never save a name, are open for the owner.

**Evidence:** `migrations/0022_onboarding.sql`, `worker/onboarding.js`, `src/views/Welcome.vue`, `src/components/AccountBanner.vue`, `test/onboarding.mjs`

Related: [[Privacy and Data Retention]], [[Data Model]] · back to [[Decision Log]]
