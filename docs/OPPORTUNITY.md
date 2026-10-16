# Lanyard — Opportunity & Competitive Brief

_Hackathon pitch reference. Evidence verified 2026-10-14 via company sites + Bing. Vendor market-size figures are estimates and labelled as such; we did not pay for a market report._

## Executive verdict: **conditional GO — narrow freshers wedge is open**

The QR "digital business card" category exists and is crowded at the **top (enterprise/B2B)** but has visibly **abandoned the consumer/student end**. Popl and HiHello — the two best-known consumer QR-card brands — have both repositioned into B2B lead capture / enterprise brand management. **Nobody in the category owns:**

1. a student/freshers-specific identity,
2. a **reciprocal connection that remembers the context** ("how we met"), or
3. an **AI follow-up** tied to that context.

That specific combination is the wedge. It is a feature-narrow but demo-strong opening — appropriate for a hackathon, with a credible (if uncertain) path beyond it.

---

## 1. Competitive landscape

### QR / digital business card apps (the category Lanyard visually resembles)

| Product | What it is today | Model | Reciprocal connect + "how we met" note? | Student/freshers? | AI follow-up? |
|---|---|---|---|---|---|
| **Popl** (popl.co) | Repositioned as **"AI GTM platform for event lead capture"** — scan badges, enrich contacts, sync to **CRM** for B2B sales teams | B2B SaaS / teams, hardware tags | No — one-way lead capture into a sales pipeline; the *seller* captures the *lead* | No | "AI" = lead enrichment/routing, not personal follow-through |
| **HiHello** (hihello.com) | Repositioned as **"Professional Presence Platform for enterprise brands"** — digital cards, **email signatures**, backgrounds; Personal tier free forever | Freemium → Business/Enterprise | Exchange exists, but no contextual "how we met" memory | No | No |
| **Blinq / Linqe / Tappy / vCard-QR / Beaconstac / QRCraft** | Generic digital cards + NFC tags/QR; several sell physical hardware | Freemium + hardware; some B2B/enterprise | Mostly one-way card share; some have a basic "request contact back" | No | No |

**Key insight:** the whole category monetised by moving **upmarket into B2B sales/HR**, leaving the consumer peer-to-peer use case under-served. Their mental model is *"capture a lead,"* which is asymmetric and transactional. Lanyard's model is the opposite: **two peers mutually saving each other, plus the memory of why.** That is a meaningfully different product, not a reskin.

### Student / university networking (the job Lanyard actually does)

- **Handshake** — university careers/jobs platform; institutional, recruitment-focused, admin-heavy. Not for "I met someone cool at the social."
- **LinkedIn (incl. university features)** — the incumbent everyone *eventually* uses, but a poor fit for freshers: feels premature/careerist, no in-the-moment context, and "connecting with the person you just met" still means finding the right name among duplicates later.
- **PeopleGrove / Graduway (now Gravyty)** — **institution-licensed** alumni mentoring & engagement SaaS. Universities pay; students don't choose them. Heavy, formal, mentor/mentee — not freshers-week peer discovery.
- **Unibuddy** — university **recruitment** (prospective students chat to current students); pre-enrolment, not peer networking on campus.

**Gap confirmed:** there is no lightweight, student-owned, *in-the-moment* tool built around the physical freshers/fairs ritual. The enterprise tools are sold to universities; the QR-card tools chase sales teams. The exact moment — two freshers at a fair/social who want to remember each other — is unowned.

---

## 2. The wedge in one sentence

> **A physical lanyard badge students already wear, made tappable/scannable — that saves a mutual connection *with the context of how they met*, and drafts the follow-up so the relationship survives the night.**

The three defensible (for a hackathon) differentiators:
1. **Contextual memory** — "Come to me for…" specialties + a timestamped "how we met" note. No QR-card app stores *why* two people matter to each other.
2. **Ritual fit** — designed around the lanyard/lock-screen/freshers-fair moment, not a sales conference.
3. **Zero-install + ephemeral handshake** — scan opens a mobile web profile instantly; the P2P exchange relay self-destructs and never stores the card.

**Cold-start caveat (be honest in the pitch):** a network tool needs density. The bridge tactic is that Lanyard is useful **with a density of one** — a single profile + QR already works as a sharable card/note/follow-up tool before any network exists. Anchor on **one event or one hall of residence**, not "all students everywhere."

---

## 3. Ephemeral retention — is "hold it then delete it" a feature?

