# Lanyard: Product Summary and Plan

## What Lanyard is

Lanyard makes networking events easier. Each user has a profile page, and they can make an event-specific QR code with a personal note and a chosen set of links. People save the QR as an image and show it like a digital ID card. Scanning it opens the profile right away, with no typing usernames or searching for people.

When two people connect, they can take a selfie together, and both accounts keep it. Each connection then has a face, a name, a date and an event attached, which fixes the most common networking problem: forgetting who someone was and what they do.

Each profile includes the basics (name, university, course, what you do) and a **"Come to me for"** section, for example hackathon teams, CV reviews or CAD work. This turns a list of contacts into a network you can actually use.

**Proof so far:** Lanyard was built for a UCL hackathon and demoed live to the judges, and the first real connection made on it was with one of them.

## The problem

- People meet dozens of others at events and remember almost none of them.
- One person remembers a name and the other doesn't, which is awkward, so they never speak again.
- Swapping socials means typing usernames, finding the right account and getting it wrong.
- Nobody remembers what each contact is good at, so connections are rarely used.
- Socially anxious attendees don't know who to approach.

## Who pays: the B2B model

Students and individual attendees use it for free. That free use builds the network. The paying customers are:

1. **Event hosts** (careers services, student unions, societies, conference and meetup organisers). They pay per event or on a yearly licence.
2. **Sponsors and recruiters** at those events. They pay for branded presence and opt-in access to attendees filtered by skills and "come to me for" tags. This is likely the biggest source of revenue.

### What hosts get (premium)

- Event branding and a custom theme on attendee cards
- A live attendee directory and Discovery mode for the event
- A report after the event: attendance, total connections, industries and courses represented, follow-up rate, and what attendees were looking for
- CSV export of attendees who opted in
- Optional sponsor slots

### What sponsors get

- Their brand on the event card and directory
- Search across attendees who opted in, by skill and by tag (e.g. "hackathons", "CAD", "looking for internships")
- A one-tap way to connect with interested students

### Privacy principle

Hosts see **aggregate** analytics only, never who connected with whom. Anything personal is opt-in. This matters for GDPR and for attendee trust.

## Pricing

Lanyard earns from two sides: hosts pay per event, and individuals can pay a small amount for extras. The core features stay free.

| Who | Model | What they get |
| --- | --- | --- |
| Societies, one-off hosts | Pay per event, or buy a discounted pack of events | Event room, branding, directory, analytics report |
| Careers services, frequent organisers | Yearly subscription (later, once pilots prove value) | Unlimited events, exports, sponsor slots |
| Sponsors | Package per event or per term | Branding, opt-in talent search |
| Individuals | Free: 1–2 cards. Pro: a few pounds a month | Unlimited cards, themes, featured projects |

Rule: connecting, taking the selfie and having a basic profile are never behind a paywall. They are what grows the network.

## Honest assessment: would people pay?

**Student societies:** Most have small budgets and wouldn't pay much on their own. They would use it for free, and the value comes when a society's event sponsor covers the cost. Charge sponsors, not societies.

**University careers services:** These are a realistic buyer. They have budgets and have to report on employability outcomes, so engagement data is useful to them. Sales cycles are slow, though, so start with a free pilot.

**Professional event organisers:** They might pay if it replaces something they already buy (badge printing, event apps such as Brella or Swapcard). The pitch is "cheaper and lighter than a full event app, and attendees don't have to download anything".

**Attendees:** Students would use it if the host asks them to, and the selfie memory is a real hook. Professionals already lean on LinkedIn QR codes, so Lanyard has to win on per-event cards, the selfie and "come to me for". Retention outside events is the biggest risk.

**Competitors to be aware of:** LinkedIn's built-in QR code, digital business cards (Popl, Blinq, HiHello) and event apps (Swapcard, Brella, Grip). Lanyard's angle is that it's free for attendees, needs no app, has a selfie memory and a skills-based "come to me for" section, and is priced for student and community events.

