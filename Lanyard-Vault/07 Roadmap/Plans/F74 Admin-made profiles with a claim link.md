---
tags: [roadmap, feature, admin, growth, privacy, auth]
id: F74
priority: P1
phase: 13
size: L
status: In progress
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
- [x] F74.1 Migration, admin routes (make, edit, list, rotate link, delete) and the private-until-claimed rules, with tests. (`migrations/0046_admin_made_profiles.sql`, `worker/premade.js`, `worker/premadeAdmin.js`, `worker/profileFields.js` (the Edit profile checks, moved out of `index.js` so both use one copy), `test/premade.mjs`)
- [x] F74.2 The claim routes (look, delete, email code, claim, existing-account case) with Terms recording and rate limits, with tests. (`worker/claim.js`: POST only, the token in the body; `claimCodeEmail` in `worker/mail.js`; `SIGNUP_NOTICE.claim` and `claimNoticeStmts` in `worker/legal.js`; `handOffToExistingAccount` is the F75 slot)
- [x] F74.3 The `/admin/profiles` page and the `/claim/p/<token>` page. (`src/views/AdminProfiles.vue`, `src/views/ClaimProfile.vue`, two lazy routes in `routes.attendee.js`, a link on `/admin`, the Check your details line on Edit profile; walked in the browser pane, see the Log)
- [x] F74.4 The 30-day purge, the metrics change, the Privacy Policy section, vault notes, decision note, Log, Master To-Do. (`purgePremade` in `purgeExpired`, `METRICS_VERSION` 2 with `premade_waiting`, Privacy section 8g, D063, Features, Screens and Routes and Codebase Map; the lines for the owner-modified notes are in the Log)

## Acceptance checks
- [x] Making a profile on `/admin/profiles` returns a link. Opening `/c/<its card id>` signed out, signed in as someone else and as the admin each give 404.
- [x] The made profile is not found by people search for its exact name.
- [x] Opening the claim link shows the card, the source and both buttons. "This isn't me" erases the account and the link then says it has expired.
- [x] Claiming with a new email: the code is sent (captured with `MAIL_LOG=1`), the Terms record is written with the current version, the card becomes public at `/c/<id>`, and the link no longer works.
- [x] Claiming with an email that already has an account does not merge or sign anyone in, and shows the sign-in message.
- [x] Copy link on a waiting profile stops the old link working.
- [x] A profile made 31 days ago and unclaimed is gone after `purgeExpired`, photo included. One made 29 days ago is kept.
- [x] Wrong tokens are rate limited (429 after the limit). No token appears in `admin_audit` or in captured logs.
- [x] `/admin/profiles` and the claim page read well at 375 px and 1280 px, light and dark.
- [ ] Owner check (cannot be ticked by an agent): make one for a friend on production, send the link, and have them claim it on their phone.

