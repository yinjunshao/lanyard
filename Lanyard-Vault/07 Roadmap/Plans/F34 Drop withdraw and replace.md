---
tags: [roadmap, feature, host, security]
id: F34
priority: P1
phase: 6
size: S
status: Done
needs: [F32]
---
# F34 Drop withdraw and replace

**Priority:** P1 · **Phase:** 6 Owner requests · **Size:** S · **Needs:** [[F32 Drops for codes, keys and vouchers]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-14)
F32's report asked: "Should 'withdraw and replace' be one step? Revoke currently gives that person no new key." The owner answered: "For F32, yes do that."

## Current state
[[F32 Drops for codes, keys and vouchers]]: on an event with named attendance ([[F31 Named attendance with check-in notice]]), the host can revoke one person's item (for a leaked key). The withdrawn item is wiped and never given again, and the person gets nothing new. See [[D039 Drops are sealed with a Worker key, given by one conditional write, and vouchers are marked with a staff PIN]].

## Plan
- Add "Withdraw and replace" beside Revoke, for one-each and random-without-reuse drops: in one step, the old item is withdrawn (wiped, never given again) and the person is given the next unused item from the list, with the same single conditional write and unique constraints F32 uses, so a race with other people taking items can never give the new item to two people.
- If the list has no unused item left, nothing is withdrawn and the host is told "No unused items left to replace it with" (the host can still Revoke).
- For "same for everyone" and random-with-reuse drops, replacing makes no sense (the value is shared); show Revoke only, as now.
- The person sees their new item the next time they open the drop, and a short line "Your earlier one was replaced on <date>".
- Same visibility rules as F32: only for people on the named list at that moment.
- Audit row for each replace (who, when, counts only, never values).

## Tasks
- [x] F34.1 Worker route and the one-step withdraw-and-give, with tests (replace under concurrent requests, no unused item left, not on the named list, wrong drop kinds, values never in responses or logs).
  - `POST /api/host/events/:id/drops/:did/replace` (`{ giveId }`, host site only, behind `dropOf` like revoke, 60 an hour per host) in `worker/dropsHost.js`; the rules are in the new `worker/dropsReplace.js`. **Migration 0030** (additive: one nullable column `drop_gives.replaced_at`), because the person has one give row per drop (a unique constraint) and needs a date for "replaced on". The move is ONE conditional UPDATE of the person's give row to an unused item (`i.cipher != ''` and no give holds it; one-each takes the next in the host's order, random takes one at random), which only runs if such an item exists, the person still holds the item the host looked at, and the drop is on and in its window; the unique index on `drop_gives(item_id)` for exclusive gives is the second lock. The old item is wiped and the audit row (`replace`, count 1, no value, no name) is written in the same batch and only if the move happened. Replace never opens an item. Not for same-for-everyone, random-with-reuse or vouchers (400), and the same 404 as revoke for anyone not on the named list right now. The host counts gain `replaced`, and `unused` no longer counts a wiped item.
- [x] F34.2 Host button with a confirm, attendee "replaced" line, vault notes and a browser check.
  - "Withdraw and replace" beside Withdraw in "Who has it" (`HostDrops.vue`, tap again to confirm; for a person withdrawn earlier it reads "Give a new one"); "Your earlier one was replaced on <date>" in "For you" (`EventDrops.vue`). Vault notes: API Surface, Data Model, Codebase Map, Testing, Deployment, Host Portal and Billing, D039 (a pointer line, no new decision note).

## Acceptance checks
- [x] Replacing a leaked key gives that person a different unused key, and the old one is never given to anyone again.
- [x] With no unused items left, replacing changes nothing and says why.
- [x] Two replaces and a new attendee racing for the last unused item never give it to two people.

