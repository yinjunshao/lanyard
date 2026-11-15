---
tags: [roadmap, feature, security]
id: F35
priority: P0
phase: 7
size: L
status: In progress
needs: []
---
# F35 Security audit against common attacks

**Priority:** P0 · **Phase:** 7 Owner requests (2026-11-15) · **Size:** L · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-15)
"Can you double check the security of the current website?" The owner listed the attacks to check:

> What if I put a script in my username, changed the number in your URL, just typed /admin, opened DevTools and took your API key, told your AI to ignore its own instructions, made myself an admin when I signed up, changed the price before checkout, sent your app a fake payment succeeded, clicked redeem 100 times at once, ordered -1 items and got a refund, brute forced your 6-digit login code, uploaded a file that isn't a photo, found your .env in your Git history, called your AI endpoint 10,000 times, or just queried your whole database from my browser console.

Also: "the security for each key, such as the admin key and other keys. So if they're accessible via the front end or any commands that the user can execute, any API keys in the browser."

## Current state
[[Security]] lists what is built. Many attacks already have tests (`test/hostsecurity.mjs`, `test/ai-injection.mjs`, `test/drops.mjs`, `test/codes.mjs`). No one has checked the whole list in one place, and `test/baseline-security.txt` is an old "before" snapshot.

There is no card payment yet (hosts pay by invoice, [[D009 Manual invoicing before Stripe]]; Plus is a waitlist and a promo). The payment attacks are checked against what exists (host promo codes, credit grants, invoice requests, the Plus promo) and written as a bar for [[F27 Lanyard Plus and billing]] and [[F36 Payment provider and billing pages]].

## Plan
For each of the 16 attacks below, read the code that handles it, try it against a local Worker (and, where it is safe and read-only, against the live site), and record a verdict: **Safe** (with the test that proves it), **Gap** (with severity and a fix), or **Not built yet** (with the rule the future feature must follow).

| # | Attack | Where to look |
| --- | --- | --- |
| 1 | Script in a name, note, link, event title, drop title, feedback answer or any text field | every `v-html`, `innerHTML`, emails (`mail-templates.js`), CSV exports (formula injection `=`, `+`, `-`, `@`), the PDF/print page, link `href`s (`javascript:`), CSP |
| 2 | Change an id in the URL or request (IDOR) | every route with `:id`, `:code`, `:did`, `:giveId`, media keys, event, card, connection, organisation, drop, feedback, export routes |
| 3 | Type /admin | front-end admin route, `/api/admin/*`, what the page shows signed out, token comparison (constant time), rate limits on wrong tokens |
| 4 | Take an API key from DevTools | everything shipped in `dist/` (search for keys, tokens, `sk-`, `re_`, `whsec_`, `lyk_`, `ADMIN`, `DROP_KEY`), source maps, `/api/*` responses, `wrangler.production.toml` vars, error pages |
| 5 | Tell the AI to ignore its instructions | `worker/ai/*`, `test/ai-injection.mjs`; AI is off in production |
| 6 | Make myself admin at sign-up | sign-up and profile update handlers (mass assignment: `plan`, `plan_until`, `role`, `is_admin`, `org_id`, `credits`, `status`), host onboarding, organisation approval |
| 7 | Change the price before checkout | invoice and credit-pack requests (`HOST_SKUS`), promo, Plus waitlist: does any price, amount or quantity come from the browser? |
| 8 | Send a fake "payment succeeded" | any webhook in (none expected yet); admin grant routes; the rule for F36 |
| 9 | Click redeem 100 times at once | host promo codes, Plus promo (FIRST50), drops, vouchers, card code claims, invite codes: one conditional write each, proven concurrently |
| 10 | Order -1 items for a refund | every number from the browser: quantities, credit counts, capacity, rating, limits; zero, negative, fractions, huge numbers, strings, `NaN` |
| 11 | Brute force a 6-digit login code | attendee email codes, host email codes, TOTP, voucher PINs, card codes: attempts per code, per email and per IP, expiry, single use |
| 12 | Upload a file that is not a photo | `worker/media.js`, `selfie.js`, sponsor logos: magic-byte checks, size limits, content type on the way out, SVG refused, `Content-Disposition`, `nosniff` |
| 13 | Find the .env in Git history | `git log --all -p` for secret files and key-shaped strings (every branch, including `backup/*`), `.gitignore`; GitHub is public or private? |
| 14 | Call the AI endpoint 10,000 times | AI quotas and budgets, plus every other expensive or email-sending route (sign-in codes, invites, exports, uploads): rate limits per person and per IP |
| 15 | Query the whole database from the browser console | no D1 binding or SQL reachable from the browser; list endpoints paginate and return only the caller's rows; search endpoints cannot enumerate people; no `select *` leaks of hidden columns (email, hashes) |
| 16 | Secret handling in general | ADMIN_TOKEN, DROP_KEY, TOTP_KEY, RESEND keys, CLAUDE_API_KEY: only Worker secrets, never in vars, logs, responses, exports or the repo; how each can be rotated |