## Log
- 2026-11-25 (owner decision): private until claimed, deleted after 30 days unclaimed, claimed by confirming an email.
- 2026-11-26 (Claude subagent): built F74.1 to F74.4 ([[D063 Admin-made profiles are private until claimed, by a hashed link and an emailed code, and deleted after 30 days]]); waiting only on the owner's check on production (a friend claims one on their phone) and on the owner-modified vault notes below. Built on F70 as it stands: its code is in (5de6412, 469e3d2, 26265b1) and only its own production check is open; F74 bumps its `METRICS_VERSION` to 2.
- What it is: migration 0046 (`users.admin_made`, `users.claimed_at`, `claim_links`, a partial index, two triggers), `worker/premade.js` (the rules), `worker/premadeAdmin.js` (seven admin routes), `worker/claim.js` (five POST claim routes, `claimWrite`, the F75 slot `handOffToExistingAccount`), `worker/profileFields.js` (the Edit profile checks, moved out of `index.js` and shared), `claimCodeEmail` in `worker/mail.js`, `SIGNUP_NOTICE.claim` and `claimNoticeStmts` in `worker/legal.js`, the 30-day purge in `purgeExpired`, metrics version 2 with `premade_waiting` (a tile in the Admin metrics), `src/views/AdminProfiles.vue`, `src/views/ClaimProfile.vue`, two lazy routes, a link on `/admin`, a Check your details line on Edit profile, Privacy Policy section 8g, `test/premade.mjs` (139 checks, wired before `test/rederive-fixes.mjs`).
- Excluded from (each with a test in `test/premade.mjs`): `GET /api/c/:cardId` (the same 404 body as a missing card, signed out, signed in, with the admin token), `GET /api/code/:code` (`findCardByCode`), `POST /api/connect` (missing-card 404, no guest made), `/media/avatar/...` (404 like a missing photo; served only by `POST /api/claim/photo` and the admin photo route, never cached), the link preview of `/c/<id>` (`seo.js` `cardTags`), the admin's account recovery search and its sign-in code (409). The triggers refuse any `checkins` or `connections` row for an unclaimed one, so it is in no event room, Who to meet, presence, People, people search (F24 reads connections) or host view; the test checks each of those answers and that the database refuses a forced insert on either side. Metrics leave it out of every people, profile and card count.
- How the bar is tested: tokens are 43 base64url characters that decode to 32 bytes; the stored hash is SHA-256 of `claim-link:` plus the token, and every table is searched for the raw token; wrong, malformed, one-letter-off, expired (forced), replaced (Copy link) and used tokens give one identical body; ten wrong tokens per IP then 429 (and then even the right one), ten wrong codes against one link from twelve IPs then 429; rate-limit keys never hold a token; every token handed out is searched for in every `admin_audit` row and every console line captured during the test (none), and in the local browser walk in the audit table and the Worker console (none); "This isn't me" with only the token erases user, profile, card, link and photo and the link then gives the plain answer; the claim needs the code (a wrong code is refused and the account untouched) and Terms plus 18+ (each missing one refused, the code still usable), and writes `consents` (terms:2026-11-22) and one `consent_log` line with `notice:claim`, the words and the version, as sign-up does; the admin's make and edit, even with `acceptTerms` and `over18` in the body, write no consent and no 18+; an existing email (verified, and a legacy unverified sign-in address): 409 with the plain words, no cookie, no session, the existing account unchanged, the profile still waiting with its link, nothing erased; after a claim `is_guest` 0, `email_verified` 1, `admin_made` 1, `claimed_at` set, one session for that browser only, the `claim_links` row gone, card and photo public, and it can connect; concurrency: two different people with right codes for one link finish at once on a database where every query waits a turn: one 200, one plain refusal, one session, one Terms line; and `claimWrite` ten at once: exactly one wins; the purge: 31 days gone with its photo, 29 days kept (gone two days later), a claimed one at 31 days untouched, and a failed R2 delete stays queued in `media_deletes` and goes on the next run; admin routes: all seven 401 without and with a wrong token, an audit row per call, `source` required (missing, empty, blank, not text and 81 characters are all 400; 80 is kept; control, zero-width and direction characters removed), and the same messy body saved through Edit profile and through the admin gives the same stored profile, with the same institution error.
- Decisions made without the owner (all in D063): Start always sends a code and the existing-account message comes only after the code, so the page never says which emails have accounts; the link ends 30 days after the account was made and Copy link never extends it; the photo of a waiting profile is not served at `/media` even with its key; claiming ends any other session in that browser first; the admin's recovery search hides waiting profiles and refuses them a sign-in code; the token is hashed with a `claim-link:` prefix; at most 5 codes an hour per link.
- Guards changed (none weakened): `test/card-colours.mjs`, `test/event-themes.mjs`, `test/host-branding.mjs`, `test/metrics.mjs`, `test/people-search.mjs`, `test/stages.mjs` now allow 0046 as the newest migration; `test/mail-layout.mjs` counts 30 emails (the claim code one added, with its pinned subject, listed with the code emails that have no button, its "Your claim code is" line read like the sign-in code's), and `email-auth.js` has three send calls (the claim email goes through `issue`); `test/metrics.mjs` gains the version 2 checks.
- Browser (local database, servers on 8787 and 5173 with a throwaway admin token and `MAIL_LOG=1`, no `.dev.vars`; the claimer in separate cookie jars at `fresh.localhost:5173` and similar): `/admin` → Profiles for people → made Robin Example with a photo → the link shown once; `/c/<id>` and `/api/c/<id>` 404 signed in as another local account, the same body as a missing card, also with the admin token; the claim link showed the card, photo, source and both buttons; claimed with a new email (the code read from the Worker console), landed on Edit profile with Check your details, the card then public and the link dead; "This isn't me" on a second showed Deleted and the link then the expired page; a third, claimed with that same email, showed the sign-in message and left no cookie; Copy link on it made the old link 404 and the new one open. Looked at both pages at 375 px and 1280 px in light and dark; no sideways scroll at 375. Not checked: Midnight, a screen reader, the system clipboard (the pane refuses it; the page then says so and shows the link to copy by hand).
- Budget (B gzip, before to after): Landing 44,358 to 44,413, PublicCard 47,712 to 47,767, Hosts 42,710 to 42,768, Privacy 50,381 to 50,696, Terms 46,922 to 46,979, Redeem 46,066 to 46,126, SignIn 47,178 to 47,236, PrivacyRequest 49,899 to 49,957 (limit 51,200; the final run). The 55 to 61 B on every page is the two new route chunk names in the router; Privacy also carries section 8g (about 255 B), leaving 504 B. No shared front-end file changed beyond the two lazy route entries.
- Privacy Policy: section 8g "If we made a card for you" (what, where from, private until claimed, 30 days, basis, how to delete). Terms and Privacy version not bumped. In my view this is material for the people it is about (a new source of data and a new purpose), though not for existing users; the owner and the lawyer should decide whether to bump. Not added: a row in section 6's table (budget headroom is now 504 B).
- F75 slot: `handOffToExistingAccount(env, { premadeId, accountId, source })` in `worker/claim.js`, called after the code proves the email; it returns false and changes nothing, so the link keeps working. F75 makes the suggestion and then calls `erasePremade`.
- Owner steps: `npm run db:remote` (0046, additive, safe before the deploy), then `npm run deploy`. Then make a profile for a friend on `/admin/profiles`, send the link privately, and have them claim it on their phone. Send links only to the person: whoever holds one can see, delete or claim the card. Apply the vault lines below.

### Vault updates pending (owner-modified notes)
**[[Data Model]]** (a new bullet after the F70 one):
`- **Admin-made profiles (F74, migration 0046, [[D063 Admin-made profiles are private until claimed, by a hashed link and an emailed code, and deleted after 30 days]]).** `users.admin_made` (0 or 1, default 0; stays 1 after the claim) and `users.claimed_at` (ms, NULL until claimed); an unclaimed one is `admin_made = 1 AND is_guest = 1`, a guest with a profile and one card, no session and no email. `claim_links` (`user_id` primary key, cascades with the account; `token_hash` unique, SHA-256 of `claim-link:` plus the 32-byte token; `source`, where the details came from, at most 80 characters; `created_at`; `expires_at`, 30 days after the account was made). A partial index on `users(created_at) WHERE admin_made = 1`. Two triggers refuse a `checkins` or `connections` row for an unclaimed one. The row goes on the claim (in the same batch), on erasure and with the 30-day purge.`

**[[API Surface]]** (after the "Admin metrics" paragraph):
`**Admin-made profiles** (token, F74, 2026-11-26): `GET /admin/premade` ({ waiting: [{ id, cardId, name, source, createdAt, expiresAt, linkMadeAt }], claimed: { count, recent: [{ id, claimedAt }] } }); `POST /admin/premade` (profile fields as Edit profile takes them, `source` required, optional `photoDataUrl`; 201 { id, cardId, link, path, expiresAt }); `GET /admin/premade/:id`; `PUT /admin/premade/:id` (the Edit profile checks, `source` optional); `POST /admin/premade/:id/link` (a new link, the old one stops; { link, path, expiresAt }); `DELETE /admin/premade/:id`; `GET /admin/premade/:id/photo` (no-store). Only unclaimed ones; anything else is 404. **Claim** (F74, POST only, the token in the JSON body, no guest made): `/claim/look` { token } → { card, hasPhoto, source, expiresAt }; `/claim/photo` → the image, no-store; `/claim/delete` → { ok }; `/claim/start` { token, email } → { ok } whether or not the email has an account; `/claim/finish` { token, email, code, acceptTerms: true, over18: true } → { ok, next } and a session, 400 `terms_required` or `bad_code`, 409 `has_account`. A wrong, expired, replaced or used token is 404 { error: "This link has expired or was already used.", code: "link_gone" }; 429 after 10 wrong tries in 10 minutes per IP or per token.`

**[[Privacy and Data Retention]]** (a new section after "Platform metrics (F70)", and a line in Retention):
`## Admin-made profiles (F74)`
`- **What:** a card the Lanyard admin makes for someone not on Lanyard yet, from details they made public elsewhere (name, photo, work or study, links, tags), with where they came from (`claim_links.source`). Basis: legitimate interests (inviting them). The claim page states the source (UK GDPR Article 14) and offers delete in one tap ([[D063 Admin-made profiles are private until claimed, by a hashed link and an emailed code, and deleted after 30 days]]).`
`- **Who sees it:** only whoever holds the claim link, and the admin. Its card, code, photo and link preview are a 404 to everyone; it is in no search, People, Who to meet, event list or count of people; it cannot be checked in or connected. The admin records no consent for the person: Terms and 18+ are recorded only when they claim it, as at sign-up.`
`- **Retention:** erased with its photo at once on "This isn't me" or the admin's Delete, and by the daily purge 30 days after it was made if unclaimed; a claimed one is an ordinary account. The link's hash goes on the claim.`
`- **Policy:** Privacy Policy section 8g. Version not bumped; in our view it is material for the people it is about, so it belongs in the next bump (owner and lawyer to decide).`
Retention list: `- Admin-made profiles not claimed (F74): 30 days after they were made, with their photo.`

**[[Security]]** (a bullet after Company branding):
`- Admin-made profiles and claim links (F74, [[D063 Admin-made profiles are private until claimed, by a hashed link and an emailed code, and deleted after 30 days]]): an unclaimed one has no session or email and is the missing-card 404 everywhere; triggers refuse check-ins and connections for it. Claim tokens are 32 random bytes, kept only as SHA-256, compared by hash, 30 days, single use, replaced by Copy link; they travel only in the page address and POST bodies, never in a query string, an admin route, an email or a rate-limit key, so never in `admin_audit` or a log line (searched for in tests). Claim routes count tries per IP and per token before checking (D040) and give one plain answer for wrong, expired, replaced and used links. The claim is one batch gated on the link row (one winner). The admin routes keep the token check (401 without it, audited). Tested in `test/premade.mjs`.`

**[[Auth and Sessions]]** (a section after "Claiming an account"):
`## Claiming an admin-made profile (F74)`
`A card the admin made is claimed at `/claim/p/<token>`: the person types an email, gets a 6-digit code (`email_codes` purpose `claim`, the usual 10 minutes and 5 tries), and presses Claim it under the Terms and 18+ line. The account becomes theirs (`is_guest = 0`, `email_verified = 1`, the email is its sign-in email) and that browser gets a session (any other session there is ended). An email that already has an account is never merged or signed in. The admin cannot make a sign-in code for an unclaimed one.`

**[[Testing]]** (the list of test files):
`- `test/premade.mjs` (F74): admin-made profiles and claim links: the migration, the seven admin routes (401, audit, source, the shared Edit profile checks), private until claimed on every route and list, tokens (hash, no token in the database, audit, logs or rate-limit keys), the claim routes (plain answer, rate limits per IP and per token, delete, code, Terms record, existing email, concurrency on a slow database), the 30-day purge, the pages and the Privacy section.`

**[[Decision Log]]** (a new first row of the table):
`| [[D063 Admin-made profiles are private until claimed, by a hashed link and an emailed code, and deleted after 30 days]] | Admin-made profiles (F74): an unclaimed one is a guest with no session or email, the missing-card 404 everywhere and refused by triggers for check-ins and connections; a 32-byte claim token kept only as SHA-256, 30 days from the account's making, replaced by Copy link, in POST bodies only; one plain answer; tries per IP and per token; the claim needs an emailed code and records Terms and 18+ as sign-up does, in one gated batch; an existing email is never merged (F75 slot); erased at once on "This isn't me" or after 30 days; metrics version 2 | Accepted |`

Related: [[F75 Admin-suggested profile edits that the person approves]] · [[F70 Platform metrics with daily snapshots and CSV export]] · [[Privacy and Data Retention]] · back to [[00 Master To-Do]]
