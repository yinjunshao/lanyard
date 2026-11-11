---
tags: [decision]
status: Accepted
date: 2026-11-11
---
# D035 AI who to meet only re-orders the list F17 already offers

**Status:** Accepted  ·  **Date:** 2026-11-11

## Context
[[F25 AI who-to-meet ranking]] lets a model rank people at an event. Unlike [[D034 People search offers only what a card shows and trusts only quotes it can find]], these people are not connections: they are strangers who each chose "Be easy to find" for one event ([[D027 Event presence is opt-in, private and deleted 48 hours after the event]]). So the privacy bar is stricter. Built on the AI foundation ([[D028 AI goes through one Worker-side foundation that fails closed]]) and on F24's checks as they stand, before their real-key checks, with the owner's say-so of 2026-11-11.

## Decision
- **The pool is F17's, gathered in code on every request.** `presenceCandidates()`: same event, on for both, both checked in, both with presence on, no block either way. The route never adds anyone; the answer is rebuilt from the rows gathered on that request (never from ids the model or the cache held), so it can only name current candidates.
- **The model sees only what F17's own reason reads** (`visibleFields`): role and employer or course, university, the default card's headline and tags, and the line the person wrote for the event. Not a name, photo, selfie key, email, link, card or user id, **not what they are looking for** (F17 does not show another person's wish, so it is not sent although the plan's rules list it), not a field the profile keeps but hides, and nothing from another event. Opaque ids `p1...pN`; at most 100, chosen by the wish's words then recency.
- **The wish is read from the database**, the one the viewer saved with "Find people", never from the request, and is cleaned like any untrusted text. It is data, not instructions.
- **People who switched AI search off are not sent, and are kept.** They stay in the list in F17's own order after the AI's picks. Dropping them would hide someone who chose to be easy to find at this event for a reason unrelated to this feature; keeping them leaks nothing, because they are already in the usual list.
- **Replies are proved the way F24's are**: an offered id, a quote really in that person's record, a reason that names nothing outside the record (else the quote). F24's `scrub`, `narrow` and `verifyMatches` take the field list as a parameter for this. A reply that picked people but none provable is thrown away and F17's list stays. A line that reads like an instruction is left out of its record (`looksLikeInstruction`).
- **The cache is keyed on the viewer, event, wish, people and everything sent about them** (10 minutes), so any change is a new request. Withdrawing or turning off presence, blocking, opting out and erasing an account delete the kept replies at once (`forgetSearchReplies` now covers both features and is called from `removePresence`, which the 48-hour purge uses). A request outside the live window is refused before the cache is read.
- **Fallback is F17's list**, which the page already shows. Kill switch, quotas (3 per event on Free, 10 on Plus), a bad reply or a failing gateway give a plain message and no error. A cache hit costs nothing.
- **Nothing is stored and there is no migration.** Hosts see nothing new.

## Consequences
A model can still order people badly or praise someone in plain words in a reason; the viewer reads the reason and the usual list is one press away. A person with only a plain, believable claim ("Fintech expert") is ranked on it like anyone. The Privacy Policy section 8b gets one sentence saying the line and card fields can go to the AI provider when someone at the event presses the button; the Terms and Privacy version was not bumped (owner's call).

**Evidence:** `worker/ai/whoToMeet.js`, `worker/ai/prompts/whoToMeet.js`, `src/components/EventPresence.vue`, `test/who-to-meet.mjs`, `test/ai-injection.mjs`

Related: [[D034 People search offers only what a card shows and trusts only quotes it can find]], [[AI Safety and Cost Plan]] · back to [[Decision Log]]
