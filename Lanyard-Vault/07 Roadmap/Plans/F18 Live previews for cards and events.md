---
tags: [roadmap, feature, ui, host]
id: F18
priority: P2
phase: 3
size: M
status: Done
needs: [F10, F11]
---
# F18 Live previews for cards and events

**Priority:** P2 · **Phase:** 3 Host tools · **Size:** M · **Needs:** [[F10 Separate host accounts on host subdomain]], [[F11 Student and Career mode]] · back to [[00 Master To-Do]]

## What the owner asked for
- On the host portal, a **preview of the event page** that reflects the theme and the other settings while the host edits.
- The same for **user cards** while people edit their card or profile.

## Plan
### One source of truth for each page
- Extract the attendee check-in page's presentational part from `EventJoin.vue` into `src/components/EventPage.vue`, a props-only component with no API calls: name, venue, start, info, perks, questions, sponsors, theme, strap colour, directory on. `EventJoin.vue` and the preview both use it, so they can't drift apart.
- The card preview reuses `Badge.vue` and the top of `PublicCard.vue`. Extract `CardView.vue` (props-only) if needed.

### Host preview
- Event create and edit forms (`HostDashboard.vue`, `HostLive.vue` "Details") get a preview pane.
  - **≥ 1000 px:** a sticky phone-sized frame (375 × 740) beside the form.
  - **Smaller:** a "Preview" button opens a full-screen sheet.
- It updates as the host types (bind to form state, debounce 150 ms).
- A theme strip under the preview (Default, Formal, Night, Host brand) switches the theme in the form too.
- Buttons in the preview are inert, and there's a "Preview" label so nobody mistakes it for the live page.

### Card preview
- `EditProfile.vue` and the card editor (`Cards.vue` / `CardForm.vue`) show the badge and the public view with that card's visible links, tags, note, theme and strap colour.
- A toggle switches between "Badge" (what you show) and "What they see" (what a scan opens).
- On phones, the preview sits at the top, collapsed to the badge only, and expands on tap.

## Tasks
- [x] F18.1 Extract `EventPage.vue`, with no visual change to `EventJoin` (compare screenshots before and after).
  - `src/components/EventPage.vue` draws the check-in page from props and a `form` object; `EventJoin.vue` fetches, holds the form and checks in. Compared in the browser pane against the local Worker: the page's HTML before and after is character for character the same (hash and length), apart from the one wrapper `div.stack-3` that carries the page's spacing.
- [x] F18.2 Host preview pane, sheet and theme strip.
  - `EventPreview.vue` (host pages only) draws the real `EventPage` beside the form from 1000 px (sticky, 375 px wide) and as a full-screen panel behind a Preview button below that; the same panel holds the Default/Formal/Night strip and a brand colour, bound to the form. `src/lib/eventform.js` has `createBody`/`detailsBody` (what the buttons send) and `eventFromBody` (what the page is given); the Create form and the Details tab both use them. The theme and brand colour now show on the check-in page head (default and no colour: unchanged). `/api/host/events/:id/live` also returns the host's own theme, colour, perks, directory setting, check-in questions and sponsors. Restored `THEME_OPTIONS` and `FROM_OPTIONS`, which F10.7 had dropped from `HostDashboard.vue` (the Theme and Start from pickers had no options).
- [x] F18.3 `CardView.vue` and the card / profile preview with the Badge/Public toggle.
  - `CardView.vue` is the card as a scan opens it, taken out of `PublicCard.vue` (which hands it the selfie and connection bits as content). `CardPreview.vue` draws the real `Badge` or `CardView` from `lib/cardpreview.js`, in Edit profile (your first card with the profile as typed) and My cards (a new card, or the one being edited). Which links, tags, headline and about a card shows is now one function, `lib/cardmerge.js`, which the Worker's `cardView` also uses. Below 1260 px the preview is a Preview button at the top of the editor; from 1260 px it stays open beside the app column.
- [x] F18.4 Check at 375 px and 1280 px, light and dark, all four themes.
  - Checked in the browser pane against the local Worker and database (host.localhost:5173 for the host portal): the host preview at 1280 px (light: Formal and a brand colour; dark: Night) and 375 px (full-screen sheet, Escape closes it); the live check-in page at 375 px light and dark with Formal and a brand colour; the card preview in Edit profile and My cards at 1280 px (Badge, What they see with the Night theme and one link) and 375 px (Preview button, opened). Default, Formal, Night and the brand colour are also rendered and compared in `test/preview.mjs`. One fix came out of it: the head card touched the info panel (the panel has no margin of its own), now 24 px as before. Not checked: a real phone, a screen reader on the full-screen sheet, and the colour picker's own pop-up (the pane cannot open it; the colour was set by sending the input event).

