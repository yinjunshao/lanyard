---
tags: [roadmap, feature, ui]
id: F02
priority: P0
phase: 0
size: S
status: Not started
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
- [ ] F02.1 `homePath()` plus the signed-in hint (set, clear on logout/delete, wrapped in try/catch).
- [ ] F02.2 Swap the wordmark links in all files listed above.
- [ ] F02.3 Redirect `/` to `/app` when signed in, with the `?about=1` escape.
- [ ] F02.4 Test: add cases to `test/vuecheck.mjs` or a small router test; check manually signed in, signed out, and after logout.

## Acceptance checks
- [ ] Signed in: the logo on Privacy, Terms, a public card, Redeem and Hosts opens `/app`.
- [ ] Signed out: the logo opens `/`, and `/` shows the landing page with no extra network wait.
- [ ] After logging out, `/` shows the landing page (the hint was cleared).
- [ ] Public-page JS stays under the 50 KB budget.

## Log
-

Related: [[Screens and Routes]] · back to [[00 Master To-Do]]
