---
tags: [technical, host, billing]
---
# Host Portal and Billing

**AI feedback summary (F23).** At the top of an event's Feedback tab and in its Report, a short summary of the written answers: the figures (average, share who would come again, written by the page from the Worker's numbers), a paragraph, what worked and what to change with "about N people", and word-for-word quotes, with Regenerate (3 a day) and Copy. Below 5 written answers to one question it says "Summary appears after 5 written answers". It is written automatically once when the feedback window closes, and the owner is emailed the paragraph, labelled as written by AI. Included for every host. See [[D033 Feedback summaries count in code, quote exactly and never name anyone]].

## Host accounts and organisations
- The portal is its own site, `host.lanyd.fyi`, with its own account: an email that receives a sign-in code ([[Auth and Sessions]], [[D020 Host accounts separate from attendee accounts]]). It has nothing to do with a person's Lanyard card.
- Setup, each step saved on the server: email code, then details (full name, use case, frequency, size, referral), then the Host Terms, then "under my own name" or an organisation of type society, institution or company. Every step has Back and Sign out.
- Before F10 (2026-11-10) a host account was the attendee account. Those accounts, with their organisations and events, are wiped by the host reset (option B, `scripts/reset-hosts.mjs`, owner step); invoice records are kept.
- **Societies and institutions need admin approval** (university email, society proof). Companies and individuals pay standard prices straight away.
- Roles: owner, staff, sponsor_viewer. Ownership can be transferred to another host account by its email (new owner must accept, and gets an email). Team invites can name the colleague's host email (emailed to them, only that account can use it) or be a plain code. Support tickets cover leader or email changes; an approved email change also changes how that account signs in.
- Admin (`/admin`): host account list and search, switch an account off, attach an organisation with no members to a host email.

## Event lifecycle
Create event (in five steps, F30; uses a credit) → event QR + rotating code → attendees check in → live view → end event → report, feedback, summary email. Events can be duplicated.

## Create event in steps (F30)
Five screens at `/?step=N`: Basics, Look, At the event, Questions, Review. Next checks only that step; the server's checks still decide. The half-made form is kept in this tab's session storage per host and organisation and cleared on Create, Cancel and sign-out; nothing is saved on the server before Create. "Start from" copies an earlier event: the later steps show what it brings (read-only), and Create sends only the name and times as before. See [[D037 Create event in steps keeps the old request and one draft per host and organisation]].

## Credits
`credits` table with expiry; first org gets 3 free events; societies get 1 free event a week up to 200 check-ins; packs defined in `worker/plans.js` (`HOST_SKUS`). See [[Pricing]].

## Promo codes for event credits (F20)
An admin makes a host code on `/admin` (credits, days they last, a required limit, optional kinds of organisation). A host opens `host.lanyd.fyi/redeem/CODE` (or Billing, "Have a promo code?"), sees what it gives, and presses Add. Credits are added to the host's own organisation at once (reason `promo:CODE`, granted by `promo`, lasting the code's days from that day). A society or institution still waiting for approval has its claim **held** (it takes a slot; Billing says so) and the credits are issued in the same transaction as the admin's approval. Once per organisation and once per host account, enforced by the database. Anyone who cannot use a code gets one message whatever the reason. Attendee Plus codes and host codes cannot be redeemed in each other's flow. See [[D031 Host promo codes are one table, one claim per organisation and one generic refusal]].

## Billing without Stripe
1. Host submits a request under Host portal → Billing (sku, quantity, contact, PO).
2. Admin lists open requests with a D1 query, invoices, receives payment.
3. Admin inserts a `credits` row and sets the request to `paid`. Exact SQL is in `DEPLOY-V2.md`.
See [[D009 Manual invoicing before Stripe]].

## Emails
From `hosts@lanyd.fyi`: sign-in codes, application received and decided, ticket decisions, transfers waiting, team invites, and the recap a day after an event. All link to the host portal's pages (`host.lanyd.fyi/`, `/events/:id`, `/account#join`).

## Present and print (F19)
The live tab has two buttons. **Present** opens `/events/:id/present` in a new tab: a page for a screen or projector with the event name, venue and time, a large QR (the main site's check-in address, never `host.*`), the code, "Or go to lanyd.fyi/e/CODE" and how many people have checked in. It asks the same host-only `/live` route every 15 s (not while the tab is hidden) and shows nothing but the event's own details and that one count, so a room can see it ([[D004 Aggregate-only host analytics]]); a new check-in code appears without a reload. **Print poster** opens `/events/:id/print`: one A4 portrait page of black ink on white with a thin strap rule, a QR about 100 mm wide, the code and three steps. Both are reachable only by a signed-in host of the event's organisation (the page's data comes from `/live`: 401 signed out, 404 for another organisation's event). There is no link that works without signing in (see the plan note's question).

## Named attendance (F31)
In step 3 of Create event and on the Details tab a host can switch on **Keep a list of who checked in** for that event ([[D038 Named attendance is per event, shown on the check-in page and pre-ticked by the owner's choice]]): off by default, per event, with two optional extras from a fixed list (the person's verified email, and their card) and a required "why" line shown to attendees with the organisation's name. A copy of an earlier event never carries it over. The Live tab then shows **Who checked in** (names and check-in times of people who left that tick on, and for each only the extras they left ticked) with a CSV; the report tab links to the same CSV. Everything else a host sees stays aggregate: the live counts, the report, its CSV, the Present page and the poster name nobody. The list and its CSV are in the host's data download (`attendeeLists`), are deleted 12 months after the event ends, when the host switches the list off, when a person unticks or deletes their account, and by the host reset. The host is responsible for what it downloads: the Host Terms say to use it only for the reason given, keep it safe, delete it when done and take someone off when asked.

## Drops (F32)
A **Drops** tab on the event page. A host makes a drop of one of four kinds (the same text for everyone, one each from a pasted list, random from a list with or without reuse, a voucher), pastes the items, and then sees only counts: "120 loaded, 37 given, 83 left" or "84 of 120 used". After the upload an item can't be read back; the host can download the ones nobody has been given (decrypted, five an hour, audited), delete them, stop the drop, add more or delete the drop. A voucher's staff PIN is shown once and can be replaced. At an event that keeps a list of who checked in (F31) the host can also open "Who has it": the names of people on that list, with the number of their item in the host's own paste (never the item), and withdraw one person's item; everyone else is counted, not named. See [[D039 Drops are sealed with a Worker key, given by one conditional write, and vouchers are marked with a staff PIN]]. With named attendance on, "Who has it" also offers **Withdraw and replace** (F34) for one-each and random-without-reuse drops: the old item is withdrawn and the person is given the next unused one in one step; with none left nothing changes and the host is told (they can still Withdraw). A person who was withdrawn earlier can be given a new one with the same button.

## Data hosts get
Aggregate report (attendance, connections per person, courses/tags), CSV, feedback results, optional sponsor leads (opt-in only). Hosts never see who connected with whom. The one exception is an event's own named list, for people who left that tick on (F31, above). See [[D004 Aggregate-only host analytics]] and [[D038 Named attendance is per event, shown on the check-in page and pre-ticked by the owner's choice]].

Related: [[Integrations and Email]], [[API Surface]]
