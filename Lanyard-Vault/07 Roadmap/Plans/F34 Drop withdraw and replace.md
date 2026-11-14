---
tags: [roadmap, feature, host, security]
id: F34
priority: P1
phase: 6
size: S
status: In progress
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
- [ ] F34.2 Host button with a confirm, attendee "replaced" line, vault notes and a browser check.

## Acceptance checks
- [ ] Replacing a leaked key gives that person a different unused key, and the old one is never given to anyone again.
- [ ] With no unused items left, replacing changes nothing and says why.
- [ ] Two replaces and a new attendee racing for the last unused item never give it to two people.

## Log
- 2026-11-14 (Claude subagent): F34 needs F32, which is done; F32 rests on F10, which is built but not ticked in the Master To-Do. The owner has said to build on F10's code as it stands, so this is built on it as it stands. Written up when the feature is finished.

Related: [[F32 Drops for codes, keys and vouchers]], [[D039 Drops are sealed with a Worker key, given by one conditional write, and vouchers are marked with a staff PIN]] · back to [[00 Master To-Do]]
