---
tags: [roadmap, feature, design]
id: F39
priority: P2
phase: 7
size: M
status: Not started
needs: [F38]
---
# F39 Informative error messages

**Priority:** P2 · **Phase:** 7 Owner requests (2026-11-15) · **Size:** M · **Needs:** [[F38 Loading states]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-15)
"Real informative error messages."

## Plan
1. List every error the API sends (`{ error, code }`) and every place the front end shows one, including generic fallbacks such as "Something went wrong".
2. Each message says what happened and what to do next, in plain words: "No internet connection. Check your signal and try again." or "That code has expired. We've sent you a new one." Keep the messages that must stay vague for security (sign-in codes, account existence, promo refusals, [[D031 Host promo codes are one table, one claim per organisation and one generic refusal]]); never reveal whether an account exists.
3. Tell network failures, timeouts, rate limits (with the wait time when the server gives one), sign-out (with a Sign in link), not found and server errors apart in the shared API helper, without making public pages heavier.
4. Errors next to the field they belong to on forms; a page-level error with Try again when a page cannot load.
5. A test that every `code` the Worker sends has a matching front-end message, and no message shows a raw code, stack trace or HTTP status to the user.

## Acceptance checks
- [ ] Every error code has a plain message saying what to do next (test).
- [ ] Offline, timeout, rate limit, signed out, not found and server error each show a different message (checked in a browser).
- [ ] Security-vague messages are unchanged (existing tests still pass).
- [ ] No public page gets heavier than its budget.

## Log
-

Related: [[Design System]], [[F38 Loading states]] · back to [[00 Master To-Do]]
