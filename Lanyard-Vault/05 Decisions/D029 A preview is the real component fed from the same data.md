---
tags: [decision]
status: Accepted
date: 2026-11-11
---
# D029 A preview is the real component fed from the same data

**Status:** Accepted  ·  **Date:** 2026-11-11

## Context
[[F18 Live previews for cards and events]] adds live previews: the host sees the check-in page beside the event form, and a person sees their badge and their card page while editing. A preview that is a second copy of the markup drifts from the real page, and the public pages have a hard first-load budget ([[D024 Signed-in frame and heavy pieces load only where used]]).

## Decision
- **One component per page, props only.** The check-in page is `EventPage.vue` (the real `EventJoin.vue` and the host preview both draw it). The card as a scan opens it is `CardView.vue` (the real `PublicCard.vue` and the card preview draw it; the selfie and connection bits stay in `PublicCard.vue` and are handed in as content). The badge is the existing `Badge.vue`. No preview has its own markup.
- **One function for the data.** `src/lib/cardmerge.js` (`cardFacts`) decides which links, tags, headline and about a card shows; the Worker's `cardView` and the preview both call it. The host form's body (`createBody`, `detailsBody`) is what the buttons send and what the preview reads (`eventFromBody`); the edit-profile payload is `payloadOf()`, used by Save and by the preview. Where the Worker trims or cuts a value on saving, the preview does the same, and `test/preview.mjs` saves real events, cards and profiles through the real routes and checks the preview's data and its rendered HTML are identical to the saved page's.
- **A preview does nothing.** It makes no request, saves nothing, creates no connection or check-in, and is inert (`inert` and `aria-hidden`, so nothing in it can be pressed, typed into or reached by keyboard). A card that is not saved yet shows a QR that opens nothing (`/c/preview-only`).
- **Hosts never use attendee routes.** The event preview is built from the event data the host already has: the form, and the host's own `GET /api/host/events/:id/live` (which now also returns the theme, brand colour, perks, directory setting, check-in questions and sponsors the host typed). It shows a made-up first-time or returning person, never a real attendee.
- **Weight.** Previews live in the lazy chunks of the pages that show them. The only public-page cost is `CardView` being a shared chunk the card page now loads (about +0.8 KB gzip on the card page, +0.1 KB on the other public pages for the longer chunk map in the entry).
- **The theme and brand colour now show on the check-in page.** They were stored and returned but never drawn anywhere an attendee looks, so a preview could not reflect them. `EventPage` draws a card-style head with the strap when the host chose Formal or Night or set a brand colour; an event with the default theme and no colour looks exactly as it did. This is the one visible change to a real page.

## Consequences
A change to the check-in page or the card page shows in the previews automatically. A new field on either needs adding to the preview's data function and to the equivalence test, or the test fails. The card editors' preview sits beside the app column only from 1260 px (the column is 480 px wide); below that it is a Preview button at the top of the editor. The on-screen `Badge` does not draw a custom strap colour (only the saved image and the card page do), and the preview shows it as it is.

**Evidence:** `src/components/EventPage.vue`, `EventPreview.vue`, `CardView.vue`, `CardPreview.vue`, `src/lib/cardmerge.js`, `cardpreview.js`, `eventform.js`, `test/preview.mjs`

Related: [[D018 Hand-built pickers outside the shared Vue chunk]], [[D020 Host accounts separate from attendee accounts]] · back to [[Decision Log]]
