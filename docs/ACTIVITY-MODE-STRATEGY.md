# Lanyard strategy analysis: from consumer app to event-platform (B2B2C)

**Date:** 2026-10-16
**Status:** Analysis only — no product code changed. This doc responds to feedback proposing a B2B "Activity Mode" for event organizers.
**Question this answers:** *Does this change the project's direction? Should Lanyard serve event hosts instead of individuals, or both — and how would that work?*

---

## 1. TL;DR verdict

Your dad is **right about where the money is**, but this is not a pivot — it's an **extension into B2B2C**.

- Individuals (students, even most professionals) will almost never pay a subscription for a networking app. The consumer layer is a **distribution surface**, not a business.
- Event organizers **do** have budgets and a concrete reason to pay: they are measured on how much networking their event generated, and they sell sponsor packages on exactly that data.
- The smart move: **keep the free personal product exactly as the attendee-facing app**, and add an **organizer layer** (events, watermarked passes, post-event analytics) that sponsors the whole system. Organizers become the payer; attendees remain free users.
- But: this market **already exists and is crowded**. Lanyard's edge would have to be "ridiculously lightweight, no install friction, works for a 50-person meetup" — the bottom of the market the incumbents ignore and overprice.
- **Do not rebuild anything yet.** The next 4–6 weeks should be customer interviews and 3–5 free pilots, not engineering. Billing, Pro subscriptions and enterprise tiers are premature until one organizer has actually used an event report to renew or sell a sponsorship.

The financial projection (¥2–5M ARR, ¥15M valuation, break-even in 2.5–3 years) is a **plausible-shaped story but invented numbers**. It is useful as a vision; it must not drive product decisions yet.

---

## 2. What the proposal actually is (decoded)

Three businesses stacked in a pyramid:

| Layer | Customer | What they pay for | When |
|---|---|---|---|
| **Free campus / personal** | Students, attendees | Nothing — they generate the network and the data | Now (built) |
| **Activity Mode (B2B)** | Event organizers | Event page, branded/watermarked QR, post-event networking analytics, CRM export | Year 1–2 (first revenue) |
| **Pro subscription (C2B)** | Sales, BD, recruiters, freelancers | Unlimited cards/notes, multiple card sets, custom domain, CRM export | Year 2–3 |
| **Enterprise SaaS (B2B)** | Companies with event/field teams | Seats, team dashboards, admin, integrations | Year 3–4 |

Core insight in the feedback, worth naming explicitly:

> Selling to organizers also **solves the cold-start problem** that kills consumer networking apps. An organizer mandating "this is the official networking tool" creates the density that individuals could never create alone. At a real conference, nobody scans unless *everyone* is on it — and the organizer is the only actor who can guarantee that.

That is the strongest argument in the proposal, and it is correct.

---

## 3. Does it change the direction?

**Adds a payer; doesn't replace the product.** Concretely:

- **What stays:** personal cards, 4-char codes, code+birthday login, scan/manual entry, hello notes, together-selfies, threads, the People screen. This is what attendees interact with.
- **What gets added:** an *event context* around an exchange:
  1. Organizer creates an event in a dashboard → gets an event page + join code/link.
  2. Attendees join the event (one tap, no new account needed — they already have a Lanyard).
  3. While at the event, their pass carries the event watermark/branding frame.
  4. Scans during the event are logged **scoped to that event**.
  5. After the event, the organizer gets an anonymous aggregate report: exchange counts, network density, popular topics/industries, time-of-day heatmap, export.
- **What monetizes:** organizer event fees first; individual Pro later; seats last.

One sentence: **Lanyard personal = how attendees exchange; Activity Mode = what organizers learn from those exchanges.**

---

## 4. Why the B2B instinct is sound