## Acceptance checks
- [x] Changing the theme, name or strap colour in the host form updates the preview within a moment.
  - Browser: typing a name, picking Formal, Night and Default on the strip (the form's Theme select followed) and setting a brand colour each changed the preview inside the 150 ms debounce; the form's top edge and the frame size did not move while typing a 100-character name and venue. `test/preview.mjs` checks the debounce and that the preview's data and markup equal the saved event's for eight kinds of form.
- [x] Hiding a link on a card hides it in "What they see".
  - Browser: in My cards, Edit, What they see: unticking the one picked link showed all three (none picked means all), picking two showed those two; no API request was made and the saved card was unchanged. `test/preview.mjs`: a card that picks one link shows one on the real card page and in the preview, with the same HTML.
- [x] The live `EventJoin` page looks exactly as before the extraction.
  - Browser: the page’s HTML for a guest was hashed before F18.1 and after the last commit (default theme, no colour): the same hash and length (1,498 characters), apart from the one wrapper `div.stack-3`. An event whose host has chosen Formal, Night or a brand colour now shows a strap on its head (see the Log); no existing event has either, so none changed.

## Log
- 2026-11-11 (Claude subagent): Built. Hosts see the real check-in page beside the Create event form and the Details tab, with a Default / Formal / Night strip and a brand colour; people see their badge and the card page ("What they see") while editing in Edit profile and My cards. Both previews draw the real component from the same data function, make no request, save nothing and are inert. Decision: [[D029 A preview is the real component fed from the same data]]. No migration.
- First-load JS (gzip, `test/budget.mjs`), before (HEAD at the start, 8047a58) and after: PublicCard 49,911 to 50,979 B, PrivacyRequest 50,085 to 50,462 B, Landing 44,695 to 45,073 B (all under 51,200). Almost all of the card page's rise is `CardView`, now a chunk shared with the card editors (two gzip streams instead of one); the rest is the longer chunk map in the entry. All preview code is in lazy chunks of the host pages and the two card editors. **The card page has about 200 B of headroom left, PrivacyRequest about 700 B: the next change to either must come with a saving.**
- Tests changed: `test/inground.mjs` (the F16 "In common" source guards now read `CardView.vue`, where that block moved, joined to `PublicCard.vue` for the selfie that follows it; the same checks plus one that the card page draws the card through `CardView`; nothing weakened). New `test/preview.mjs` (SSR through Vite: events and cards saved through the real routes and compared as data and as HTML), wired into `npm test` before the budget check.
- Decisions I made without the owner: (1) the event theme and brand colour were stored and returned but drawn nowhere an attendee looks, so a preview could not reflect them; `EventPage` now draws a card-style head with the strap when the host chose Formal or Night or set a colour, and looks as it always did otherwise. (2) The brand colour is a new field on the Create form and the Details tab (the server already accepted `strapColor`; it is not a Plus feature for hosts). (3) Details now also edits theme, perks and the room tick (the server already accepted them); check-in questions are shown in the preview but cannot be edited after creating. (4) A copy of an earlier event shows no preview (the list does not carry its questions). (5) The event preview offers a "First time" and "Has a card" view, since a first-timer is also asked for a name and the Terms tick. (6) On phones the card preview is a Preview button at the top of the editor, closed until pressed, not a collapsed badge (a badge is about 430 px tall); from 1260 px (not 1000: the app column is 480 px wide) it stays open beside the column. (7) Edit profile previews your first card, with that card's own headline, tags and links still winning over the profile's, as they do for a scanner. (8) A card that is not saved yet gets a QR that opens nothing (`/c/preview-only`). (9) Restored `THEME_OPTIONS` and `FROM_OPTIONS` in `HostDashboard.vue`: F10.7 had dropped them, so the Create form's Theme and Start from pickers were given no options. (10) `/api/host/events/:id/live` now returns the host's own theme, colour, perks, directory setting, check-in questions and sponsors.
- Not changed, found on the way: the on-screen `Badge` ignores a card's custom strap colour (only the saved image and the card page draw it), so the Badge preview shows no colour change; a venue with no start time reads "Venue ·" with a dangling dot on the check-in page; `Decision Log.md` has the D028 row above its table separator.
- 2026-11-11 (owner decision, relayed by the orchestrator): F18 lists "Needs: F10". F10 is fully built and committed but not ticked, because its last checks need the production subdomain. The owner said to build the items behind F10 now, on F10's code as it stands. Anything F10's production rollout changes (the host site address, the host cookie, `HOST_ORIGIN`) may need rework here.

> [!question] Theme on the check-in page. Until now the host's Theme (Default, Formal, Night) and any brand colour were saved but never shown to attendees, so the preview could not reflect them. I made them show as a strap on the check-in page head (default and no colour: unchanged). Owner: is that what you wanted from "reflects the theme"? If not, the strip can be taken off the preview and the head put back; it is one block in `EventPage.vue`.

> [!question] Custom strap colour on the badge. The badge on My card does not draw a Plus member's strap colour (the saved image and the card page do). The Badge preview shows it the same way, so changing the colour does nothing there. Drawing it is one line in `Badge.vue`, which the landing page also loads; I left it alone.

### Owner steps
- Review the F18 commits, `git push`, then `npm run deploy`. No migration. The host preview needs the host site (`host.lanyd.fyi`) to be live, as F10 does; nothing else changes.
- Check the new strap on the check-in page and the preview wording in a real browser on a phone, and the full-screen sheet with a screen reader.
- F10 rework risk: this was built on F10 as it stands. If the production rollout changes the host site address or cookie, only the host pages and `HostApi` change; the previews do not know the address.

Related: [[Design System]], [[F19 Host present page and print]] · back to [[00 Master To-Do]]
