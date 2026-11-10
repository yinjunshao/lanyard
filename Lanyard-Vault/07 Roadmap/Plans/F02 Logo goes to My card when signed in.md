---
tags: [roadmap, feature, ui]
id: F02
priority: P0
phase: 0
size: S
status: In progress
needs: []
---
# F02 Logo goes to My card when signed in

**Priority:** P0 · **Phase:** 0 Quick fixes · **Size:** S · **Needs:** nothing · back to [[00 Master To-Do]]

## What the owner asked for
On any page outside `/app`, a signed-in person who taps the top-left `lanyard.` logo goes to `/app` (My card), not the landing page. The landing page is only for people who are not signed in.

> [!note] An earlier session made this change in a stale copy, not in this repo. Nothing from it is in the project. Build it here from scratch.

## Current state
Every wordmark is a hard-coded `<router-link to="/">`:
`src/App.vue` (app top bar), `PublicCard.vue`, `Privacy.vue`, `Terms.vue`, `PrivacyRequest.vue`, `Redeem.vue`, `SignIn.vue`, `Hosts.vue`. `Claim.vue` already links to `/app`. `Landing.vue` shows a plain span.

## Plan
- "Signed in" means `me.profile` exists (they have a card) **or** `me.user?.claimed` (saved account). A brand-new browser with no session is not signed in.
- Add `homePath()` to `src/lib/store.js`: returns `"/app"` when signed in, `"/"` otherwise. On the host site (`ON_HOST_SITE`) it returns the host home (see [[F10 Separate host accounts on host subdomain]]).
- Replace every `to="/"` on a wordmark with `:to="homePath()"`. Leave footer "Home" text links alone.
- Visiting `/` while signed in redirects to `/app`. So the landing page stays fast for new visitors, don't block it on `/api/me`:
  - after `/api/me` returns a profile, set `localStorage["lanyard-signed-in"] = "1"`; clear it on logout and account deletion
  - router `beforeEach`: if path is `/` and the hint is set, redirect to `/app` straight away (the `/app` guard already waits for `/api/me` and handles a stale hint)
  - landing keeps a way to be viewed while signed in: `/?about=1` skips the redirect. Link to it from Settings → Help ("About Lanyard").

## Tasks
- [x] F02.1 `homePath()` plus the signed-in hint (set, clear on logout/delete, wrapped in try/catch).
- [x] F02.2 Swap the wordmark links in all files listed above.
- [x] F02.3 Redirect `/` to `/app` when signed in, with the `?about=1` escape.
- [x] F02.4 Test: add cases to `test/vuecheck.mjs` or a small router test; check manually signed in, signed out, and after logout.

## Acceptance checks
- [x] Signed in: the logo on Privacy, Terms, a public card, Redeem and Hosts opens `/app`.
- [x] Signed out: the logo opens `/`, and `/` shows the landing page with no extra network wait.
- [x] After logging out, `/` shows the landing page (the hint was cleared).
- [ ] Public-page JS stays under the 50 KB budget.

> [!question] The 50 KB public-page budget was already exceeded before F02 (landing 64.0 KB gzip, public card 58.0 KB, by the measure in the Log). Is that the right way to measure it, and should a separate task bring the pages back under budget? Until answered, F02 stays In progress and the last acceptance check stays unticked.

## Log
- 2026-11-10: The `lanyard.` logo now uses `homePath()` (`src/lib/store.js`) on the app bar, public card, Privacy, Terms, Privacy request, Redeem, Sign in and Hosts. `/` goes to `/app` when the `lanyard-signed-in` hint is set (set by `refreshMe`, cleared by `Api.logout` and `Api.deleteAccount`; code in `src/lib/signedin.js`). `/?about=1` shows the landing page; Settings has an "About Lanyard" link. Test: `test/homepath.mjs` (in `npm test`). Checked by hand on local dev (signed out, signed in, after Log out).
- Public-page size is NOT ticked. Gzip of the JS a page loads (entry, Vue runtime, shared chunks, the page's own chunk), measured from `dist/` after `npm run build`: landing 64.0 KB before, 64.1 KB after; public card 58.0 KB before, 58.2 KB after. The change adds about 0.1-0.2 KB, but both pages were already over 50 KB before this feature (the landing page loads the QR chunk, 11.6 KB gzip). That is a separate problem for the owner.
- Behaviour to know: a stale hint (signed out on another device) sends `/` to `/app`, which shows "Set up your card" once and clears the hint. The first visit after signing in on a new browser still shows the landing page, because the hint is only set once `/api/me` has answered.
- Owner steps: review and `git push`, then `npm run deploy` (no migrations).

Related: [[Screens and Routes]] · back to [[00 Master To-Do]]
