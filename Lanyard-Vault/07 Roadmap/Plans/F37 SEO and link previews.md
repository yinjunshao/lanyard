---
tags: [roadmap, feature, seo, growth]
id: F37
priority: P1
phase: 7
size: M
status: In progress
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
- [x] Research note: [[SEO research 2026-11-15]] (keywords, what rivals put in their tags, what each chat app and search engine reads, how to serve tags from the Worker, the privacy options for cards). Written 2026-11-15 before this plan was worked.
- [x] The owner's two decisions are below (cards: name, headline and photo, never indexed; events: name and host, never indexed).

## Tasks
Each is one commit; `npm test` and `npm run build` pass before it. Nothing here needs a migration, a new secret or a deploy setting.
- [x] F37.1 Site-wide tags in `index.html` straight after the charset (title, description, canonical, `og:*`, `twitter:card` = `summary_large_image`) and `public/og-image.png` (1200 x 630, paper, ink, the strap colour, the wordmark; under 300 KB), made by `scripts/make-og-image.mjs`.
- [x] F37.2 `worker/seo.js`: the Worker rewrites the title, description, canonical and og and twitter tags per public route with `HTMLRewriter` (`/`, `/hosts`, `/terms`, `/privacy`, `/privacy-request`, `/e/:code`, `/c/:cardId`), absolute links from the first `APP_ORIGIN`, every value escaped and capped, one indexed read at most, the plain page on any error. A card shows only what the public card shows; an unknown, deleted or made-up id and an unknown or ended event give the generic tags.
- [x] F37.3 `X-Robots-Tag: noindex` everywhere except the marketing pages, `robots.txt` and `sitemap.xml` from the Worker on the main site, and a host site that disallows everything. `/c/` and `/e/` stay out of `Disallow` so a crawler can read the `noindex`.
- [x] F37.4 The Vue app sets `document.title` per page for people, without making any public page bigger ([[F28 Public-page JS budget]]).
- [ ] F37.5 `test/seo.mjs` (wired before `test/budget.mjs`) for every line of the bar; vault notes ([[Architecture]], [[API Surface]], [[Deployment]], [[Security]], [[Codebase Map]], [[Testing]], [[Screens and Routes]]) and [[D042 A shared card link shows what the card already shows, and is never indexed]].

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
