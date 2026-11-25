---
tags: [roadmap, feature, admin, growth, privacy, auth]
id: F74
priority: P1
phase: 13
size: L
status: Not started
needs: [F70]
---
# F74 Admin-made profiles with a claim link

**Priority:** P1 · **Phase:** 13 Owner requests (2026-11-25, second batch) · **Size:** L · **Needs:** [[F70 Platform metrics with daily snapshots and CSV export]] (only so the two Admin changes do not collide) · back to [[00 Master To-Do]]

> [!note] Owner decision 2026-11-25: a profile made by the admin is **private until claimed**. Only someone with the claim link sees it. It is not a public card and is not in search, People or Who to meet. If nobody claims it within 30 days it is deleted. The person claims it by confirming their email with a code.

## What the owner asked for (2026-11-25)
> "We need to start making an option or like a function where in the admin panel, there's a whole different section or page where I can create a profile for someone and I can copy the link. This allows me to advertise the platform to people saying like, oh, I filled out a profile for you and click this link to claim it, where they will enter their email to claim it, and that's all set up."

Asked what people can see before it is claimed, the owner chose **"Private until claimed"**.

## Current state
- `/admin` (`src/views/Admin.vue`) is one long page of sections, behind the Bearer admin token (`worker/admin.js` middleware: try limit, `admin_audit`). F70 added `src/components/AdminMetrics.vue`, imported only by Admin.
- Accounts: `users` (guest by default, `is_guest`), `profiles`, `cards`. A card is public at `/c/<cardId>` (`worker/index.js` `GET /api/c/:cardId`, about line 722).
- Email codes: `worker/email-auth.js` `issue` / `checkCode` (`email_codes`, by purpose). Email sign-in is `POST /api/auth/email/start` and `/verify` (about line 431).
- Terms and the 18+ confirmation are recorded at sign-up (`consents`, `consent_log`, `worker/legal.js` `TERMS_VERSION` "2026-11-22").
- Erasure is `eraseUser` (`worker/purge.js`). The daily purge is `purgeExpired`.

## Plan
**Admin page.** A separate page, `/admin/profiles`, linked from `/admin` ("Profiles for people"), using the same token (kept in the same place Admin keeps it now). It is a lazy route that no public page imports. The page has:
- **Make a profile:** a form with the card fields (name, mode, university or company, course or role, headline, links, tags, photo upload through the existing media path). It also asks **where the details came from** (required, short text, for example "LinkedIn"), which is kept for the claim page. On save it shows the claim link with a Copy button.
- **Waiting to be claimed:** a list with name, made on, expires on, a Copy link button (which issues a new link and stops the old one), Edit and Delete.
- **Claimed:** count only, plus who claimed it as the account ID, for support.

**Data** (migration, additive):
- `users.admin_made INTEGER NOT NULL DEFAULT 0`.
- `claim_links (user_id PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, source TEXT NOT NULL, created_at, expires_at)`. The token is 32 bytes random, base64url, stored only as SHA-256. The link is `/claim/p/<token>`.
- An admin-made account is a guest with a profile and one card, no session and no email.

**Private until claimed** (each line is tested):
- `GET /api/c/:cardId` for an unclaimed admin-made card returns the same 404 as a missing card, to everyone.
- It never appears in people search, People, Who to meet, event lists or the metrics' counts of real people. Exclude `admin_made = 1 AND is_guest = 1` from `users_total` and give it its own metric `premade_waiting`; record this as a METRICS_VERSION bump to 2.
- It cannot check in, connect or be connected.
- It is erased by the daily purge 30 days after it was made if unclaimed, together with its photo.

**Claim page** `/claim/p/<token>` (in-app route, lazy):
- It shows the profile as it will look, and says plainly: "Someone at Lanyard made this card for you from details on <source>. Nobody can see it until you claim it." Under that are two buttons: **Claim it** and **This isn't me / delete it**. Delete erases the account straight away, no sign-in needed: the token is enough, and the token's single job is this card.
- **Claim it:** email field, then the 6-digit code (reuse `email-auth.js` with a new purpose such as `claim`). The Terms and 18+ confirmation are shown and recorded exactly as at sign-up. The admin never consents for anyone.
- On success:
  - the account becomes the claimer's (`is_guest = 0`, `email_verified = 1`, `admin_made` stays 1 for the record);
  - the `claim_links` row is deleted;
  - a session is made;
  - they land on Edit profile with a short "Check your details" banner.
- A wrong or expired token gets one plain page: "This link has expired or was already used."
- **If the email already has a Lanyard account:** do not merge. Say "You already have a Lanyard account with this email. Sign in, and we'll offer these details to you instead." After they sign in, the details become an F75 suggestion on their own account, and the premade account is erased. If F75 is not built yet, show the message and erase nothing; record this in the Log.
- Tries are limited per IP and per token, as other code routes are (`takeTry`).

**Security bar:** tokens are compared by hash and expire. Each Copy link rotates the token. Every admin route is behind the token and audited. The claim routes are rate limited. A token never appears in logs (`admin_audit` must not record the token: check `url.search` logging, and keep the token in the path of a POST body, not a query string).

**Privacy:**
- The claim page states the source, which meets UK GDPR Article 14 for data not obtained from the person, and offers delete in one tap.
- Add a Privacy Policy section: "If we made a card for you", covering what, where from, private until claimed, deleted after 30 days, and how to delete. Do **not** bump the Terms or Privacy version; flag whether you think it is material.
- Add a decision note, and update [[Privacy and Data Retention]] (owner-modified: put the lines in the Log for the orchestrator).

## Tasks
- [ ] F74.1 Migration, admin routes (make, edit, list, rotate link, delete) and the private-until-claimed rules, with tests.
- [ ] F74.2 The claim routes (look, delete, email code, claim, existing-account case) with Terms recording and rate limits, with tests.
- [ ] F74.3 The `/admin/profiles` page and the `/claim/p/<token>` page.
- [ ] F74.4 The 30-day purge, the metrics change, the Privacy Policy section, vault notes, decision note, Log, Master To-Do.

## Acceptance checks
- [ ] Making a profile on `/admin/profiles` returns a link. Opening `/c/<its card id>` signed out, signed in as someone else and as the admin each give 404.
- [ ] The made profile is not found by people search for its exact name.
- [ ] Opening the claim link shows the card, the source and both buttons. "This isn't me" erases the account and the link then says it has expired.
- [ ] Claiming with a new email: the code is sent (captured with `MAIL_LOG=1`), the Terms record is written with the current version, the card becomes public at `/c/<id>`, and the link no longer works.
- [ ] Claiming with an email that already has an account does not merge or sign anyone in, and shows the sign-in message.
- [ ] Copy link on a waiting profile stops the old link working.
- [ ] A profile made 31 days ago and unclaimed is gone after `purgeExpired`, photo included. One made 29 days ago is kept.
- [ ] Wrong tokens are rate limited (429 after the limit). No token appears in `admin_audit` or in captured logs.
- [ ] `/admin/profiles` and the claim page read well at 375 px and 1280 px, light and dark.
- [ ] Owner check (cannot be ticked by an agent): make one for a friend on production, send the link, and have them claim it on their phone.

## Log
- 2026-11-25 (owner decision): private until claimed, deleted after 30 days unclaimed, claimed by confirming an email.

Related: [[F75 Admin-suggested profile edits that the person approves]] · [[F70 Platform metrics with daily snapshots and CSV export]] · [[Privacy and Data Retention]] · back to [[00 Master To-Do]]