## Key feature: per-event cards

Split the **profile** from the **cards**:

- A user has one profile with all their links and details.
- They create any number of **cards**, e.g. "Careers fair", "Hackathon", "Society social".
- Each card has its own QR code, note, visible links, theme and "come to me for" items.
- Example: a professional card shows LinkedIn and portfolio only, and a social card shows Instagram.
- A card can be tied to a host's event so it picks up the event branding and directory.

This covers every use case (professional, educational, social) without separate accounts.

## Portfolio support (lightweight)

Don't host portfolios. Instead:

- Add portfolio links with automatic preview cards (title, image, description fetched once and cached)
- Allow up to three **featured projects**: title, one compressed image, one line and a link
- Keep images small (resize to WebP when they're uploaded)

This keeps pages fast on event Wi-Fi and storage costs near zero.

## Guest sign-up (keep it frictionless)

Anyone who scans a Lanyard QR can connect with just a name and a selfie. They don't need an account or an email.

- The guest's phone remembers them with a secure session saved in the browser, so they can come back later without logging in.
- At home, they finish their profile and **claim** it with a passkey (Face ID or fingerprint). Email is optional, only for recovery.
- Drop the birthday and 4-digit hex login. Birthdays are public, and 4 hex digits is only 65,536 combinations, so accounts can be guessed.

## Event check-in: why attendees will scan

Scanning the event QR has to unlock something, or people won't bother. The strongest option is to make the event QR **the ticket itself**, so checking in is how you get in.

What checking in unlocks:

- **The room:** the live directory of everyone at the event, with their cards and "come to me for" tags
- **Discovery mode:** being matched with someone who is also looking to meet people
- **The event album:** every connection and selfie from that night, grouped and saved automatically
- **Perks from the host or sponsors:** a drink or food token, raffle entry, slides and resources, job and internship links
- **A badge** on your profile showing you attended

For hosts, check-in replaces paper sign-in sheets and Eventbrite lists, and it gives them accurate attendance numbers.

## Design direction

The aim is a tool that looks deliberate, works first and gets out of the way. It should feel at home at a careers fair and at a social.

### Avoid (common vibe-coded tells)

- Inter or Geist on everything, with default Tailwind slate and indigo
- Purple-to-blue gradients, gradient text, glowing dark mode
- Glassmorphism and big soft drop shadows
- Large, uniform rounded corners on every card
- Hover lifts, scaling and shimmer effects (useless on phones anyway)
- Emoji or sparkle icons, "New" pill badges, a centred hero with three feature cards

### Concept: the physical ID badge

The card should look like a real lanyard badge: portrait shape, a punched slot at the top, a photo, and clear labelled fields like a printed pass. Everything else in the app stays quiet so the card stands out.

### Colour palette

| Role | Name | Hex |
| --- | --- | --- |
| Background | Paper | #F4F1EA |
| Text | Ink | #1B1A17 |
| Secondary text | Graphite | #6B675F |
| Lines and borders | Rule | #DAD5CA |
| Single accent (the strap) | Persimmon | #D9502B |

Paper and ink are neutral and timeless and don't look like LinkedIn. The accent is used only for the primary action and the strap. For dark venues and socials, swap paper and ink. Event themes change only the strap colour.

### Type

Lanyard is used at banking events, hackathons and socials, so the type must feel at home in all three: not corporate, not techy, not playful.

- **Atkinson Hyperlegible Next** for everything (free, Google Fonts). It is neutral, very easy to read on a phone in a dim room, and rarely used in AI-made apps. Self-host it, subset it to Latin and load only 2 weights (400 and 700).
- No monospace. Badge numbers (dates, card codes) use tabular figures.
- Badge labels (NAME, EVENT, DATE) are small capitals with slight letter spacing, like a printed pass.
- Fallback: the system font stack.

### Themes

The audience is split. Employer events (where finance, law and consulting firms dominate and pay) want things to feel restrained, while hackathons and socials want more personality. The interface stays the same and only the theme changes:

| Theme | Use | Look |
| --- | --- | --- |
| Default | Most events | Paper, ink and the Persimmon strap |
| Formal | Banking, law, consulting, careers fairs | Monochrome ink on paper, with a dark navy-grey strap (#2B3138) and no accent colour |
| Night | Socials, clubs, dark venues | Ink background, paper text, Persimmon strap |
| Host brand | Paid events | The host's colour on the strap only |

### Interface rules

- One main action per screen, with buttons near the bottom where the thumb reaches
- 1px borders instead of shadows, and a small consistent corner radius (4–6px)
- No hover effects. Show a clear pressed state only.
- Almost no animation, except a shutter flash when the selfie is taken
- Large text and tap targets, readable in a dim room
- Vue and Vite with no UI library: plain CSS variables, aiming for under 50 KB of JavaScript

## Technical next steps

1. **Domain:** move from workers.dev to a real domain managed through Cloudflare.
2. **Storage:** Cloudflare R2 for selfies and images, and D1 or KV for profile and connection data.
3. **Authentication:** keep the guest flow (name and selfie), but replace the birthday-and-hex-code login with a saved session plus passkeys. See Guest sign-up. This is urgent before any real users join.
4. **Privacy:** consent screen for selfies, the option to delete a shared selfie, and a privacy policy (GDPR).
5. **Performance:** keep profile pages very light and fast-loading, and cache them at the edge.

## Go-to-market plan

**Stage 1: free pilots (next 1–3 months)**

- Run Lanyard at 5–10 UCL events: society socials, hackathons, careers events. Pitch to your professor and to society committees.
- Measure sign-ups per event, connections per attendee, selfies taken, and whether people come back after 7 days.
- Collect short testimonials from hosts.

**Stage 2: paid per event**

- Charge hosts a flat fee per event for branding, the directory and the analytics report.
- Goal: get **one paying customer**, even a small one.

**Stage 3: sponsors and institutions**

- Sell sponsor packages within events.
- Pitch a yearly licence to university careers services using the pilot data.

## Metrics that matter

- Share of attendees who sign up at a hosted event
- Average connections per attendee
- Share of connections with a selfie
- Return visits within 7 and 30 days
- Hosts who rebook

## Updating the pitch deck for hosts

Suggested slide flow:

1. **Hook:** "You met 30 people last night. How many names do you remember?"
2. **Problem from the host's side:** events produce connections that disappear, and hosts can't show what impact their event had.
3. **Solution:** Lanyard cards, the shared selfie and "come to me for".
4. **Demo:** scan, connect, selfie, profile.
5. **What hosts get:** branding, directory, Discovery mode, analytics report.
6. **What sponsors get:** opt-in talent discovery by skill.
7. **Traction:** hackathon demo, first connection, pilot numbers once you have them.
8. **Business model:** free for attendees; hosts pay per event; sponsors and institutions pay for packages and licences.
9. **Privacy:** aggregate analytics only and opt-in sharing.
10. **Ask:** "Let us run Lanyard at your next event, free."

## Open questions to research

- What do careers services already pay for event tools?
- Which analytics would a host actually put in a report to their boss?
- How do people keep using Lanyard between events?
- How should the Discovery mode be made safe (opt-in, at the event only, report and block)?

## Build brief for the AI coding agent

This section is written for the coding agent (Hermes Agent running models on ByteDance Volcano Engine). Follow it exactly. Do not add features, libraries or visual effects that are not listed here.

### Product in one line

Lanyard is a mobile-first web app. People share a personal QR card at events. Scanning it connects two people with a shared selfie, so they remember each other's face, name and what each can help with.

### Stack (fixed)

| Layer | Choice |
| --- | --- |
| Front end | Vue 3 (Composition API) + Vite + Vue Router. No UI component library. Plain CSS with CSS variables (no Tailwind). |
| API | Cloudflare Workers with Hono |
| Database | Cloudflare D1 (SQLite) |
| Images | Cloudflare R2. Compress selfies in the browser to WebP, max 1080px, before upload. |
| Sessions | Secure HTTP-only cookie, with session records in D1 or KV |
| Login | Guest session, then passkeys (WebAuthn via SimpleWebAuthn). Email is optional, for recovery only. |
| QR | Generate with the `qrcode` library. Scan with the browser BarcodeDetector API, falling back to `jsQR`. |
| Card PNG | Drawn on an HTML canvas at 1080 × 1920 |
| Payments (hosts) | Stripe Checkout, added in a later phase |

### Hard rules

- Design for a 375px-wide phone first; desktop is a centred column up to 480px. The host dashboard alone may use wide layouts.
- Performance budget: under 50 KB of JavaScript for public pages; profile pages load in under 1 second on 4G.
- Use the design tokens and rules in Design direction. No gradients, glass effects, shadows, hover effects or emoji.
- Every screen has one primary action, in Persimmon, placed in the bottom thumb zone.
- Every image upload needs consent; any user can delete a shared selfie or a connection.
- Accessibility: text contrast at least 4.5:1, tap targets at least 44px, every input labelled.

### Design tokens

```css
:root {
  --paper: #F4F1EA; --ink: #1B1A17; --graphite: #6B675F;
  --rule: #DAD5CA; --strap: #D9502B;
  --radius: 6px; --border: 1px solid var(--rule);
  --font: "Atkinson Hyperlegible Next", system-ui, sans-serif;
  --space: 8px; /* use multiples only */
}
```

## Pages: personal users

Main app navigation is a bottom tab bar with three tabs: **My Card**, **Scan**, **People**. Settings and Edit sit behind your avatar at the top of My Card.

| Page | Route | What it does |
| --- | --- | --- |
| Landing | `/` | A live example Lanyard badge you can tap and scan, a one-line pitch, a 3-step "how it works" (Show, Scan, Remember), a button to make your card, and a link for hosts |
| Public card | `/c/:cardId` | What a scan opens: photo, name, uni and course, note, the links chosen for that card, "Come to me for" tags, featured projects. Main action: **Connect** |
| Connect flow | `/c/:cardId/connect` | Guest or signed-in user: enter name (guests only), take the selfie together (with a consent tick), optional private note, then done. The connection appears on both accounts. |
| My Card | `/app` | Your current card shown full-screen as the badge, with a card switcher, Show QR (full brightness), Download PNG, Copy link |
| Cards | `/app/cards` | List, create and edit cards: name, note, which links show, "come to me for" tags, theme, linked event |
| Edit profile | `/app/profile` | Photo, name, age (optional), uni, course, what you do, about, all links, "Come to me for" tags, up to 3 featured projects, public page on or off |
| Scan | `/app/scan` | Camera QR scanner. A person's card opens Connect; an event QR opens Check-in. |
| People | `/app/people` | Connections grouped by event and date, each showing the shared selfie thumbnail and name. Search by name, filter by tag or event. |
| Person | `/app/people/:id` | Shared selfie, their card, where and when you met, your private notes, Save to contacts (vCard), Remove |
| Events | `/app/events` | Events you checked into: the room directory, Discovery mode, event perks, the event album |
| Claim account | `/claim` | A guest finishes their profile and adds a passkey |
| Settings | `/app/settings` | Passkeys, recovery email, privacy, export my data, delete account, Pro plan |

&#91;embedded content: Core screens · wireframes\]

The badge is the hero on every screen. Each screen has one primary action, and People is grouped by event so a face, a name and the place you met always appear together.

## Pages: hosts and sponsors

| Page | Route | What it does |
| --- | --- | --- |
| For hosts | `/hosts` | Pitch, how check-in works, example report, pricing, "Run a free pilot" form |
| Event join | `/e/:code` | What the event QR opens: event name, host branding, Check in. Unlocks the room, Discovery mode and perks. |
| Host dashboard | `/host` | Your events, plan and billing, team members |
| Create event | `/host/events/new` | Name, date, venue, strap colour or theme, perks, sponsors, whether a directory is visible |
| Event live | `/host/events/:id` | Check-in QR to display or print (A4 poster and slide), live check-in count, connections made so far |
| Event report | `/host/events/:id/report` | Aggregate only: attendance, connections per attendee, % with selfies, courses and industries, top "come to me for" tags, return rate after 7 days. Export as PDF. |
| Sponsors | `/host/events/:id/sponsors` | Add sponsors, their logo and perk |
| Sponsor view (later) | `/sponsor` | Search attendees who opted in, by tag and skill |

&#91;embedded content: Host screens · wireframes\]

The host runs everything from one live screen during the event, and the report is a separate screen afterwards. Attendees only ever see the join page.

## Host data: exports and how hosts use them

Hosts pay for data they can act on after the event. Every export is built so that it respects consent.

| Export | Format | Contains | How hosts use it |
| --- | --- | --- | --- |
| Event report | PDF | Aggregate stats, attendee mix, top tags, follow-up rate | Justify budget to the student union, sponsors or their manager. Careers services use it for employability reporting. |
| Attendee list | CSV | Name, course, year, tags. Opted-in attendees only. | Mailing list for the next event, imported into their CRM or Google Sheets |
| Sponsor lead list | CSV | Attendees who chose to share their details with a named sponsor | Recruiters follow up with interested candidates. This is what sponsors pay for. |
| Event stats | CSV | Check-ins over time, connections per hour, no-show rate | Plan timing and room layout, and compare events over a term |
| Multi-event summary | PDF or CSV | All events in a term or year | End-of-year society or careers service report |

### More host features to consider

- **Check-in questions:** up to 3 custom fields (year, course, "looking for"), which feed the report
- **Registration vs. attendance:** import the Eventbrite or Luma list and show the no-show rate
- **Sponsor booth QR:** each sponsor gets its own QR code. Attendees scan it to opt in, and the sponsor sees visit counts and leads.
- **Feedback poll:** a 2-question survey sent the morning after, with results added to the report
- **Follow-up email:** the host sends one message to all attendees with slides, links and their event album
- **Term dashboard:** trends across all of a host's events
- **Team access:** committee members get roles (owner, staff, sponsor viewer)

### Data rules (GDPR)

- Aggregate stats need no consent, because no one can be identified from them.
- Named exports only include people who ticked the matching box at check-in, and each sponsor has its own box.
- Who connected with whom is never shown to hosts or sponsors.
- Event data is deleted after 12 months unless the attendee keeps it in their own account.
- Hosts sign a simple data processing agreement when they first pay.

## Pricing plan by phase

These prices are starting points to test with real hosts, not final figures. The aim early on is to find out what people will pay, not to make money.

### Phase 1: Free pilots (now to about 6 months)

- Every pilot host gets free event credits that you grant by hand. Suggested grant: 3 to 5 events per society, and a full term for the careers service.
- In return, hosts agree to share feedback, send a short testimonial, and let you use their logo and stats in your pitch.
- Show a "list price" on every free invoice (for example "Event: £50, waived") so hosts learn the value from day one.
- Free credits run out after a set date, which gives you a natural moment to ask them to pay.

### Phase 2: First paid customers (about 6 to 18 months)

| Customer | Offer | Suggested price |
| --- | --- | --- |
| Student society | Pay per event, includes branding and report | £20 to £40 per event, or a 5-event pack at a discount |
| Society sponsor | Logo on join page, booth QR, opt-in lead list | £50 to £150 per event |
| Careers service | Termly plan with unlimited events | £300 to £800 per term |
| Professional organiser | Per event, priced by attendee count | £1 to £2 per checked-in attendee, with a minimum fee |
| Individual Pro | Unlimited cards and themes | £2 to £3 per month |

Early adopter deal: pilot hosts get 30 to 50% off for their first paid year. This rewards loyalty and turns them into case studies.

### Phase 3: Mature (18 months and beyond)

- **Annual university licences:** one contract covers the careers service, the student union and all societies. Price by student population, for example £3,000 to £10,000 per year.
- **Sponsor marketplace:** employers pay to sponsor events across several unis, with opt-in talent search. This is likely the largest revenue stream.
- **Organiser tiers:** Starter, Pro and Enterprise plans based on events per month and attendee volume, with white-label and integrations (Eventbrite, Luma, CRM) on the top tier.
- Attendees stay free forever. Pro stays optional.

## Free credits: how to build them

You don't need a billing system yet. Build credits into the database from the start, so the jump to paid is just a switch.

- Add a **credits** table: id, org\_id, events\_granted, events\_used, expires\_at, reason (for example "UCL pilot"), granted\_by.
- Add **plan** to orgs: pilot, pay\_per\_event, termly, licence.
- Creating an event uses one credit. With no credits left, the host sees "Buy an event" (Stripe later, or "Contact us" for now).
- An admin page that only you can see, at `/admin`, to grant credits, extend expiry dates and see usage per host. This is better than editing the database by hand, and you won't break anything by mistake.
- Promo codes, for example UCLPILOT, that a host enters at sign-up to get credits automatically. This lets you give one code to a whole uni.
- Every event records whether it was free or paid, so you can show later that pilot hosts converted.

## Pitch deck for hosts and sponsors

Ten slides, aimed at careers services, society committees and sponsors. Keep each slide to one idea and use real pilot photos and numbers as soon as you have them.

1. **Hook:** "You met 30 people last night. How many names do you remember?"
2. **Problem for hosts:** paper sign-in sheets, no idea who actually came, nothing to show sponsors afterwards.
3. **Problem for attendees:** contacts are forgotten, and shy students don't approach anyone.
4. **Solution:** a Lanyard card, a shared selfie on every connection, and "come to me for" tags.
5. **Live demo:** scan the presenter's card, connect, then check in to the event on stage.
6. **What hosts get:** the check-in QR replaces sign-in, plus a live dashboard and an exportable report.
7. **What sponsors get:** branding, a booth QR and opt-in leads from students who want to hear from them.
8. **Traction:** pilot events, attendees, connections per person, quotes from hosts. Include the judge connection from the hackathon.
9. **Pricing:** free pilot now, a simple per-event price later. Show the early-adopter discount.
10. **The ask:** "Run Lanyard at your next event, free. We set it up for you."

For sponsors, swap slides 6 and 7 so the sponsor slide comes first. For a careers service, add a slide on GDPR and data handling, because they will ask.

## Growth pricing: societies and the word-of-mouth strategy

The logic: students move between societies, events, jobs and cities, and each one carries Lanyard with them. Societies are the cheapest way to reach them. So societies should pay close to cost, and the money comes from sponsors, careers services and organisers further up.

### The principle: break even on societies, profit higher up

A society event costs you very little: storage for selfies, a few cents of compute and your support time. Price it just above that, and treat the difference as marketing spend you control.

| Tier | Who | Price | Why |
| --- | --- | --- | --- |
| Society Starter | Verified student societies | Free for the first 3 events, then £5 per event or £25 for a term (unlimited events) | Covers your costs, and a society will actually pay it |
| Society sponsor add-on | The society's sponsor | £50 to £150 per event | The society gets Lanyard cheap, and the sponsor pays for the exposure. This is where you make money. |
| Careers service | University | £300 to £800 per term | Real budget, reporting needs |
| Professional organiser | Companies and conferences | £1 to £2 per attendee, with a minimum | Full price, no discount |

The £5 and £25 figures are my suggestions. Check them against what a society committee will say yes to without a vote, which is usually under £30.

### Keeping the loss small

- **Cap the free tier:** 3 free events per society, then pay. A cap means free never becomes the default.
- **Limit the cost per event:** compress selfies to WebP and delete event images after 12 months unless users keep them.
- **Make growth earn its keep:** a society that brings 100 sign-ups has done marketing work for you. Give it a bonus event credit for every 50 attendees who claim an account.
- **Track the real cost per event** (storage, compute, your time) and review it monthly, so "neutral" is something you measure.
- **Share the cost:** invite the society's sponsor to pay the £50 to £150 add-on, and the society then pays nothing.

### Marketing loops

- **Attendee to attendee:** every scanned card shows "Made with Lanyard" and a one-tap "make your own card" button.
- **Society to society:** a committee sees Lanyard at another society's event, and the free first events remove their objection.
- **Cross-event memory:** the People tab keeps faces from every event, which gives students a reason to return between events.
- **Campus ambassadors:** one student per society who gets Pro free and a leaderboard spot for bringing in other societies.
- **Referral credit:** a host who refers another society gets a free event, and so does the new society.
- **Host branding:** on free events, keep a small "Powered by Lanyard" line on the join page. Paid hosts can hide it.

## Verifying who qualifies for discounts

Every discount depends on one question: is this a real student or a real society? Verify once, then reuse it.

### Student verification

- Students sign up with a university email, for example one ending in ac.uk. Send a one-time link or code to prove they own it.
- Keep the guest flow. A guest can connect with no email. The university email is only needed to claim a profile and get a "Verified student" badge.
- Store only the domain and a verified flag in the public profile. Don't show the full email.
- Accept ac.uk first, then add other countries' university domains from a list you maintain. Alumni can keep access through a personal email, but lose the student badge.
- Rule of thumb: a verified student badge unlocks student pricing and "student only" events. It never blocks basic use.

### Society verification

A society gets the cheap tier when it passes two checks:

1. **A verified committee member:** the person creating the host account uses a university email.
2. **Proof the society exists:** either the society's page on the student union website (a link you can check), or an email from a union staff member confirming it. You approve it by hand at the start.

Later, automate it: once a university signs a licence or a pilot, its union can give you the list of approved societies. Then any committee member with a university email who matches a society on that list is approved automatically.

To stop abuse: one society account per union listing, the discount is tied to the verified email domain, and you can revoke it from the admin page. Two committee members must be listed so the account survives when someone graduates.

### What to add to the database

- **users:** verified\_student (true or false), email\_domain, verified\_at
- **orgs:** org\_type (society, careers service, company, other), verification\_status (pending, approved, rejected), verified\_by, union\_listing\_url, discount\_tier
- **org\_members:** org\_id, user\_id, role (owner, staff), so more than one committee member can run the account

## GDPR and legal basics

This is a practical checklist based on ICO guidance, not legal advice. Before your first paid event, have a lawyer or your university's legal clinic read it. Many universities offer free start-up support for student founders, so ask there first.

### Who is responsible for what

- **For attendee profiles and connections,** Lanyard decides why and how the data is used, so it is the controller. Attendees are the data subjects.
- **For event check-in lists,** the host decides to collect them, so the host is a controller too, and Lanyard acts as the host's processor. That is why hosts need a short data processing agreement before they pay.
- Register with the ICO and pay the data protection fee. It is small, and it is a legal requirement for organisations that process personal data.

### Lawful basis for each kind of data

| Data | Basis | Notes |
| --- | --- | --- |
| Account and profile | Contract (you give the service they signed up for) | Needed to run the product |
| Shared selfie | Consent, from both people | Tick box at capture, either person can delete it at any time |
| Event check-in | Consent or legitimate interest | Keep it to name and selfie |
| Sharing details with a sponsor | Consent, separate for each sponsor | Never pre-ticked, never bundled with joining |
| Marketing emails | Consent | A separate unticked box, easy to withdraw |
| Aggregate event stats | No personal data | No consent needed, but only show totals |

The ICO says consent has to be freely given, specific, informed and unambiguous, and that people must be able to withdraw it as easily as they gave it. A shared selfie is the most sensitive item in the product, so give it the strongest protections.

### Selfies of two people

- Both people must agree. The person taking the picture asks the other person, and a visible tick box records it.
- Either person can delete the connection or the selfie. If one deletes it, it disappears for both.
- Face images are personal data. Don't use them for face recognition or sell them. Say so in the privacy policy.
- Don't let hosts or sponsors see selfies, or who connected with whom.

### Age

- The UK sets 13 as the age of consent for online services. Many university students are 18 or older, but a few are 17, and school events are a separate case.
- Start with a rule that you must be 18 or over, and tell hosts so. Add a date of birth or age confirmation at sign-up.
- Don't run Discovery mode for under-18s at all.
- Remove the age field from public profiles unless users choose to show it. It is a safety risk and not needed for networking.

### What you must build

- A clear privacy policy in plain English, linked from every sign-up screen
- A consent screen before the first selfie and before sharing details with sponsors
- A way to download and delete your own data from settings, because people have a right to access and erasure
- A report and block button, especially for Discovery mode
- A retention schedule: event images deleted after 12 months unless kept by the users, and inactive guest sessions deleted after a set period
- A breach plan on one page: who decides, when the ICO is told (within 72 hours of a serious breach) and how users are told
- Records of consent: who agreed to what and when
- A short data processing agreement for hosts, signed when they join

### Risks to watch

- **Special category data:** don't ask for health, religion, ethnicity or similar. Custom check-in questions should be on an allowed list.
- **Storage location:** Cloudflare R2 lets you choose a region. Choose Europe or the UK, and name the provider in your privacy policy.
- **Sponsor lead lists:** this is where most complaints will arise. Keep it opt-in per sponsor, show exactly what the sponsor will see, and let people withdraw later.
- **Data law is changing:** the Data (Use and Access) Act 2025 is changing parts of UK data law, so ask your lawyer to check the current rules before launch.

### Things to do now

1. Write the privacy policy and consent text before any real users are added
2. Register with the ICO
3. Draft the host data processing agreement
4. Add the consent tick box to the selfie flow
5. Build the delete-my-data button before the first pilot

## Data model (first version)

- **users:** id, created\_at, is\_guest, recovery\_email
- **profiles:** user\_id, name, photo\_key, age, uni, course, headline, about, links (JSON), tags, projects (JSON), is\_public
- **cards:** id, user\_id, name, note, visible\_links, tags, theme, event\_id
- **connections:** id, user\_a, user\_b, event\_id, selfie\_key, created\_at
- **notes:** user\_id, connection\_id, text (private to the writer)
- **events:** id, host\_org\_id, name, date, venue, theme, perks, directory\_on
- **checkins:** event\_id, user\_id, created\_at, opted\_in\_to\_sponsors
- **orgs:** id, name, plan, members

## Additional features worth adding

**Personal (soon):**

- "You met 6 people today" prompt that evening to add notes while memories are fresh
- Save to phone contacts (vCard) with the selfie as the contact photo
- Apple Wallet and Google Wallet pass of your card, so it opens from the lock screen
- Works with poor signal: a saved copy of your card and QR that work offline
- Report and block on any profile

**Hosts (B2B):**

- Printable check-in poster and a slide for the screen
- Name badges printed with each attendee's QR code
- An email to attendees after the event, from the host, linking to their album
- Several events per organisation with team logins

**Later:**

- NFC tap to connect
- Sponsor talent search
- Integrations with Eventbrite and Luma for attendee lists

## Build order

1. Domain, R2 storage, guest sessions and passkeys
2. Public card, connect flow with selfie, People and Person pages
3. My Card, cards manager, Edit profile, PNG download
4. Landing page with the design system applied everywhere
5. Events: the event QR, check-in, the room directory and the event album
6. Host dashboard, Create event, Event live, report
7. Stripe billing, Pro plan, sponsors
