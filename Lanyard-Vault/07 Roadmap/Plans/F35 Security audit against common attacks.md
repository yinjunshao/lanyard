---
tags: [roadmap, feature, security]
id: F35
priority: P0
phase: 7
size: L
status: Not started
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
- [ ] F35.1 Audit: write `Lanyard-Vault/03 Technical/Security Audit 2026-11-15.md` with a row per attack (verdict, evidence as file:line and test name, severity, fix), and the live read-only checks run. Add a task below for each Gap.
- [ ] F35.2 onwards: one task per Gap (or a few small related ones), each with a test that fails before the fix and passes after.
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
