---
tags: [roadmap, feature, seo, growth]
id: F37
priority: P1
phase: 7
size: M
status: Not started
needs: []
---
# F37 SEO and link previews

**Priority:** P1 · **Phase:** 7 Owner requests (2026-11-15) · **Size:** M · **Needs:** owner decision (what a shared card link shows) · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-15)
"Could you also start doing some research for SEO? And for example, the metadata for the website, also the link preview if possible."

## Current state
- `index.html` has one title and description for every page, no Open Graph or Twitter tags, no canonical link, no preview image.
- No `robots.txt` or `sitemap.xml`. The app is a single-page Vue app, so crawlers and link-preview bots (which mostly do not run JavaScript) see only `index.html`.
- Public pages: `/` (Landing), `/hosts`, `/terms`, `/privacy`, `/privacy-request`, `/c/:cardId` (a person's card), `/e/:code` (event join). Everything under `/app`, `/admin`, `/signin`, `/claim`, `/redeem` and the host site is private.

## Plan
1. Research note `Lanyard-Vault/02 Business/SEO research 2026-11-15.md`: keywords people search for (digital business card, event networking app, contact exchange at events, careers fair app) and what Blinq and others rank for; what link previews need on WhatsApp, iMessage, LinkedIn, Slack, X and Discord (og:title, og:description, og:image 1200x630, twitter:card); how to serve per-page tags from a Worker to bots without slowing the app.
2. Site-wide tags in `index.html`: Open Graph and Twitter tags, a canonical link, and a 1200x630 preview image in `public/`.
3. Per-page tags written by the Worker into the HTML (HTMLRewriter) for the public pages, so a link shows the right title and text even to bots that do not run JavaScript; the Vue app sets `document.title` per page for people.
4. `robots.txt` (allow the marketing pages; disallow `/app`, `/admin`, `/api`, `/claim`, `/redeem`, `/signin` and the host site) and `sitemap.xml` with the marketing pages only.
5. A person's card and an event page follow the owner's decision below. Without a decision, they are `noindex` and their preview says only "A Lanyard card" / the event name.

## Owner decisions
- [x] What a shared card link (`/c/...`) shows in a preview, and whether search engines may index cards: answered 2026-11-15, "Name headline and photo, but no index by google." Card pages are `noindex` and left out of the sitemap; the preview shows the name, headline and photo **as that card shows them** (a hidden field or a card without a photo shows nothing extra; the image is the same one the public card already serves, never a private selfie). A card that has been retired, deleted or blocked shows the generic preview.
- [x] Whether public event pages (`/e/...`) may be indexed: answered 2026-11-15, "Preview yes, no index". The preview shows the event name and host; event pages are `noindex` and left out of the sitemap.

## Acceptance checks
- [ ] A link to `/`, `/hosts` and an event page shows the right title, text and image in a preview checker (checked with the bots' user agents against a local Worker; real apps are an owner check).
- [ ] Private pages are `noindex` and disallowed in `robots.txt`.
- [ ] No public page gets heavier ([[F28 Public-page JS budget]]).

## Log
-

Related: [[Go-to-Market]], [[Screens and Routes]] · back to [[00 Master To-Do]]