1. **Budget exists.** Event organizers spend money on badges, lanyards (the physical kind), lead-retrieval scanners, apps, and sponsorship decks. Networking ROI is a known line item.
2. **Value is measurable and repeatable.** "3× more exchanges than paper cards" is exactly the kind of number a buyer puts in a renewal deck.
3. **Distribution is event-bound.** One organizer decision installs the product in front of 100–300 relevant users at once.
4. **It compounds.** Every event produces case-study data → easier pitch to the next organizer → more users → Pro conversion pool.
5. **The current product is 70% of the attendee experience already.** Cards, codes, scanning, reciprocal connections and photos exist. The missing 30% is mostly the *event entity + scoped logging + dashboard*.
6. **Watermarking is cheap.** Passes are already canvas-rendered — an event logo band/frame is a small change, and it doubles as sponsor inventory.

---

## 5. Honest problems and risks (the part to read twice)

### 5.1 The market is not empty
- **Event networking/lead retrieval:** Swapcard, Brella, Bizzabo, Grip, PheedLoop, Whova, Cvent, Hopin-era survivors. They already do matchmaking, analytics and CRM export — mostly for big events at enterprise prices.
- **Digital business cards:** Blinq, HiHello, Popl, Linq already have free + Pro (~$3–8/mo) + Business/Teams tiers.
- **China specifically:** 31会议, 活动行, 会小二 on the events side; 名片全能王 (CamCard) and 脉脉 on cards/network; **WeChat is the default behavior** ("just add me on WeChat") and the elephant in every China-focused plan.
- **Implication:** "QR business card with analytics" is not novel. The wedge must be **segment and price**: zero-setup, works without downloading an app, priced for the 50–300 person events the incumbents don't bother with.

### 5.2 Two-sided cold start is replaced by a sales problem
Organizer adoption removes attendee cold-start — but now you must **sell to organizers**, which is a real go-to-market job: outreach, demos, procurement, onboarding, support during a live event (high stakes: if it breaks at their event, you lose a reference customer). A student solo dev can run 3–5 pilots; running 50 paid events/year needs a co-founder or sales help.