**Verdict: real, but frame it correctly. It is a privacy *posture* and trust-builder, not — on its own — a moat.**

- It maps directly onto **GDPR Article 5**:
  - **5(1)(c) data minimisation** — only collect what's needed;
  - **5(1)(e) storage limitation** — don't keep personal data longer than necessary.
  Source: gdpr-info.eu / EUR-Lex, Regulation (EU) 2016/679.
- For a **student audience (and the universities/socs that might endorse it)**, "we don't hoard your contacts, and the handshake vanishes in minutes" is a genuine **trust differentiator vs. Popl-style lead capture**, whose entire business is *retaining and enriching* contact data for sales.
- **Critical distinction — what is ephemeral vs. durable:**
  - **Ephemeral (auto-delete):** WebRTC signalling / SDP / ICE candidates. These are pure rendezvous plumbing. ✅ implemented via KV `expirationTtl: 300` (5 min). Nobody needs these after the cards exchange.
  - **Durable but user-controlled:** the person's profile and their mutual connections. **Do NOT auto-delete these** — they *are* the product value (the living network). Instead give explicit ownership: export + one-tap "delete all my data," and clear retention language.
- **Storage-cost angle:** essentially moot on Cloudflare KV free tier for hackathon scale — auto-expiry is good hygiene, not a cost saving worth pitching as economics. Lead with **privacy/trust**, mention cost only as a footnote.

**Recommended product framing (better than "we delete when caught up"):**
> **"Transient by design. The connection hand-off self-destructs in 5 minutes and never touches a database. Your profile and network are yours to export or erase at any time."**

Avoid promising to auto-delete connections "once caught up" — that's ambiguous (who decides?), technically fuzzy, and destroys value. Make the *plumbing* ephemeral and the *data ownership* explicit instead.

---

## 4. Monetisation (fits near-zero-cost Cloudflare stack)

Students won't pay early; institutions/sponsors might later. In priority order:

1. **Free consumer wedge** (build density first) — profiles, QR, mutual connections, basic follow-ups.
2. **Sponsorship / events** — branded fresher-fair and society event packs (white-label badge templates, event-specific "how we met" tags). This is where money already flows during freshers.
3. **Institution/society B2B (the PeopleGrove-adjacent but far lighter play)** — paid dashboards for student orgs/careers services: who connected at which event, opt-in analytics. Long-term, speculative.
4. **Freemium Pro** (low priority) — custom card themes, multiple cards, CRM/Notion export, unlimited AI drafts.

Avoid hardware-margin plays (NFC tags) — Popl/Tappy already compete there and it adds fulfilment the hackathon can't support.

---

## 5. How to position against the obvious objection ("isn't this just HiHello/LinkedIn?")

- *"HiHello/Popl capture a **one-way sales lead**; Lanyard saves a **two-way relationship with the context of how you met**."*
- *"LinkedIn is for people you already know professionally. Lanyard is for the person you met **tonight**, before you've forgotten their name."*
- *"The handshake is peer-to-peer and gone in minutes — we're not building a contact database to sell to anyone."*

---

## 6. Decision criteria (post-hackathon)

- **Proceed** if, at one real freshers event, ≥40% of pairs who scan both save the connection and ≥1 in 3 use/open a follow-up within 48h.
- **Pivot/stop** if people scan once, never return, and see it as "just a QR card" — that means the *context + follow-up* layer isn't landing, and you're competing head-on with free HiHello.
- Validate the durable moat as the **contextual connection graph**, not the QR renderer (commodity).

---

## Sources
- Popl positioning — https://popl.co/ ("AI GTM Platform for Event Lead Capture"; badge scan, enrichment, CRM sync)
- HiHello positioning & pricing — https://www.hihello.com/ , https://www.hihello.com/pricing ("Professional Presence Platform"; free Personal; Business/Enterprise)
- PeopleGrove — https://www.peoplegrove.com/ (higher-ed engagement/mentoring, institution platform)
- Unibuddy — university recruitment (peer chat for prospective students)
- GDPR principles — https://gdpr-info.eu/ , EUR-Lex Reg. (EU) 2016/679, Art. 5(1)(c) & (e)

_Market-size estimates intentionally omitted rather than guessed: broad "professional networking" and "digital business card" TAM figures circulating online come from vendor/SEO content with conflicting definitions. None changes the narrow-wedge conclusion; if needed post-hackathon, buy or cite a single named report with its definition and date._
