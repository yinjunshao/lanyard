---
tags: [roadmap, feature, design]
id: F39
priority: P2
phase: 7
size: M
status: In progress
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

## Tasks
Each is one commit; `npm test` (checked in a clean worktree, because the owner's uncommitted AI work breaks `test/ai.mjs` in the tree) and `npm run build` pass before it. No migration. Built on F38's code as it stands (F38 is committed but its last browser check is not ticked): its `Waiting` component and Try again are reused, not rewritten.
- [x] F39.1 Survey every `{ error, code }` the Worker sends and every place the front end shows an error (the tables below), and turn the plan into these tasks.
- [x] F39.2 Worker words, attendee side: the vague, lower-case or next-step-less messages in `worker/index.js`, `events.js`, `feedback.js`, `dropsApp.js`, `session.js`, `security.js`, `email-auth.js`, `media.js`, `attendance.js`. Only `error` text changes; no `code` changes.
- [ ] F39.3 Worker words, host and admin side: `hosts.js`, `host-auth.js`, `admin.js`, `dropsHost.js`, `dropsNamed.js`, `dropsReplace.js`, and the front end's `serverErrorField`, which matched the old words.
- [ ] F39.4 One place that turns a failed request into words: `src/lib/api.js` gets a built-in "No connection" fallback and a hook; `src/lib/errors.js` (signed-in, host and admin pages only) tells offline, timeout, 401, 403, 404, 409, 413, 429 (with the wait when the server gives one), 5xx and a labelled 503 apart. Budget numbers before and after.
- [ ] F39.5 Pages: a Sign in link when a session is lost, library English and raw fallbacks removed (passkeys, Admin, EditProfile, downloads), Try again on page-level errors, field errors next to their field.
- [ ] F39.6 `test/errors.mjs` wired before `test/budget.mjs`.
- [ ] F39.7 Look at it in a browser (offline, wrong code, rate limit, not found, signed out, a field error; 375 px light and dark, one at 1280 px), tick the acceptance checks, vault notes and D044.

## Survey (F39.1, 2026-11-17)
### How the front end shows an error today
Every call goes through `api()` in `src/lib/api.js`. It throws `new Error(json.error || "Request failed (<status>)")` with `status` and `code`. About 90 places show `e.message` as it comes. So the Worker's `error` text is what a person reads, and the generic `Request failed (404)` is what they read when the body was not JSON (an edge or proxy answer). Two places do not use `api()`: `Admin.vue` (`call()`, same "Request failed (n)") and `HostDrops.vue` (a file download).

| Case | What a person sees today | Problem |
| --- | --- | --- |
| No signal (`fetch` rejects) | "Failed to fetch" or "Load failed" (the browser's own English) | Not words for a person; no next step |
| Request hangs | A spinner until the browser gives up | No limit; no message |
| 429 | The Worker's words ("Wait a few minutes") | Fine, but the wait is never exact |
| 401 | `no_session` says "Please sign in or make a card first." with no link; `EditProfile` says "Reload the page" | No Sign in link |
| 403, 404 | The Worker's words, many of them one lower-case word ("not found") | See the table of words |
| 5xx | "Something went wrong on our side. Try again in a moment." (the Worker) or "Request failed (502)" (an edge page) | The second shows a number |
| 503 that is labelled (billing, drops) | The Worker's words | Fine |
| Library English | `e?.message` after a passkey failure, "Failed to fetch dynamically imported module" for a page chunk | Not for people |

Front-end fallbacks that a person can read when the server said nothing: `FollowupComposer` "Something went wrong." and "Couldn't load the options."; `PeopleAsk` "Something went wrong."; `HostSetup` "Something went wrong. Try again."; `People` "Couldn't load your connections."; `Events` "Couldn't load your events."; `EventDetail` "Couldn't load this event." and "Couldn't leave this event."; `Scan` "Code not found."; `Welcome` "That didn't save. Try again."; `HostDashboard` and `HostSignOut` "Couldn't sign out. Check your connection and try again."; `EditProfile` `saveErrorMessage` (413, 401 "Reload the page", 5xx "The server hit a problem saving this"); `AiSearchSetting` 403; `EventJoin` turns "event not found" into "That event code doesn't exist."; `HostLive` turns `no_credits` into words; `Feedback` turns 401 into a sign-in prompt; `SignIn`, `Claim`, `StepSave`, `AccountBanner` and `SettingsSecurity` show `e?.message` after a passkey failure (a library message can leak); `PublicCard` uses `alert(e.message)`; `EventPresence` "That photo couldn't be read."; `HostDrops` "Couldn't download them."; `eventsteps.serverErrorField` matches the Worker's English to put an error next to its field.

### Every `code` the Worker sends
"Vague" = must stay vague (yes, with why). "Unchanged" means the words already say what happened and what to do. Codes are never changed. Wait times: the Worker sends none today (a fixed "wait a few minutes"); the new front-end helper uses `retryAfter` or `Retry-After` when a response has one.

| Code | Sent from | Today's words | New words | Vague? |
| --- | --- | --- | --- | --- |
| `throttled` (32 sites) | everywhere a limit applies | "Too many wrong tries. Wait a few minutes and try again.", "That's a lot of tries. Wait a little and try again.", "Too many tries. Wait an hour." and kin | Unchanged (each says to wait and try again) | Sign-in and code counters: yes, one wording for every cause |
| `bad_code` | `auth.js` (sign-in code), `email-auth.js`, `host-auth.js`, `promo.js`, `host-promo.js` | "That code isn't valid or has expired. Ask for a fresh one on your other device.", "That code isn't right or has expired. Ask for a new one.", "That code isn't right or has expired. Check the latest email, or ask for a new code.", "That code doesn't exist. Check the spelling.", `BAD_HOST_CODE` | Unchanged; the account-email confirm in `email-auth.js` gains "Ask for a new one." | Yes (D031: promo and host refusals are one generic answer; sign-in codes never say which part was wrong or whether an account exists) |
| `bad_key` | `auth.js` recovery | "That recovery key doesn't match. Check for typos." | Unchanged | Yes |
| `bad_totp` | `totp.js` | "That email (or account ID) and code don't match. Codes change every 30 seconds." | Unchanged | Yes (does not say which part) |
| `bad_email`, `email_not_eligible`, `email_taken` | `host-auth.js`, `hosts.js`, `email-auth.js` | "That email doesn't look right.", the eligibility sentence, "That email already has a Lanyard account. Sign in with it instead." | Unchanged. Note for the owner: `email_taken` (a signed-in person adding an email) does say an account exists; it was like that before F39 and is not changed | Partly (see note) |
| `bad_origin` | `security.js`, `host-auth.js` | "Cross-site request blocked." | "That didn't come from Lanyard's own page, so it was stopped. Reload the page and try again." | No |
| `wrong_site` | `index.js`, `host-auth.js` | "Not available on the host portal.", "The host portal has its own address." | "That isn't part of the host site. Use the main Lanyard site for it.", "Host accounts sign in on the host site, not here. Open the host site and try again." | No |
| `signed_out` | `host-auth.js` | "Sign in to the host portal." | Unchanged (the new Sign in link is added by the page) | No |
| `no_session` | `session.js` | "Please sign in or make a card first." | "You're signed out. Sign in, or make a card, to carry on." | No |
| `terms_required`, `details_required` | `events.js`, `index.js`, `hosts.js` | "Please confirm you're 18 or over and agree to the Terms and Privacy Policy." and host equivalents | Unchanged | No |
| `consent_required`, `presence_off`, `not_checked_in`, `directory_off`, `not_ongoing`, `no_event` | `presenceApp.js`, `dropsApp.js`, `ai/whoToMeet.js` (owner's) | "Tick the box...", "Turn on 'Show me to people here'...", "Check in to this event to use this.", "That event isn't here." | Unchanged | No |
| `plan_limit`, `plus_required`, `too_soon`, `code_taken`, `bad_code` (custom code) | `index.js`, `codes.js` | "Free accounts can have 3 cards. Lanyard Plus raises that to...", "Choosing your own code is part of Lanyard Plus.", "You can choose a new code once a week.", "Someone already has that code. Try another." | Unchanged | No |
| `needs_card`, `needs_email`, `not_started`, `expired` | `promo.js`, `host-promo.js` | "Make your card first, then redeem the code.", "Confirm your email first...", "This code isn't live yet.", "This code has expired." | Unchanged | Yes: they are given only after the code is known to exist (D031: a code that does not exist, has ended or is not theirs gets the one generic refusal) |
| `event_full`, `done`, `off`, `not_open`, `closed` (feedback), `list_off`, `locked`, `bad_rsvp`, `bad_rating`, `answer_required`, `no_credits`, `not_approved`, `no_org`, `not_allowed`, `has_org`, `ticket_required`, `not_transferable`, `no_account`, `this_device`, `not_found` (device) | `events.js`, `feedback.js`, `hosts.js`, `host-promo.js`, `host-auth.js`, `alerts.js` | Plain, with the next step | Unchanged | `no_account` says an email has no host account; it is for the owner of an organisation, who typed the address, and was like that before |
| `stopped`, `not_yet`, `closed`, `gone`, `withdrawn`, `all_given`, `not_an_item`, `not_replaceable`, `none_left`, `changed`, `conflict`, `bad_items`, `too_many`, `too_many_drops`, `bad_window`, `bad_title`, `bad_kind`, `bad_count`, `bad_status`, `no_such_drop`, `not_a_list`, `not_a_voucher`, `pin_needed`, `bad_pin`, `already_used` | `drops*.js`, `vouchers.js` | Plain ("This drop has finished.", "All given out. There are none left.", "That PIN isn't right.") | Unchanged | Yes for `bad_pin`, `gone`, `withdrawn`, `all_given` (drop and voucher refusals say nothing about other people's items) |
| `drops_unavailable`, `drops_unreadable`, `billing_off`, `provider_error` | `dropcrypto.js`, `billing/routes.js`, `billing/polar.js` | "Drops are switched off on this server: its DROP_KEY secret is missing...", "Card payments are not switched on yet.", "We couldn't reach the payment page. Try again in a moment." | Unchanged. `drops_unavailable` names a setting; it is shown only to hosts and is pinned by `test/drops.mjs` | No |
| `needs_signin`, `already_plus`, `unknown_product`, `express_start`, `bad_quantity`, `no_billing`, `bad_signature` | `billing/routes.js` | Plain. `bad_signature` ("Signature not valid.") answers the payment provider's program, not a person | Unchanged | `bad_signature`: yes (says nothing about the secret) |
| (AI) `no_card`, `followup`, `people_search`, `plus` and the rest | `worker/ai/*` | Owner's files, **not changed** ("Make your card first.", "That's a lot of requests. Try again in a little while.", "Say who you are looking for.", "not JSON", "not found", "no text", "empty or too long") | n/a | n/a |
| (leave event) | `worker/leaveEvent.js` | Owner's file, **not changed** | n/a | n/a |

### Messages with no code that were not plain
Only `error` text changes (a 400 stays a 400). "New words" are final; the rest of the Worker's codeless messages already say what to do.

| Where | Today's words | New words | Vague? |
| --- | --- | --- | --- |
| `index.js` error handler (any 5xx without `expose`) | "Something went wrong on our side. Try again in a moment." | "...Try again in a minute." | No |
| `index.js` profile and card | "name required", "mode must be student or career", "profile exists; use PUT", "create profile first", "step must be a whole number from 1 to 6, or done: true", "theme must be default, formal, night or host", "colour must look like #D9502B", "can't delete your default card", "write a note first", "that's your own card", "consent required for selfie", "bad key", "Tell us what happened" | "Add your name to make your card.", "Choose a mode for your card: student or career.", "You already have a card. Reload the page to see it.", "Make your card first, then try again.", "That step isn't recognised. Reload the page and try again.", "Choose one of the card themes.", "Use a colour like #D9502B: a # then six letters or numbers.", "Your default card can't be deleted. Delete a different card, or edit this one.", "Write a note first, then save it.", "That's your own card, so there is nothing to connect.", "Tick the box to agree to the photo being shared, or leave the photo out.", "That photo link isn't valid.", "Tell us what happened, in a sentence or two." | No |
| `index.js` "not found" (21 places) | "not found" | Your own card: "We couldn't find that card. Reload the page and try again." A connection: "We couldn't find that connection. It may have been removed." A photo: "We couldn't find that photo. It may have been removed." Any other API address: "We couldn't find that. Reload the page and try again." **A card shared by link: "We couldn't find that card. The link may be wrong, or the card may have been removed." (the same words for a missing, deleted, erased or blocked card, so nothing is revealed)** | The shared card: yes |
| `events.js` | "event not found", "name required to check in", "check in to see the room", "check in to see the album" | By event code (F35.4, one answer for an unknown and an ended event): "We couldn't find an event with that code. Check it with the organiser and try again."; by id: "We couldn't find that event. Reload the page and try again."; "Add your name to check in.", "Check in to this event to see who else is here.", "Check in to this event to see its album." | Event codes: yes |
| `feedback.js`, `dropsApp.js` | "event not found" | "We couldn't find that event. Reload the page and try again." | No |
| `session.js`, `security.js`, `host-auth.js` | see the codes above | see above | No |
| `email-auth.js` | A 502 "We couldn't send that email..." was replaced by the generic 5xx words because it was not marked `expose` | Marked `expose`, so the person reads it | No |
| `media.js` | "That photo is too large.", "That file isn't a supported image (WebP, JPEG or PNG)." | "That photo is too large. Choose a smaller one.", "That file isn't a supported image. Choose a WebP, JPEG or PNG photo." | No |
| `attendance.js` | "Those collection settings are not understood." | "Those settings couldn't be read. Reload the page and try again." | No |
| `hosts.js` | "event name required", "that email doesn't look right", "that option isn't available for your organisation", "tell us a little about your organisation and events so we can quote", "add a billing email so we can send the invoice", "Only the owner can ...", "not found" | "Add a name for the event.", "That email doesn't look right. Check it and try again.", "...Choose another.", "Tell us a little ... so we can send a quote.", "Add a billing email so we can send the invoice.", "Only the owner can ... Ask them to do it.", "We couldn't find that event / person. Reload the page and try again." | No |
| `dropsHost.js`, `dropsNamed.js`, `dropsReplace.js` | "not found" (a drop, or a person on the list: one answer for both) | "We couldn't find that drop. Reload the page and try again." / "We couldn't find that. Reload the page and try again." | Yes (named list: the same answer for "not on the list" and "no such handle") |
| `admin.js` | "Wrong admin token.", "decision must be approve or reject", "status must be active or disabled" | "That token isn't right. Check it and try again.", "Choose approve or reject.", "Choose active or disabled." | The token: yes (does not say what part was wrong). "Admin isn't set up. Set the ADMIN_TOKEN secret." is unchanged (it is for the owner) |
| `integrations.js`, `billing/routes.js` webhooks | Messages for programs (an API key header, a signature, "Not JSON.") | Unchanged; no person sees them | n/a |
| `totp.js` | "Authenticator sign-in is misconfigured." (a 500, so the person already reads the generic words) | Unchanged | n/a |

### Tests that pin the words
`test/billing.mjs` (Polar down: "We couldn't reach the payment page. Try again in a moment."), `test/drops.mjs` (DROP_KEY, "All given out", "already used on", "No unused items left"), `test/promo.mjs` and `test/promo-host.mjs` (wait), `test/mode.mjs` and `test/onboarding.mjs` (the error mentions "mode" and "name"), `test/institutions.mjs` ("list"). The new words keep each of those words. `test/security-audit.mjs` pins no string that changes.

## Acceptance checks
- [ ] Every error code has a plain message saying what to do next (test).
- [ ] Offline, timeout, rate limit, signed out, not found and server error each show a different message (checked in a browser).
- [ ] Security-vague messages are unchanged (existing tests still pass).
- [ ] No public page gets heavier than its budget.

## Log
-

Related: [[Design System]], [[F38 Loading states]] · back to [[00 Master To-Do]]
