---
tags: [roadmap, feature, ui, host]
id: F18
priority: P2
phase: 3
size: M
status: Not started
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
- [ ] F18.1 Extract `EventPage.vue`, with no visual change to `EventJoin` (compare screenshots before and after).
- [ ] F18.2 Host preview pane, sheet and theme strip.
- [ ] F18.3 `CardView.vue` and the card / profile preview with the Badge/Public toggle.
- [ ] F18.4 Check at 375 px and 1280 px, light and dark, all four themes.

## Acceptance checks
- [ ] Changing the theme, name or strap colour in the host form updates the preview within a moment.
- [ ] Hiding a link on a card hides it in "What they see".
- [ ] The live `EventJoin` page looks exactly as before the extraction.

## Log
-

Related: [[Design System]], [[F19 Host present page and print]] · back to [[00 Master To-Do]]