## Log
- 2026-11-14 (Claude subagent): Built. In "Who has it" (named attendance on) a host can press **Withdraw and replace** (tap again to confirm) for a person who holds an item from a one-each or random-without-reuse drop: the old item is wiped and never given again, and the person is given the next unused one, in one step. With none left nothing is withdrawn and the host is told "No unused items left to replace it with." (Withdraw is still there.) The person sees the new item on their next Show and the line "Your earlier one was replaced on <date>". Same drop kinds and person rules as revoke; the same-for-everyone, random-with-reuse and voucher drops have no replace (400). Route and rules: `worker/dropsReplace.js`, `POST /api/host/events/:id/drops/:did/replace`. **Migration 0030**, additive: one nullable column `drop_gives.replaced_at` (the person has one give row per drop, so the date has to live there).
- **F34 needs F32, which is done; F32 rests on F10, which is built but not ticked** in the Master To-Do. The owner has said to build on F10's code as it stands, so this is built on it as it stands.
- **How the bar is met** (all in `test/drops.mjs`, sections F34.1 and F34.2): *one conditional write*: the move is one UPDATE of the person's give row to an item that is not blank and that no give row holds, which only runs if such an item exists, the person still holds the item the host looked at, and the drop is on and inside its window; the unique index on exclusive gives is the second lock; the wipe and the audit row are in the same batch and fire only if the row moved. *Concurrency*: ten replaces at once for four unused items gave exactly four successes and six `none_left`, all ten still holding distinct readable items and exactly four items wiped; a double press at once is one replace (the other is told it just changed) or two in a row, and each success wipes exactly one item; a replace racing a new attendee for the last unused item, 24 rounds staggered both ways (in one run 17 replaces won and 7 newcomers): never both, the loser changes nothing. I checked the tests bite: removing the "no give holds it" clause from the subquery makes several checks fail. *None left*: 409, nothing wiped, same value still readable, no audit row, counts unchanged. *Named list*: a person who never ticked, who unticked a moment ago, an event whose list is off (with a stray row), another drop's handle and malformed handles are all 404 and change nothing. *Kinds*: same and random-with-reuse and voucher are 400. *Host access*: signed out 401, an attendee cookie 401, the host cookie on the main site 403, another organisation 404, and an attendee cannot call it. *Never given again*: the withdrawn item is blank, absent from the host's unused download, and not among the items four later arrivals were given. *No value anywhere*: every replace response, every audit row (a `replace` row has the host account, event, drop, count 1 and the time) and the raw `drop_items` rows were searched for every item, and the end-of-file search of every host response and everything printed now includes the new keys. *The person's side*: their list and Show carry `replacedAt`, and their data download has the new key and the date and not the old key.
- **Browser check** (local Worker on a scratch copy of the config so `.dev.vars` was not read, a throwaway `DROP_KEY` on the command line, Vite on 5173, `host.localhost:5173` for the host; nothing remote, no real email; every server stopped and 8787 and 5173 checked): a host signed in with the emailed code from the Worker console, made an event with named attendance and a one-each drop of four keys; three people checked in and took keys; at 375 px (light) the buttons wrap with no horizontal scroll; Withdraw and replace asked "Tap again to replace", then replaced Bob (item 4, "replaced", counts "4 loaded, 3 given, 0 left, 1 replaced"); a second replace with none left showed the sentence and changed nothing; after adding two keys a checked-in person took one, was replaced, and on the event hub at 375 px (light and dark) saw "Your earlier one was replaced on 14 Nov 2026." and, after Show, the new key; the host's page at 1280 px in dark mode showed the rows and buttons with no overflow. Not checked in a browser: a real phone, a screen reader, the host page at 375 px in dark mode and at 1280 px in light mode.
- **Guards I changed, and why** (nothing weakened): `test/drops.mjs` F32.1 "it is the newest migration" now says it comes after 0028 and 0028 is untouched (0030 follows 0029 now), and the file-list guard for "no console, never opens an item" gains `worker/dropsReplace.js`; `test/people-search.mjs` allows `0030_drop_replaced.sql` among the migrations after 0027 (it still must touch no AI table). `unused` in the host's counts and the "delete unused items" count no longer include a wiped item (a wiped item now has no give row, so without this it would have counted as unused). `scripts/reset-hosts.mjs` needed no change: it wipes whole tables and its schema check counts tables, and 0030 adds a column only.
- **Decisions I made without the owner:** (1) a drop that is stopped, not started or finished does not replace (409 with the drop's own reason), because replacing gives something new and a stopped drop gives nothing new; revoke is unchanged; (2) replace is also offered ("Give a new one") for a person whose item was withdrawn earlier, which is the host's way to undo a revoke; (3) the replace route is limited to 60 an hour per host account; (4) the audit row's action is `replace`, count 1 (no value, no name); (5) the host's counts gain `replaced`, the named view marks a person `replaced`; (6) the person's "replaced on" shows a date, not a time.
- **Left over:** none of the tasks or acceptance checks.

### Owner steps
- Review the F34 commits, `git push`, then `npm run db:remote` (0030 is additive and safe before the code; 0018 to 0029 first, in order, with F32's `DROP_KEY` already set), then `npm run deploy`. No new secret.
- Optionally: decide whether a stopped drop should still allow a replace (today it does not), and whether a host may replace after the drop's window has ended (today it may not).
- On a real phone: replace someone's key and open the drop as that person.

Related: [[F32 Drops for codes, keys and vouchers]], [[D039 Drops are sealed with a Worker key, given by one conditional write, and vouchers are marked with a staff PIN]] · back to [[00 Master To-Do]]
