---
tags: [roadmap, feature, host, security]
id: F32
priority: P1
phase: 6
size: L
status: In progress
needs: [F10, F15, F31]
---
# F32 Drops for codes, keys and vouchers

**Priority:** P1 · **Phase:** 6 Owner requests 2026-11-13 · **Size:** L · **Needs:** [[F10 Separate host accounts on host subdomain]], [[F15 Events tab and event hub]], [[F31 Named attendance with check-in notice]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-13)
"A way to distribute API keys, for example for hackathons. It doesn't have to be API keys; it just needs to be something secure that can be sent to users. It could vary for each user, be random, or anything. Just a text with a title of what it is. And food vouchers, easily."

Asked what hosts may see about who got what, the owner answered: names, if the event has named attendance on ([[F31 Named attendance with check-in notice]]); counts only otherwise.

## The idea: a "drop"
A host adds a **drop** to an event: a title ("API credit", "Wi-Fi password", "Lunch voucher") and what each attendee gets. Checked-in attendees find their drops in the event hub ([[F15 Events tab and event hub]]) under "For you", tap to reveal, and copy.

### Kinds
| Kind | What the host gives | What each attendee gets |
| --- | --- | --- |
| Same for everyone | One text | That text (for example a Wi-Fi password or a shared promo code) |
| One each from a list | A pasted list, one item per line (API keys, codes, links) | The next unused item, given once, never to two people |
| Random from a list | A pasted list | One item at random, with or without reuse (host chooses) |
| Voucher | A title, a count per person (for example 1 lunch) and an optional "valid from / until" | A voucher screen that staff mark as used |