## Tasks
- [x] F35.1 Audit: write `Lanyard-Vault/03 Technical/Security Audit 2026-11-15.md` with a row per attack (verdict, evidence as file:line and test name, severity, fix), and the live read-only checks run. Add a task below for each Gap.
  - [[Security Audit 2026-11-15]]. Gaps found: 2 High, 4 Medium, a few Low (below). Each was first shown failing against the Worker with requests sent at once (a test-only wrapper gives every query one turn of the event loop, as real D1 does).
- F35.2 onwards: one task per Gap (or a few small related ones), each with a test that fails before the fix and passes after.
- [x] F35.2 (High, rows 9 and 10) Event credits: Create and Duplicate pressed at once spend one credit for many events, and a society's free weekly event can be taken many times. Make the event insert and the credit spend one conditional write.
  - `insertEvent` (`worker/hosts.js`): one batch; the event is `INSERT ... SELECT ... WHERE` the free week is still free (another event of the organisation in the last 7 days, not this one) or a credit has room; the credit `UPDATE` runs only if that event exists and was not the free one; no row means 402 `no_credits` with the same words as before. Test: `test/security-audit.mjs` "Row 9/10" (20 Create presses with 1 credit left make 1; 10 Duplicates with none make none; 10 presses with 2 credits make 2; a society's 10 presses make 1 free event, then 6 presses with 1 credit make 1 more). Before the fix the same test made 20 events for 1 credit and 10 free society events.
- [x] F35.3 (High, row 11) Code guesses sent together all get through: attendee email codes (5 tries) and the authenticator (10 tries per account), and the shared wrong-guess throttle (link codes, recovery keys, card codes). Take the try before comparing.
  - `worker/codes.js`: `isThrottled` and `recordMiss` (check, then count) are replaced by `takeTry` (one atomic write per counter that returns the new count, before the guess is checked) and `giveBack` (a right guess hands its place back, so only wrong guesses count, as before). Used by email sign-in and add-an-email (`email-auth.js`), the host code (`host-auth.js`), the authenticator (`totp.js`), link codes and recovery keys (`auth.js`) and card code lookups (`index.js`). An email code's and a host code's try is one conditional `UPDATE ... attempts < 5 RETURNING code_hash` before the compare; the code is then used only if its hash is still the same row. Also: signed-out card code lookups shared one "nobody" counter, so ten wrong guesses by anyone locked every signed-out visitor out for ten minutes; signed out, the IP is now the only counter. Test: `test/security-audit.mjs` "Row 11". With the fix reverted, the first check fails (29 wrong email codes and the right one at once signed in) and the file stops.
- [x] F35.4 (Medium, row 15) Event join codes have no wrong-guess limit (`GET /api/e/:code`, check-in). Limit wrong event codes per IP.
  - `eventByCode` in `worker/events.js`, used by both routes: each lookup takes a place on `code:ev:<IP>` first (atomic `bump`), a real code hands it back, and over 30 wrong codes in 10 minutes the IP gets 429 `throttled` ("Too many wrong event codes. Wait a few minutes and try again."), even for a real code, until the window passes. A venue on one connection opening the right code is never counted. Test: "Row 15" (30 wrong then 429 for a real code and for check-in, 40 at once at most 30 looked up, 40 right lookups from one IP all answered, another IP unaffected); with the fix reverted 3 checks fail.
- [x] F35.5 (Medium, row 9) The Free card limit and team invite codes are checked before the write (10 cards at once gave 11; 6 people joined on one invite). One conditional write each; prove the Plus poster code at once too.
  - `POST /api/cards` (`worker/index.js`): the card is `INSERT ... SELECT ... WHERE` the account still has fewer cards than its plan allows, and its code row is written only if the card exists; no row is the same 402 `plan_limit` as before. `POST /api/host/team/join` (`worker/hosts.js`): the seat is `INSERT ... WHERE` the invite still exists and has not expired, and the invite and the joiner's empty organisation are deleted only if that seat was taken; a loser gets the usual 404 and keeps their own organisation. Test: "Row 9" (10 cards at once leave 3, no stray code row, each card's code works; 6 joins at once seat 1; 60 people at once on FIRST50 give exactly 50 Plus and 60 distinct places; 5 presses by one person give one claim). With the fix reverted 4 checks fail (11 cards; 6 seated).
