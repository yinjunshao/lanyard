---
tags: [decision, seo, privacy]
status: Accepted
date: 2026-11-17
---
# D042 A shared card link shows what the card already shows, and is never indexed

**Status:** Accepted  ·  **Date:** 2026-11-17

## Context
The owner asked for link previews and search tags ([[F37 SEO and link previews]]). For a person's card the answer was "Name headline and photo, but no index by google", and for an event "Preview yes, no index" (2026-11-15). The research ([[SEO research 2026-11-15]], section 5) lists the risks: a name and photo are personal data, chat apps keep a preview after the card changes, delisting from search is hard, and `noindex` is a request, not a lock. Link-preview bots never run the app's JavaScript and never sign in, so the preview has to be written into the HTML by the Worker.

## Decision
- **The preview of `/c/:cardId` is the signed-out public card, field for field.** It uses the profile's name, the headline the card shows (the card's own, else the profile's: the `cardFacts` rule the card page uses) and the profile photo if there is one. Nothing else is read: no email, links, about, tags, notes, projects, university, course, any other card, or any selfie. An empty headline shows a plain "Open this card to connect on Lanyard." and no photo means the site picture. It is one query on the card's id.
- **A card that does not exist, whatever the reason, gets the generic Lanyard preview.** A made-up id, a deleted card and an erased account give byte-for-byte the same page, so a preview cannot be used to find out which ids ever existed. A card has no "retired" state; its code can rotate but its id does not change.
- **The preview of `/e/:code` is the event name and its host's name**, only while the event is live. An unknown, ended or wrongly shaped code gets the generic preview. It counts wrong codes on the same per-IP counter as `GET /api/e/:code` (F35.4), so the page cannot be used to guess live events.
- **Never indexed.** `/c/*` and `/e/*` send `X-Robots-Tag: noindex, nofollow`, are not in the sitemap, and are **not** in robots.txt `Disallow`: a crawler that may not fetch a page can never read its `noindex`. Only `/`, `/hosts`, `/terms` and `/privacy` can be indexed; the host site is closed to all crawlers.
- **Safe by construction.** Values are set only with `HTMLRewriter` `setAttribute` and `setInnerContent` (which escape), never joined into HTML. Control, invisible and direction-changing characters become spaces, angle brackets become look-alikes, titles are cut at 70 characters and descriptions at 160. Photo keys are checked against the pattern the media route serves to anyone.
- **A person's photo uses the small Twitter card** (`summary`) with no size tags, because it is square and its size is not known; every other page uses `summary_large_image` with the 1200 x 630 site picture.
- **Any failure serves the page.** A database error or a lookup slower than 2 seconds gives the generic tags; if the rewriter itself fails, the plain page.

## Consequences
- A name, headline and photo reach every chat app a link is shared in, and those apps keep them (Slack and Discord about 30 minutes, LinkedIn about a week, Facebook by image address). A later change or deletion does not reach copies already made. The Privacy Policy does not say this yet (see the plan note's owner questions).
- `noindex` is honoured by search engines, not enforced; anything truly private needs a sign-in. Card ids are 10 random hex characters and are not listed anywhere crawlers read.
- The Worker now does one indexed read for a shared card or event link, and none for the marketing pages.
- If the owner later wants an opt-out per card, it is one more column and one more condition in `cardTags`.

**Evidence:** `worker/seo.js`, `worker/security.js`, `test/seo.mjs`

Related: [[D015 Profile split from cards]], [[D016 Rotating card codes]], [[D024 Signed-in frame and heavy pieces load only where used]], [[D040 Limits and claims are enforced in the write itself, and a guess is counted before it is checked]], [[D004 Aggregate-only host analytics]] · back to [[Decision Log]]