### Vouchers
- The attendee opens the voucher and shows the screen. It shows the event, the title, their first name and photo (so it can't simply be passed on), a live clock (so a screenshot is easy to spot) and how many uses are left.
- Marking as used: pick the simplest secure option and record why in a decision note. Candidates: a staff "Mark as used" button on the attendee's screen behind a short staff PIN the host sets; or a staff QR scan that opens a host-site page. Each use is recorded once, even if two staff tap at the same time.
- The host sees "Lunch: 84 of 120 used" (and names if named attendance is on).

### Security
- Pasted items are secrets. Store them encrypted at rest with a Worker secret (`DROP_KEY`, like `TOTP_KEY`); decrypt only when the assigned attendee reveals theirs. Never log them, never return them in host views after upload (the host sees "120 loaded, 37 given", and can download only the unused ones, or delete them), never put them in anyone's data export except the person they were given to.
- An item is given only to a signed-in attendee who checked in to that event, at most once per drop per person (or the per-person count for vouchers), with a single conditional write so two requests can't take two items or the same item.
- Rate-limit reveals and voucher uses with the existing `bump()` pattern.
- The host can stop a drop (no new items given), and revoke one person's item if named attendance is on and the host can see who had it (for a leaked key).
- When the list runs out: "All given out" for later attendees, and the host sees it.
- Reveal is behind a tap ("Show"), with Copy, so it isn't shown on a projector or in a screenshot by accident.

### Who sees what
- Attendee: only their own items.
- Host: counts always; names and which item went to whom only when the event has named attendance on and the person left the attendance tick on ([[F31 Named attendance with check-in notice]]); never the decrypted value of a given item.
- Retention: given items and the unused list are deleted a set time after the event ends (propose, for example, 30 days as an owner decision), and by the F10 reset script.

## Tasks
- [x] F32.1 Migration and encryption helper; tests for encryption, one-each assignment under concurrent requests, and never giving the same item twice.
  - `migrations/0029_drops.sql` (additive: five tables, one trigger, nothing existing touched; `drops`, `drop_items`, `drop_gives`, `voucher_uses`, `drop_audit`). `worker/dropcrypto.js`: AES-256-GCM, a random IV per item, a key derived (HKDF) from the Worker secret `DROP_KEY`, the drop id and item id bound in as additional data, and it fails closed (no key, a short key or a wrong key throws one clear 503 and returns or stores nothing; unlike `totp.js` it never falls back to plain text). `worker/drops.js`: reading a pasted list (by line number in errors, never by value), `createDrop` (checks and seals everything first, removes the drop if writing fails halfway) and `revealItem` (the one conditional INSERT that gives an item, a unique constraint on one give per person per drop and one per exclusive item as the second lock, and a key check that refuses before an item is used up). `test/drops.mjs` is new and wired into `npm test` before the budget check; `DROP_KEY` is in `.dev.vars.example`.
- [x] F32.2 Host side: create a drop of each kind, upload a list, see counts, stop, download unused, delete, revoke.
  - `worker/dropsHost.js` (registered on `hostApp` by one line in `hosts.js`, so every route sits behind the host-site, host-cookie and `hostEvent` rules: signed out 401, an attendee cookie 401, the host cookie on the main site 403, another organisation 404) and `worker/dropsManage.js`: list with counts only ("120 loaded, 37 given, 83 left"), make a drop of each kind (the voucher's staff PIN is returned once), stop and start, rename and set a window, add more items (an item already in the drop, given or not, is never added again), download the unused items (POST, decrypted, host only, 5 an hour per drop, audited in `drop_audit` with the count and no values), delete the unused items (one statement, so an item someone is given at that moment stays), delete the drop. `HostDrops.vue` is the new Drops tab in `HostLive.vue` (same host chunk, no new chunk name). A server with no `DROP_KEY` says so plainly (`expose` on the error, which the shared error handler now honours for 5xx errors that opt in) and the tab hides the form. Revoke and the named view come in F32.5, the staff PIN in F32.4.
- [x] F32.3 Attendee side: "For you" in the event hub, reveal, copy, voucher screen.
  - `worker/dropsApp.js` (main site): `GET /api/e/:id/drops` (each drop's title, note and where it stands for the person, never an item or a count of what is left), `POST /api/e/:id/drops/:did/reveal` ("Show": gives the item if none yet, then opens it; 12 presses per 10 minutes per drop and 60 an hour overall, `no-store`) and `exportDrops` (their own items, opened, in their data download, nobody else's). Signed out is 401 (drop routes never mint a guest: `sessionMiddleware(..., { guests: false })`), not checked in 403, another event's drop 404, the host site and the host cookie get nothing. `EventDrops.vue` is "For you" on the event hub (inside the `EventDetail` chunk: no new chunk, no new route): Show, Copy and Hide, the key cleared on Hide, on leaving the page and when the tab is hidden, and a voucher sheet (event, title, first name and photo, a live clock, uses left; staff marking is F32.4). `EventDetail.vue` gains two lines.
- [x] F32.4 Voucher use by staff, recorded once.
  - `worker/vouchers.js` and `POST /api/e/:id/drops/:did/use`: staff type the six-digit PIN the host was shown once, masked, on the holder's own phone, and one use is recorded with its time. The method and why are in [[D039 Drops are sealed with a Worker key, given by one conditional write, and vouchers are marked with a staff PIN]] (a staff QR scan was the other candidate). A use is one conditional INSERT (the voucher is on, in its window and the person has uses left) with the primary key (drop, person, use number) behind it, so two staff pressing at once record one use and the loser is told when it was used. The server keeps only an HMAC of the PIN bound to the drop; five wrong tries hold the person for 10 minutes (even with the right PIN) and a hundred hold the voucher for everyone for an hour; the host's "New staff PIN" replaces it at once (audited). The voucher sheet in `EventDrops.vue` has "Staff: mark as used" with a masked PIN box; the host's card has "New staff PIN". A stopped voucher is not used.
- [ ] F32.5 Named view for events with named attendance; retention purge; reset script; export.
- [ ] F32.6 Policy and vault notes, security tests, browser check.

## Acceptance checks
- [ ] A host loads 50 API keys as "one each"; 50 attendees each get a different key, the 51st sees "All given out", and no key is given twice, including when requests arrive at the same moment.
- [ ] A lunch voucher can be used once; a second use says it was already used and when.
- [ ] Host views and logs never contain a given key's value, and the database holds only encrypted values.
- [ ] Without named attendance the host sees counts only; with it, names too.

## Log
-

Related: [[F20 Host promo codes for event credits]], [[Security]], [[F31 Named attendance with check-in notice]] · back to [[00 Master To-Do]]