### 5.3 Privacy is a product feature, not fine print
- "Who exchanged with whom" is a **social graph of attendees**. Individual-level exchange data is arguably the attendee's data, not the organizer's.
- Aggregated, anonymized reporting (exchange counts, density, industry distribution, heatmaps) is defensible; per-person leaderboards ("most popular attendee") feel creepy and run into GDPR/UK GDPR and China's PIPL.
- Requires: clear attendee consent at event join, an opt-out, organizer data-processing terms, and strict aggregation thresholds (don't report groups < N).
- **Privacy can be flipped into a selling point** (the proposal already hints at this): work-specific identity beats handing over your personal WeChat. "A scannable work ID that isn't your personal social account" is genuinely valuable in professional settings, especially post-COVID in both the UK and China.

### 5.4 "Paper cards are enough / WeChat is enough" is a real objection
Answer it with **measured pilot data**, not argument: exchanges per attendee via Lanyard vs. paper-card events; contact-reach-through rate after 7 days; sponsor satisfaction. This is precisely why the free-trial-for-case-study strategy is right — the data *is* the sales asset.

### 5.5 KV is fine for pilots, not for analytics
Cloudflare KV is a key-value store; "exchange counts by hour by industry" will be painful queries. Cloudflare **D1** (SQLite, also free tier) is the natural home for event-scoped exchange events and aggregation. Plan the schema migration before the first paid event, not after.

### 5.6 Pro-tier feature list needs sharpening
"Multiple card sets, custom domain, CRM export" copies Blinq/HiHello. A solo student can't out-feature them. The Pro tier should grow out of observed power-user behavior from event pilots — don't pre-build it.

### 5.7 The numbers are not evidence yet
Break-even 2.5–3 years, ¥2–5M revenue, 70% margin, ¥15M valuation — these assume a sales motion, renewal rate and pipeline that don't exist yet. Rough reality check:

- 50 events/year × ¥1,000 avg = **¥50k** — a side project, not a company.
- 300 events/year × ¥1,200 = ¥360k, plus 1,000 Pro subs × ¥199 ≈ ¥200k → ~¥560k. *That's* year-2/3 territory, and 300 events means a real sales operation.
- Software gross margins >70% are realistic; the binding constraint is **distribution**, not margin.

Use the pyramid as a narrative for mentors/investors; use actual pilot data for decisions.

---

## 6. Proposed product shape (for later — do not build yet)

**Activity Mode MVP (the smallest thing a pilot organizer needs):**
1. Organizer event creation: name, date, logo/brand color, join link.
2. "Join event" flow for attendees; pass gains an event frame/watermark while the event is live.
3. Server logs exchange events: `{eventId, a, b, ts}` (plus optional self-declared industry/role tags captured at join).
4. Post-event dashboard (auto-generated, shareable link):
   - total exchanges, exchanges per attendee, % of attendees who connected
   - network density / heatmap by time
   - industry/role mix from tags
   - benchmark line vs. prior pilot events
5. CSV/CRM export.
6. Consent + opt-out copy at join.

**Explicitly deferred:** payments, seats/admin, matchmaking/AI recommendations, custom domains, Pro gating, mobile apps.

**On the current stack:** Worker + D1 (new) for events/analytics, KV stays for profiles/photos, one new organizer-gated UI section. Estimated build for the MVP: ~2–3 focused weeks *after* the first pilot requirements are known from interviews.

---

## 7. Validation plan before writing Activity Mode code

The cheapest thing that can fail should fail first — in conversations, not code.

1. **Interview 10–20 organizers in the next 4 weeks.** Start where access is free: UCL society leaders, department/careers-fair organizers, London tech meetups, small hackathons, society conferences. Ask: how they measure networking today, what they tell sponsors, what tools they pay for, what "a successful event" means in numbers.
2. **Line up 3–5 free pilots** in exchange for "official networking tool" placement + a testimonial + permission to publish aggregate numbers.
3. **Instrument the *existing* app minimally** (no organizer UI needed): tag exchanges with an event code you hand out manually, then hand-build the first "report" as a PDF/Notion page. This fakes the dashboard to test whether organizers actually value it.
4. **Measure the headline claim:** exchanges per attendee vs. their paper-card/WeChat baseline; 7-day follow-through. This number becomes the sales deck.
5. **Pitch the 6th event at ¥500–2,000 (or £50–200 in the UK market).** A "no" at £100 is more informative than ten "sounds interesting"s.
6. Only then build Activity Mode, pricing pages, and billing.

### Pricing sanity
- ¥500/event (≤100) / ¥1,500 (≤300) is reasonable for **Chinese SMB conferences**.
- UK/EU SMB event budgets are higher: £100–300/event basic, £400–800 with reporting is testable.
- Per-attendee ¥5–10 only works at scale (large expos); ignore until inbound demand.
- Pro: ¥199/yr (~£22/yr) is aggressive vs. Blinq/HiHello; price only after you see repeat daily usage from event-derived users.

---

## 8. Decision points for Yinjun

1. **Primary market: UK/university first, or China?** They differ more than currency — WeChat dominance vs. email/LinkedIn norms, sales channels, privacy law. Given you're physically at UCL with direct organizer access, **UK campus → SMB UK events is the pragmatic beachhead**; China can follow with a localized partner. (Your dad's pricing reads as a China strategy; the product mechanics are universal.)
2. **Solo vs. team:** B2B needs sales + ops during live events. If pilots show pull, a co-founder (biz/sales) becomes the bottleneck before engineering does.
3. **Keep the consumer brand playful?** "lanyard" and the volt/ink identity work for both; enterprise buyers buy the report, not the vibe, so no rebrand needed.
4. **What would make you stop?** Set kill criteria now — e.g., "if fewer than 2 of 5 pilot organizers say they'd pay £100+ for the report, revisit."

---

## 9. Immediate next actions

- [ ] Keep current app live and unchanged at the workers.dev URL; let hackathon interest land on it.
- [ ] Write a 1-page organizer pitch + a mock "post-event report" (design artifact, no code).
- [ ] Book 10 organizer interviews; log objections verbatim.
- [ ] Run 1 manual pilot with an event code and a hand-made report.
- [ ] Decide UK vs. China beachhead.
- [ ] Only after signal: scope Activity Mode MVP with D1-based event analytics.
