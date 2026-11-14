---
tags: [roadmap, feature, cards]
id: F33
priority: P1
phase: 6
size: S
status: In progress
needs: [F06, F18]
---
# F33 Card code in the card editor

**Priority:** P1 · **Phase:** 6 Owner requests · **Size:** S · **Needs:** [[F06 Edit profile and Cards buttons]], [[F18 Live previews for cards and events]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-14)
"Let's move the card code somewhere in the edit card area, instead of just being on the home page, thus move the note part up. Therefore integrate the card code section into the edit individual card section."

## Current state
- `src/views/MyCard.vue` (My card, the `/app` home) shows, below the badge, a "Card code" panel (~line 283): the code in large figures, "Choose your own code" for Plus (once a week, old code works 30 days), the Plus upsell for others, and "Replace with a random code" with a tap-again confirm. Below it, "Note for the next person" (~line 320).
- `src/views/Cards.vue` (My cards) lists each card and has the per-card editor (name, theme, note, headline, about, tags, visible links, strap colour), with the F18 card preview.
- The code actions call `Api.rotateCode(cardId)` and `Api.customCode(cardId, code)`.

## Plan
- Move the whole "Card code" panel out of My card and into the editor for each card in My cards, as its own section of that card's editor ("Card code"), acting on the card being edited. Keep every behaviour: the large code, Choose your own code (Plus) with its rules and messages, the Plus line for others, Replace with a random code with its confirm, and the next-change date.
- My card: "Note for the next person" moves up into the space the code panel left, directly under the badge. Keep a small, quiet line under the badge showing the current code with a link "Change in My cards" that opens that card's editor at the code section, so the code people type under Scan is still visible on the home page. If that line would make the page feel crowded, say so in the Log and keep only the link.
- Opening a card's editor at the code section from that link: use the address (for example a query or hash) so it works on refresh and the browser Back button.
- No server change.

## Tasks
- [x] F33.1 Move the code panel into the per-card editor in My cards, acting on that card; shared logic in one place, not copied.
- [ ] F33.2 My card: note moves up; a quiet code line with "Change in My cards" that opens that card's editor at the code section.
- [ ] F33.3 Tests (source guards that the panel lives in the editor and not on My card; the code actions still call the same API for the right card) and a browser check at 375 and 1280 px, light and dark.

## Acceptance checks
- [ ] In My cards, each card's editor shows its own code and can replace it (with the confirm) and, for Plus, choose one; the change shows on that card only.
- [ ] My card shows the note directly under the badge, and no code controls.
- [ ] "Change in My cards" opens the right card's editor at the code section, including after a refresh.
- [ ] No public page gets heavier ([[F28 Public-page JS budget]]).

## Log
-

Related: [[F06 Edit profile and Cards buttons]], [[Screens and Routes]] · back to [[00 Master To-Do]]
