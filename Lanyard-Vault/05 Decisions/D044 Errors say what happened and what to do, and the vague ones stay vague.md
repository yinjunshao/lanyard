---
tags: [decision, design, security]
status: Accepted
date: 2026-11-17
---
# D044 Errors say what happened and what to do, and the vague ones stay vague

**Status:** Accepted  ·  **Date:** 2026-11-17

## Context
[[F39 Informative error messages]]: a person should always read what happened and what to do next, in plain words, and never a code, a status number, a stack or a library's English. Some refusals must say as little as they do now ([[D031 Host promo codes are one table, one claim per organisation and one generic refusal]], [[D040 Limits and claims are enforced in the write itself, and a guess is counted before it is checked]], the sign-in code and event-code rules). Public pages are held to 51,200 B of first-load JavaScript ([[D024 Signed-in frame and heavy pieces load only where used]]).

## Decision
- **The Worker writes the final words.** The `error` text of every response is what the person reads; the front end shows it as it is. It starts with a capital, ends as a sentence, has no exclamation mark, no status number and no raw code, does not blame, and says the next step where there is one ("Reload the page and try again.", "Ask them to do it.", "Wait a few minutes and try again."). The `code` is for the front end and tests and is never changed.
- **Vague stays vague, with one wording.** Sign-in and email codes, host promo and FIRST50 refusals, drop and voucher refusals, card code lookups, event codes, a card shared by link, the named-list handle and the admin token give the same words for every cause they hide. You may improve the "what to do" part of one of these; you may not add information. `test/errors.mjs` checks the shared constants and the repeated sentences.
- **The browser adds only what the Worker cannot know**, in `src/lib/errors.js`, which `api()` calls through `api.fix`: no signal ("No connection. Check your signal and try again."), a request that hangs for 90 seconds, a 401 (a Sign in link, once, on signed-in and host pages), a 429 with the server's wait when it sends `retryAfter` or `Retry-After`, an answer with no words (an edge or proxy page: "Something went wrong on our side. Try again in a minute."), and a labelled 5xx keeps the server's words. `explain(e, fallback)` swaps a library's English for a fallback.
- **Public pages stay small.** `api()` itself holds only the "No connection" sentence and a short fallback; `errors.js` is loaded by the signed-in frame, the host and admin pages and never by a public page (guarded in `test/errors.mjs`). Calls used by one signed-in page live in that page, not in the shared `Api` object, which every public page loads.

## Consequences
- A new route writes its words in the Worker, plain, with the next step; `test/errors.mjs` scans every `error:` and `new HttpError(...)` outside `worker/ai` and `leaveEvent.js` and fails on a lower-case, status-number, snake_case or exclamation-mark message.
- A front-end check that matches the server's English (the create-event form's `serverErrorField`) must be changed with the words.
- The Worker sends no wait time yet (windows are fixed text such as "a few minutes"); the helper uses one when a response has it.
- The AI routes' words (owner's files) are not covered and should follow this when next touched.

**Evidence:** `src/lib/api.js`, `src/lib/errors.js`, `worker/*.js`, `test/errors.mjs`

Related: [[Design System]], [[D043 Waiting states are CSS on public pages and one component elsewhere]] · back to [[Decision Log]]
