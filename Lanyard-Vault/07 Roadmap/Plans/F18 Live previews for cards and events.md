---
tags: [roadmap, feature, ui, host]
id: F18
priority: P2
phase: 3
size: M
status: In progress
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
- [ ] F18.4 Check at 375 px and 1280 px, light and dark, all four themes.

## Acceptance checks
- [ ] Changing the theme, name or strap colour in the host form updates the preview within a moment.
- [ ] Hiding a link on a card hides it in "What they see".
- [ ] The live `EventJoin` page looks exactly as before the extraction.

## Log
- 2026-11-11 (owner decision, relayed by the orchestrator): F18 lists "Needs: F10". F10 is fully built and committed but not ticked, because its last checks need the production subdomain. The owner said to build the items behind F10 now, on F10's code as it stands. Anything F10's production rollout changes (the host site address, the host cookie, `HOST_ORIGIN`) may need rework here.

Related: [[Design System]], [[F19 Host present page and print]] · back to [[00 Master To-Do]]