- [x] F35.6 (Medium, row 14) Email floods: team invites (invite, cancel, invite again), transfer emails, privacy-request acknowledgements to one address. Limits per sender and per address.
  - `worker/hosts.js`: an invite with an email counts 10 a day per organisation and 3 a day per address; a hand-over request counts 5 a day per organisation and 3 a day per receiving account; over either is 429 `throttled` ("That's a lot of emails for one day. Try again tomorrow.") and nothing is saved or sent. An invite without an email is not counted. `worker/privacy.js`: a privacy request is always recorded, but one address gets at most 3 acknowledgement emails a day (the rest answer `acknowledged: false`, which the page already words as "We couldn't send the acknowledgement email, but your request is logged"). Test: "Row 14"; with the fix reverted 5 checks fail (25 invite emails to one address, 9 transfer emails, 10 acknowledgements).
- [x] F35.7 (Low, rows 1, 10, 12, 16) Numbers refused with 400 (invoice quantity, RSVP count, rating); card theme checked on edit; profile photo changes limited; unsubscribe signature compared in constant time.
  - Invoice request quantity (`hosts.js`): a whole number 1 to 20 or left out (1), else 400 `bad_quantity` and nothing saved; the amount is always the server's price. RSVP count on create and edit: empty clears it, else a whole number 0 to 100,000, else 400 `bad_rsvp` (a bad count on Create uses no credit). Feedback rating (`feedback.js`): a whole number 1 to 5, else 400 `bad_rating` and nothing stored (before, a bad value was dropped and the rest saved). Strings such as `"2"` are refused too; the pages already send numbers. `PUT /api/cards/:id` takes only the four themes (400 otherwise). Profile photos (`index.js`): 20 new photos an hour per account, then 429. Unsubscribe links (`unsub.js`): the signature is compared over every character. Test: "Row 10" and "Rows 1, 12 and 16"; with the fix reverted 12 checks fail (the constant-time compare is caught by a source guard, since its timing cannot be seen in a test).
- [x] F35.8 Proofs for the rows that were already safe (IDOR, admin, sign-up fields, price, uploads, secrets in source and config).
  - `test/security-audit.mjs`, sections marked F35.8: row 2 (11 attendee and 11 host `:id` routes: another account's real id gives the same 404 and body as a made-up one, and the rows are byte for byte unchanged; checked to bite by loosening one `WHERE`), row 3 (no token, a token in a cookie or query, 10 wrong then 429 with the right token, another IP works, host site `wrong_site`, audit row, source guard on the hashed XOR compare, `/admin` is only the shell), row 6 (sign-up and edits with `plan`, `is_admin`, `email_verified`, `user_id`, `credits` and more change nothing; a society that says it is approved is pending with no credits), row 7 (in "Row 10": the stored amount is the server's price whatever the browser sends), row 8 (the RSVP API needs a real key; no payment webhook route), row 12 (SVG, SVG or HTML or JPEG claiming PNG, GIF, text/html, not base64, a link: all 400; oversize 413; served headers; traversal and other extensions refused), row 1 (markup kept as text, `javascript:` and `data:` links dropped, `v-html` only on the four icon uses, a `=HYPERLINK` event name neutralised in the CSV, an organisation name escaped in email HTML), rows 4 and 16 (no secret name or key-shaped string in `src/`, none in either `[vars]`, `.dev.vars` and `.env` ignored, the built `dist/` clean with no source maps, the admin AI page holds no key, and none of the ~940 responses in the file holds any of the six secrets).
- [ ] F35.last Update [[Security]] (replace the TODO with the current result), [[Testing]], and add the payment bar to [[F27 Lanyard Plus and billing]].

## The payment bar (for F27 and F36, whatever provider)
- The price, currency, product and quantity come only from the server's own table; the browser sends a product id at most.
- An order is paid only when a webhook with a verified signature (constant-time compare, timestamp tolerance) says so, or the provider's API confirms it; a redirect back to our site proves nothing.
- Each provider event id is stored once (unique), so a replay does nothing; granting credits or Plus is one conditional write.
- Refunds only from the provider's dashboard or a webhook, never from a quantity or amount the browser sends.
- Limited promo codes: one conditional write per claim with a unique constraint, proven under concurrent requests.

## Acceptance checks
- [ ] Every one of the 16 attacks has a verdict with evidence in the audit note.
- [ ] Every Gap rated High or Medium is fixed with a test, or listed as an owner decision with the reason it was not fixed.
- [ ] `dist/` and every `/api` response searched for secret-shaped strings: none.
- [ ] Git history (all branches) searched for secret files and key-shaped strings: none, or the owner is told exactly which key to rotate.

## Log
-

Related: [[Security]], [[Auth and Sessions]], [[Testing]], [[F27 Lanyard Plus and billing]] · back to [[00 Master To-Do]]
