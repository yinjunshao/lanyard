---
tags: [decision, moc]
---
# Decision Log

Newest context first. Each decision has its own note (context, decision, consequences, evidence). Dates for old decisions are the date of the document where they were recorded or the nearest commit; treat as approximate. Add new ones by copying any note.

| ID | Decision | Status |
| [[D028 AI goes through one Worker-side foundation that fails closed]] | Every AI feature calls one Worker-side client with a kill switch, quotas, budget, per-person cache, fallbacks and injection helpers; off in production until the owner turns it on | Accepted |
| --- | --- | --- |
| [[D032 Follow-up drafts are built from database rows and checked on the way out]] | The draft route reads everything the model sees from the database for the asker's own connection, takes only choices from the browser, shows a template whenever AI is not available, and counts only (migration 0026). Email is always offered as a channel. | Accepted |
| [[D034 People search offers only what a card shows and trusts only quotes it can find]] | The model sees opaque ids and what each connection's shared card shows; a match stands only if its quote is really in that person's record; nothing new is stored | Accepted |
| [[D033 Feedback summaries count in code, quote exactly and never name anyone]] | The model writes words only; the Worker counts the different people behind each point, keeps exact quotes from questions at least 5 people answered, drops any sentence with a number or a name, stores one row per event (migration 0027) and removes it with the answers. Anonymous answers cannot be withdrawn, so deleting an account changes nothing. Written automatically once when feedback closes. | Accepted |
| [[D031 Host promo codes are one table, one claim per organisation and one generic refusal]] | Host codes share `promo_codes` (audience host), a claim is one transaction with database rules per organisation and host account, unusable codes all give one answer (no waiting list), held claims issue on approval, the reset wipes claims | Accepted |
| [[D030 Present and the poster share one route, one address and one QR path]] | Present and the A4 poster show only the event and one count, take the main site's check-in address from one helper, draw the QR as an SVG path and share one route to keep the entry's chunk list the same; no link that works without signing in | Accepted |
| [[D029 A preview is the real component fed from the same data]] | A preview draws the real page component from the same data function, does nothing and is inert; hosts never use attendee routes for it | Accepted |
| [[D026 Shared ground is worked out from what each person shows, and never stored]] | Shared ground is built on each request from only what each person shows the other (their mode's fields and the shared card's tags), never stored, never shown to hosts | Accepted |
| [[D025 Event status is worked out from the clock, never stored]] | Upcoming, ongoing or ended is worked out on each request by one shared helper, never stored; the hub routes are attendee-only | Accepted |
| [[D024 Signed-in frame and heavy pieces load only where used]] | The /app frame, the QR library and the card's connection panel load only where used; Options API off; the 50 KB budget is checked by `npm test` | Accepted |
| [[D023 Welcome steps keep their place on the server and count only]] | The place in the welcome steps is kept on the server; the funnel is daily counts with nothing about who; the route is paid for by loading the email and passkey code only when tapped | Accepted |
| [[D022 Record how a connection was made, once and without guessing]] | How two people met is stored once per connection, never guessed for old ones, and never shown to hosts | Accepted |
| [[D021 Institution list from knowledge, loaded when the picker opens]] | The UK institution list is agent-written and needs owner review; it loads only when a picker opens; typing your own always works | Accepted |
| [[D020 Host accounts separate from attendee accounts]] | Host accounts have their own email-code sign-in, sessions and cookie on host.lanyd.fyi; existing host accounts reset | Accepted |
| [[D019 Settings pages load from the layout, not the router]] | One `/app/settings/:page?` route; `Settings.vue` loads each page, so public pages load no extra route code | Accepted |
| [[D018 Hand-built pickers outside the shared Vue chunk]] | Custom pickers by hand; no Teleport, `useId`, `<slot>` or `defineAsyncComponent` where public pages would pay | Accepted |
| [[D017 Use academic network for pilot access]] | Ask professor for intros, access, resources | Proposed |
| [[D016 Rotating card codes]] | Codes rotate every 3 days | Accepted |
| [[D015 Profile split from cards]] | One profile, many cards | Accepted |
| [[D014 Separate host subdomain]] | host.* serves only /host | Partly superseded by D020 |
| [[D013 No hardware or NFC for now]] | Web and QR only | Accepted |
| [[D012 18 plus only]] | Adults only, no Discovery for minors | Accepted |
| [[D011 Retention limits]] | 12 months selfies, 30 days guests | Accepted |
| [[D010 Paper, ink and one strap colour]] | Badge design language | Accepted |
| [[D009 Manual invoicing before Stripe]] | Invoice / PO first | Accepted |
| [[D008 Societies near cost, profit higher up]] | Free society tier with caps | Accepted |
| [[D007 Validate before building]] | Pilots before features | Partly overtaken |
| [[D006 UK campus beachhead first]] | UK before China | Accepted (in practice) |
| [[D027 Event presence is opt-in, private and deleted 48 hours after the event]] | Face photo shown only to opted-in people at the event while it is on | Accepted |
| [[D005 Shared selfie needs both consents]] | Dual consent, either deletes | Accepted |
| [[D004 Aggregate-only host analytics]] | Hosts see totals only | Accepted |
| [[D003 Guest first with passkeys]] | No account to connect | Accepted (host part superseded by D020) |
| [[D002 Move from KV to D1 and R2]] | v2 architecture | Accepted |
| [[D001 Hosts pay, attendees free]] | B2B2C model | Accepted |

## Decisions still to make
See [[Open Questions]]: market (UK only?), co-founder, pricing validation, domain/trademark, kill criteria numbers.
