---
tags: [roadmap, research, events, ai, privacy]
id: F61-research
date: 2026-11-24
status: For the owner
---
# F61 Research: Matching options

Task F61.1 of [[F61 Matching profiles for better suggestions]]. A research note with no code, for the owner to choose from. Back to [[00 Master To-Do]].

The owner asked (2026-11-24): "Perhaps later on, we can also start designing an algorithm which profiles people depending on their profile to suggest people with each other better." Using what a person's profile says to decide who they are shown to is **profiling** under UK GDPR, so this note gives the privacy side as much weight as the algorithm.

Not legal advice. The privacy part should go to a lawyer or legal clinic with the [[F60 Intention at check-in and who to meet for everyone]] assessment, before anything here is turned on at real events.

---

## 1. What exists today

### How Who to meet orders people now
Since [[F60 Intention at check-in and who to meet for everyone]] ([[D054 Everyone checked in can be suggested unless they untick Suggest me, shown only what their card shows]]), everyone checked in to an event can be suggested to the others there while the event is on, unless they untick "Suggest me to people here". The host can switch it off for an event (`events.suggest_on`).

The list is built each time someone opens it, in three layers:

| Layer | File | What it does |
| --- | --- | --- |
| Who can be shown | `worker/suggest.js` `suggestCandidates()` | People checked in to the same event, Suggest me ticked, the event on for both, not blocked either way, not the viewer. Everything after this works only on these people. |
| What each person shows | `worker/presenceMatch.js` `visibleFields()`, `worker/inCommon.js` `visibleSide()` | Only the fields their mode shows (student: institution and course; career: company and role, institution as "Studied at"), the default card's headline and its tags. A field the profile keeps but hides is never read ([[D026 Shared ground is worked out from what each person shows, and never stored]]). |
| Plain order, no AI | `worker/suggestMatch.js` `rankSuggest()` | +3 for each useful word of the viewer's intention found in what the other person shows or in their intention; +2 for each word of the other person's intention found on the viewer's card; +1 for each shared-ground fact from [[F16 Shared ground without AI]] (same tags, course, company, institution). Ties go to the more recent check-in. Top five, each with one reason ("Into Finance", "You both mention investing", "Looking for design, which is on your card"). With nothing in common, three people in a steady order as "Say hi to someone new". |
| AI order | `worker/ai/suggestRank.js`, `worker/ai/prompts/suggestRank.js` | When AI is on for the viewer, the model re-orders the same people. It is sent `{ me: { intention, line, headline, tags }, people: [{ id: p1..., intention, line, institution, headline, tags }] }` inside the data fence: no name, photo or real id; people who switched AI search off are not sent; fields that read like instructions are left out. At most 100 people reach the model, narrowed by shared words. Each pick must carry a quote that code finds in that person's record (F24's `verifyMatches`, [[D034 People search offers only what a card shows and trusts only quotes it can find]]). It runs by itself when the list opens, at most once per person per event every 20 minutes, inside F25's quota (3 per event Free, 10 Plus). |

The words of the notice and their version are in `src/lib/suggest.js` (`SUGGEST_NOTICE`, `SUGGEST_DETAIL`, `SUGGEST_VERSION = "2026-11-24"`). The F17 routes (`rank()`, `suggest()` in `worker/presenceMatch.js`) are still in the Worker, but no page calls them.

### What is stored, and for how long
| Data | Where | Kept |
| --- | --- | --- |
| Suggest me choice and intention (120 characters) | `event_suggest` (migration 0040) | 48 hours after the event ends, then purged (`purgeSuggest`); goes with the account and the host reset |
| Each choice, with the exact words and version | `consent_log`, scope `event_suggest:<event>` | 6 years, like every record of a choice |
| The AI's checked picks (opaque ids, quote, reason) | `ai_cache`, feature `who_to_meet` | 20 minutes; deleted at once on any untick, block, opt-out, changed intention or purge |
| When the AI last ranked a person's own list | `event_suggest.ai_at` | With the row |
| AI usage counts, tokens, cost (no text) | `ai_usage`, `ai_daily` | 13 months |
| Profile and card fields that matching reads | `profiles`, `cards` | Until the person changes them or deletes the account |

**Nothing about a person is stored between events for matching.** The plain order and shared ground are worked out on each request and never stored. **Nothing records which people were shown to whom, or whether a suggestion led to a connection.** The list route writes only rate-limit counters. Connections made during an event are recorded for host figures (`event_connections`, migration 0033), but they are not linked to suggestions.

### Gaps that matter for F61
- **Words only, without AI.** The plain order matches words, folded for plurals. "Fintech" does not meet "finance", and "co-founder" does not meet "startup". Only the AI order understands meaning.
- **Large events.** At 300 or 1,000 people, only the 100 people who share the most words with the viewer reach the model. Someone who fits in meaning but shares no word is never considered.
- **No special category screen.** Nothing in `worker/` screens tags, intentions or headlines for faith, health, sexuality, politics, trade union or ethnicity words before they are matched or sent to the model (a search of `worker/` for such terms finds nothing). A tag such as a faith society's name can make a reason today ("Into ..."). This already applies to F60 and is in scope for F61 whatever option is chosen.
- **Budget at large events.** Production's app budget is `AI_DAILY_BUDGET_USD = "2"`. A 1,000-person event at the Free quota ceiling would cost about $1.80 in AI ranking (see section 3), close to the whole day's budget. Above it, every AI feature falls back to its plain version until the next day. It fails safely, but it fails during the event.

---

## 2. Signals that could help

"On the card" means the person already shows it to anyone they hand their card to. The brief's rule: **nothing kept that their card does not show**, and nothing inferred a person would not expect.

| Signal | Where it would come from | On their card now? | Sensitivity | Verdict |
| --- | --- | --- | --- | --- |
| **Field or industry** | Student: `profiles.course`. Career: `company` and `role`. Also the headline and tags. A fixed field label ("Finance", "Law", "Design") would be new: picked by the person, or proposed from their text. | Course, company and role: yes, in the chosen mode. A field label: no, unless we show it. | Low. A label proposed from text is an inference ("Works at a bank, so Finance"). It is mild and expected, but the person should see it and be able to change it. | Use. Picked or confirmed by the person, and shown. |
| **Role or study level** | `profiles.role` (career), `profiles.year` (student; the card subtitle shows it). A level ("first year", "postgraduate", "early career", "senior") would be new. | Role and year: yes. A level: no. | Low to medium. Study year is a rough stand-in for age. Seniority can feel like ranking people. | Use only as a soft match ("wants to meet people further on"), never to leave anyone out. |
| **Intention** | `event_suggest.intention`, written at check-in for that event | Shown in their suggestion entry at that event, not on the card | Medium. Free text can say a lot: "meet other students of my faith", "looking for work after being made redundant". | Already used. Keep it per event, 48 hours. Screen it for special category words before matching. |
| **"Looking to meet" kinds** | New: a short fixed list the person picks from (founders, investors, recruiters, designers, engineers, students in my field, people in my industry, mentors, co-founders) | No (new) | Low with a fixed list. Free text would be medium. | Use. A fixed list, picked by the person, shown in their entry. |
| **Goals** | New: a short fixed list (find an internship or job, hire, find a co-founder, learn about a career, find a mentor, meet peers, sell or partner). Also mapped from the intention's words. | No (new) | Low to medium. "Looking for a job" is mildly sensitive, so show it only at the event, never on the public card by default. | Use per event, or as a profile default the person sets. |
| **Tags** ("come to me for") | `profiles.tags`, `cards.tags` | Yes (the default card's tags) | Usually low, but tags can name faith, LGBTQ+, political, disability or ethnic societies, which are special category data by inference. | Use, after a special category screen. |
| **Shared events** | `checkins` across events (F16 already uses past shared events for "Both at ...") | No. F16 shows only the connection's own event or a joined directory, and only past events. | Medium. Attendance history can reveal beliefs or health (a faith society's dinner, a support network's meet-up). It is also data the person did not put on their card. | Do not use for matching. Keep F16's narrow use on card pages only. |
| **Outcome: a suggestion led to a connection** | New: a record of who was shown to whom at an event, joined to `event_connections` | No | Medium. Behavioural data about who someone chose to talk to. | Use only as anonymous counts per kind of match, never per person (option C1). |
| **Outcome: follow-up** | `notes.followed_up_at` (a private mark one person keeps about a connection), messages | No; private to one person | High for this purpose. It is someone's own private note, and using it to rank a third party is a new purpose nobody would expect. | Do not use. |
| About text, projects, photos, check-in answers, notes, email domain, verified student, age | Profile, check-ins, notes | Some on the card | Mixed. Long free text is the likeliest to hold special category data. Check-in answers belong to the host's questions. | Do not use. F60 does not use them either. |

---

## 3. Options

### Cost assumptions
- Prices are those in [[AI Safety and Cost Plan]] section 2 (Claude Haiku 5.5: $0.10 per million input tokens, $0.50 per million output; Workers AI `bge-m3`: $0.012 per million input tokens, 10,000 free Neurons a day), plus Vectorize as read on the web below. **All prices as read on 2026-11-24. Check before relying on them.**
- One AI ranking call is about 650 tokens of system prompt, plus about 50 for the viewer, plus about 45 for each person sent (at most 100), with about 250 tokens out. At 50 attendees that is about $0.0004 a call; at 300 or 1,000 it is about $0.0006, because only 100 people are sent. This matches the plan's "Who to meet (100 people) ~$0.0006".
- Typical use: 60% of attendees open the list and the AI ranks it twice for each of them (the 20-minute rule over a two-to-three-hour event), so 1.2 calls per attendee. The ceiling is the Free quota, 3 calls per attendee per event.
- Embeddings: about 80 tokens of card text and intention per person, embedded twice per event (check-in and one edit).
- Vectorize: 1,024 dimensions for `bge-m3` (the model's published size; the Workers AI pricing page does not state it, so check). One query per list opening.
- D1 row reads and writes are not priced here. They are of the same order as today's list.

**Today's AI order (the baseline every option keeps or replaces):** typical 50 people $0.02, 300 people $0.22, 1,000 people $0.72 per event. At the Free ceiling: $0.06, $0.54 and $1.80.

### Option A: a fixed taxonomy, scored in code
**How it works.** A short fixed list in one shared file (say `src/lib/matchTaxonomy.js`, read by the Worker and the pages, like `src/lib/suggest.js`):
- about 20 fields ("Finance", "Law", "Software", "Design", "Health sciences", "Policy", "Media", "Climate and energy"), each with a list of synonyms ("fintech", "banking", "investment", "accounting" all lead to Finance);
- about 8 goals ("Find an internship or job", "Hire", "Find a co-founder", "Find a mentor", "Learn about a career", "Meet peers", "Find partners or clients");
- about 10 "looking to meet" kinds.

Each person's field is **proposed in code** from what their card shows (course, role, company, headline, tags, through the synonyms). They can confirm or change it on their profile and choose goals and kinds, all optional. The intention's words map onto goals and fields through the same synonyms. Scoring is pure code, alongside today's points: a goal that fits the other person's offer both ways (I want to hire, they want a job; I want a mentor, they are senior in my field) scores highest. Then a looking-to-meet kind that fits their field or role, then the same field, then today's word and F16 points. The reason names the match: "You want to meet founders; they are building a startup", "Both in finance".

**What is stored.** Only what the person picks: field, goals and kinds on the profile (until they change them or delete the account), in their data download. The proposed label is worked out on request and never stored, as F16 does (D026). A per-event goal, if offered, sits on `event_suggest` and goes after 48 hours.

**Cost per event.** $0 more than today at 50, 300 and 1,000 people. The AI order on top, if kept, costs the baseline above. (Asking a model to propose the field would cost about $0.00008 a profile, $0.08 for 1,000 people. Not recommended: the synonyms do the job, and code is easier to check.)

**Quality.** It fixes the plain order's biggest gap ("fintech" now meets "finance") and adds the two-way fit (hire and job, mentor and mentee) that word matching cannot see. Coarse: it cannot tell "battery recycling" from "solar finance" within Climate. Synonym lists need upkeep. Without AI it is a clear step up; with AI, the AI still handles nuance.

**Explainability.** High. Every point comes from a named pick or field, so "why you were suggested" is exact and testable.

**Build size.** M (the list and synonyms, an additive migration for three profile fields, optional picks on the profile and the check-in panel, the scorer and reasons, tests).

**Cloudflare.** Nothing new.

### Option B: text embeddings of what a card shows, compared per event
**How it works.** At check-in, and when someone edits their intention or card, the Worker builds one short text from what that person shows (line, headline, visible tags, intention, after the special category screen) and turns it into a vector with Workers AI `bge-m3`. The vector goes into a Vectorize index, filed under that event. When the list opens, the viewer's vector is compared with the event's vectors for the people `suggestCandidates()` allows. The closest people form the shortlist: either the 100 sent to the AI (replacing today's word-based narrowing) or the plain order. Blocks, unticks and the host switch still decide who can be shown, in code, before and after the vector search.

**What is stored.** One vector per person per event (a numerical summary of the text, still personal data), and the event id. It is deleted with the `event_suggest` row 48 hours after the event, at once on an untick, a block or account deletion, and by the host reset. Nothing is kept across events; the cost of embedding again is trivial. The text that was embedded is already in the person's download (card and intention). The download should also say that a vector was kept for the event.

**Cost per event.**
| | 50 | 300 | 1,000 |
| --- | --- | --- | --- |
| Embeddings (`bge-m3`) | 8,000 tokens, $0.0001 | 48,000 tokens, $0.0006 | 160,000 tokens, $0.0019 |
| Vectorize queries and storage (beyond any included allowance) | about $0.001 | about $0.007 | about $0.023 |
| AI order on top (as today) | $0.02 | $0.22 | $0.72 |

Embedding 1,000 people uses about 170 Neurons, well inside the free 10,000 a day. Vectorize's included monthly allowance (30 million queried dimensions on Workers Free, 50 million on Paid) covers many events of this size, so in practice the vector part is $0.

**Quality.** It finds matches by meaning, also across languages (`bge-m3` is multilingual), and it fixes the large-event gap: the right 100 people reach the model. On its own it measures how alike two texts are, not whether two people fit. Two people who both want a job look alike but are less useful to each other than a hirer and a job seeker. So it is a good shortlist and a weak final order.

**Explainability.** Low on its own: "your texts are 0.82 similar" is not a reason. The reason must come from A, F16 or the AI's checked quote. A suggestion with no checkable reason should fall back to "Say hi to someone new", never to an invented one.

**Build size.** L (an embedding step with a stub for tests, a Vectorize index, its life cycle tied to the 48-hour rule, the shortlist, fallbacks when Workers AI or Vectorize fails, tests). Owner steps on Cloudflare.

**Cloudflare.** A Workers AI binding (`[ai]`) and a Vectorize index (`wrangler vectorize create`, cosine, 1,024 dimensions, a metadata index on the event id), both owner steps. Workers AI is a different service from the current AI Gateway to Anthropic path. Whether its calls can go through the same Gateway for logging and limits, and Cloudflare's terms on Workers AI data, should be checked; they are not confirmed here. A Vectorize-free variant keeps small vectors on the `event_suggest` row and compares them in the Worker. That works up to a few hundred people, but reads about 4 MB per list at 1,000 people (1 MB if shrunk to 8-bit values).

### Option C: learning from outcomes
Two very different versions.

**C1, anonymous counts (recommended form).** When a list is shown, the Worker records, for that event only, which opaque suggestion ids were shown to the viewer, at which position, and *what kind* of match each was (goal fit, same field, kind fit, word match, F16 fact, AI pick, or nothing in common). When a connection is made during the event between a viewer and someone they were shown, that shown row is marked. After the 48-hour purge, each event's rows are folded into **counts per kind of match and position, with no person and no event**: "goal fit at position 1: shown 412, connected 61". Then the rows are deleted. Those counts tune A's weights ("goal fit leads to a connection three times as often as same field") and tell the owner whether suggestions help at all, which nothing does today.

**C2, per-person learning (not recommended).** Keep, for each person, what kinds of people they connected with across events, and rank their future lists from it ("you tend to connect with designers"). This is profiling in the full sense: it infers preferences from behaviour, keeps them indefinitely and is invisible on the card. It would need consent, a place to see and delete the learned profile, and a strong reason. At Lanyard's size it would also learn little: a person meets a handful of people per event.

**What is stored.** C1: shown rows per event (opaque ids, position, kind of match, connected or not), 48 hours, in nobody's view and only the person's own rows in their download; then anonymous counts kept for 24 months. Counts with fewer than 10 shown should not be read on their own. C2: a learned profile per person, until withdrawn or the account is deleted.

**Cost per event.** $0 AI at 50, 300 and 1,000 people. About 1.2 row writes per attendee when lists are opened, and the counting runs in the existing daily purge.

**Quality.** C1 needs volume. With five kinds of match and five positions it needs a few thousand shown suggestions (roughly 10 to 20 events of 100 people) before the counts mean much. Top positions are tapped more whatever their quality, so compare like with like (the same position), or now and then swap positions 2 and 3. A connection is a weak sign of a good suggestion (people connect for many reasons), but it is the only honest one Lanyard has without asking. C2 would be noisy and slow to learn.

**Explainability.** C1: the reason is still A's or F16's named match. The weights are global and can be published ("matches on goals come first because they led to the most connections"). C2: low, and uncomfortable to read.

**Build size.** C1: M to L (an additive table, a write on each list, the join on connection, folding in the purge, counts on the admin page, tests). C2: XL.

**Cloudflare.** Nothing new (D1 and the existing daily cron).

### Option D: a staged hybrid
**A now, with C1's counting from day one. B later, only if events regularly pass about 150 people. C1's counts then tune A's weights.** The AI order stays on top, as today, inside the same quotas. Each stage is useful alone, and none needs anything stored about a person that they did not pick themselves or that outlives the event.

| | 50 | 300 | 1,000 | Build |
| --- | --- | --- | --- | --- |
| Stage 1: A + C1 counting | $0 + AI baseline $0.02 | $0 + $0.22 | $0 + $0.72 | M to L |
| Stage 2: + B as the shortlist | + about $0.001 | + about $0.008 | + about $0.025 | L |

### Summary
| | A Taxonomy | B Embeddings | C1 Counts | C2 Per person | D Staged |
| --- | --- | --- | --- | --- |
| Extra cost per event at 1,000 | $0 | under $0.03 | $0 | $0 | $0, then under $0.03 |
| Quality without AI | Much better | Better shortlist, weak order | Tunes others | Noisy | Best of the three |
| Explainability | High | Low alone | High (global) | Low | High |
| Stored about a person | What they pick | A vector, 48 hours | Shown rows, 48 hours | A learned profile | What they pick; 48-hour rows |
| Inference | Proposed label, shown | Implicit in the vector | None about a person | Yes | Proposed label, shown |
| Cloudflare | None | Workers AI, Vectorize | None | None | None, then B's |
| Build | M | L | M to L | XL | M to L, then L |

---

## 4. Privacy assessment under UK GDPR

### Is it profiling?
Yes. Article 4(4) defines profiling as automated processing of personal data to evaluate personal aspects of a person, in particular to analyse or predict things such as work, preferences, interests or behaviour. Mapping someone's card to a field and goals, and ordering people by how well they fit, evaluates interests and work. Today's word matching is already light profiling. Every option here is profiling; C2 is the most, A with only picks the least. The ICO says profiling "can be part of" an automated decision but is a separate thing ([ICO, Rights related to automated decision making including profiling](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/rights-related-to-automated-decision-making-including-profiling/), read 2026-11-24).

### Article 22: not a solely automated decision with legal or similarly significant effect
Article 22 applies only where a decision is based solely on automated processing **and** has a legal or similarly significant effect. The ICO's example is an automatic refusal of an online credit application. Who to meet is not that:
- **No effect on rights or access.** Nobody is refused anything. Someone who is not suggested still checks in, sees their own list, can be found in the room and can walk up to anyone. Suggestions are a reading aid, five names on a phone.
- **A person decides.** The viewer chooses whether to talk to anyone. Nothing is sent, booked or shared automatically.
- **Nothing reaches hosts, sponsors or recruiters.** Hosts see two counts hidden under 3 ([[D004 Aggregate-only host analytics]]).

**What would change this:** showing rankings to recruiters or sponsors, ordering candidates for jobs or places, or using the profile to decide who may attend. At a careers fair, a ranked list for an employer could approach "similarly significant". That must stay out of scope, and the DPIA should say so.

### Article 21: the right to object
Where the basis is legitimate interests, Article 21(1) gives people the right to object to profiling. We must then stop unless we have compelling legitimate grounds, which we would not claim. Article 21(4) requires the right to be brought to their attention explicitly and separately, at the latest at the first contact. The ICO says organisations must draw attention to the right clearly. The F60 untick on the check-in page, effective on the next request, is that route today. F61 needs:
- the same untick, with wording that mentions matching;
- **a global setting**, because A keeps picks on the profile and C1 counts across events. Settings, Privacy and data: "Suggest me at events" (on by default), which unticks every event at once and stops the picks being used. The per-event untick stays. See the owner decision below;
- a way to keep being suggested while not having picks used ("clear my picks"), which A gives naturally.

### Lawful basis options
| Basis | Fits | Notes |
| --- | --- | --- |
| **Legitimate interests** (as F60 now) | A, B, C1 | Helping people at a networking event meet is what they came for. A, B and C1 use only what the card shows, what the person picked and short-lived event data. Needs an LIA (extend the F60 one in [[UK GDPR Audit 2026-11-01]]), the notice, and the objection route above. |
| **Consent** (opt-in, unticked) | C2, and any special category use | Cleanest for anything inferred and kept, but lower take-up. A pre-ticked box is not valid consent (as already recorded for F31). |
| Contract | None | Matching is not objectively necessary to exchange cards; the ICO reads "necessary" narrowly. Do not use. |

### Notice wording needed (draft, for the owner and a lawyer)
On the check-in page, replacing `SUGGEST_NOTICE` (bump `SUGGEST_VERSION`):
> **Suggest me to people here.** We match you with others checked in using what your card shows, what you hope to get from this event and any picks you've made. Others see your name, headline and tags, and your intention if you write one.

Small print, added to `SUGGEST_DETAIL`:
> Matching runs on our servers and doesn't decide anything about you. Untick to stop it here, or turn off Suggest me at events in Settings to stop it everywhere.

On the profile, next to the picks:
> Optional. Used only to suggest people at events you check in to, and shown to them there. We never guess these for you without showing you.

Privacy Policy, section 8f: a paragraph on profiling (what is used, that it is ordering suggestions and nothing else, the logic in one sentence, no legal or similar effect, the right to object and how). With C1: a paragraph saying that which suggestions led to a connection is kept for 48 hours, then only as anonymous totals. This is a material change: bump the Terms and Privacy version with the F60 change already pending.

### Opt-out
- **Per event:** the existing Suggest me untick at check-in, on the hub and in Settings. It already removes the person from every list on the next request and clears kept AI picks.
- **Global:** needed once anything lives on the profile or counts across events (A's picks, C1). A setting `users.suggest_ok` (or similar), default on to match the owner's F60 choice, recorded in `consent_log` (scope `event_suggest_all`). When off, no `event_suggest` row is created as suggested, and picks are never read. AI search's own switch (`ai_search_ok`) keeps deciding whether someone is sent to the model.

### No special category data, and how to keep it out
Article 9 data (racial or ethnic origin, political opinions, religious or philosophical beliefs, trade union membership, genetic, biometric, health, sex life or sexual orientation) is not asked for, but it can arrive in free text, tags and event names (a faith society, an LGBTQ+ network, a disability group, a political society, a union). Matching on it, even implicitly, is processing it for a new purpose. Rules for any option:
1. **The taxonomy holds no special category value.** No faith, health, sexuality, politics, union or ethnicity fields, goals or kinds. A test reads the list.
2. **One sensitive-terms screen** (say `src/lib/sensitiveTerms.js`) applied in code before matching, before embedding and before anything reaches the model. A tag, intention phrase or headline phrase that matches is dropped from matching, but still shown on the card where the person put it (their choice). Reasons can never contain a screened word. It applies to today's F60 path too.
3. **The system prompt** adds one fixed line: never match on, or mention, religion, health, sexuality, politics, ethnicity or union membership.
4. **No event history** in matching (a past event's name can reveal a belief or a condition).
5. **Residual risk:** a list cannot catch every phrasing ("Friday prayers group"), and embeddings can group such tags together even when no word matches. That is one reason B comes after the screen and is not the first stage.

### Nothing inferred a person would not expect
- A's proposed field is shown to the person, with change and remove, before it is used. Nothing hidden is kept.
- No inference from behaviour about a person (C2 is out).
- No use of a field their card hides (`visibleFields()` stays the only reader), the about text, notes, follow-up marks, messages, photos or check-in answers.
- No seniority or study year used to leave anyone out.

### Retention per option
| Option | What | Kept |
| --- | --- | --- |
| A | Picks on the profile | Until changed or the account is deleted; cleared at once by the global switch's "clear my picks" |
| A | Proposed field | Not stored (worked out on request, as D026) |
| A | A per-event goal, if offered | With `event_suggest`, 48 hours after the event |
| B | One vector per person per event | 48 hours after the event; at once on untick, block, account deletion, host reset |
| C1 | Shown rows (opaque ids, position, kind of match, connected) | 48 hours after the event, then folded and deleted |
| C1 | Anonymous counts per kind of match and position | 24 months (proposed), no person or event |
| C2 | A learned profile per person | Not recommended |
| All | Each choice in `consent_log` | 6 years, as now |

### Data download and deletion
- **Download:** A's picks are in the profile row (already exported whole) and named in the download's notes. B: the download says that a vector of your card text was kept for each event, for 48 hours (the text itself is already there; the numbers mean nothing to a person and can be left out, which a lawyer should confirm). C1: your own shown rows for events in the last 48 hours, with their kinds of match. The anonymous counts are not personal data and are not in anyone's download.
- **Deletion:** the account cascade covers profile picks, `event_suggest` and the shown rows. Vectors in Vectorize do not cascade, so the account deletion and the purge must delete them by id, and a test must prove it. Counts hold no person, so there is nothing to delete.

### Is a DPIA needed?
**Yes.** Article 35(3)(a) (systematic and extensive profiling with legal or similarly significant effects) does not strictly apply, for the Article 22 reasons above. But the ICO's list of processing likely to be high risk includes large-scale profiling, data matching (combining data from more than one source: card, intention, picks, outcomes), innovative technology such as AI (counted with another criterion) and tracking behaviour (C1 records who you connected with after a suggestion). The audience is mostly students, and the default is on. The ICO also says that if in any doubt, do one ([ICO, When do we need to do a DPIA?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/), read 2026-11-24). It should extend the F17, F21 and F60 drafts in [[UK GDPR Audit 2026-11-01]], not start again.

**DPIA outline (draft, for F61.x):**
1. **What and why:** ordering up to five suggestions per person at an event from what their card shows, their intention and optional picks; purpose: in-person introductions. Not shown to hosts, sponsors or recruiters.
2. **Data:** card fields in the chosen mode, default card headline and tags, intention, picks; (B) a vector per event; (C1) shown rows for 48 hours, then anonymous counts. Excluded: about text, notes, follow-ups, messages, photos, check-in answers, event history, hidden fields.
3. **People:** adults 18+ ([[D012 18 plus only]]), mostly students; everyone checked in at events with the host switch on.
4. **Lawful basis and LIA:** legitimate interests; extend the F60 LIA with the profiling purpose, the picks and the counts; objection route per event and global.
5. **Necessity and proportionality:** picks optional; fixed lists rather than free text; proposed labels shown; nothing kept that the card does not show except the person's own picks; 48-hour event data; anonymous counts.
6. **Risks and what reduces them:** special category leaking into matching (taxonomy rule, sensitive-terms screen, prompt line, no event history; residual risk named); unexpected inference (labels shown, no C2); being approached by someone unwanted (untick, blocks both ways, report); a provider seeing data (AI as today; Workers AI terms to confirm for B); over-retention (the table above, purge tests, Vectorize deletion test); creep towards decisions (no rankings to hosts, sponsors or recruiters, stated in Host Terms); feedback loops in C1 (comparing like with like, the occasional swap of positions 2 and 3).
7. **Rights:** information (notice and section 8f), access (download), erasure (cascade and Vectorize deletion), objection (untick and global switch), rectification (edit picks).
8. **Residual risk and sign-off:** expected low to medium; owner and lawyer sign-off before turning it on at real events; review after 10 events.

---

## 5. Recommendation

**Option D, staged: build A with C1's counting now; add B only when events regularly pass about 150 people; tune A's weights from C1's counts after about 15 events.** Do not build C2.

Why:
- **A gives most of the gain for no running cost and full explainability.** It fixes the plain order's word-only gap ("fintech" and "finance"), and it adds the two-way fit (hirer and job seeker, mentor and mentee) that neither word matching nor similarity can see. It works when AI is off, over budget or not allowed, which is most of the time on Free today.
- **C1 is the only way to know whether any of this helps.** Today nothing measures it. Counting from day one costs nothing and keeps no person past 48 hours.
- **B solves a problem Lanyard may not have yet.** It matters when more than 100 people compete for the model's shortlist. It costs pennies, but adds two Cloudflare services, a new kind of stored personal data and implicit grouping of sensitive tags. Wait for evidence.
- **Privacy:** nothing inferred is kept, the person sees and controls every pick, and nothing outlives the event except the picks they chose and anonymous totals. That is the most defensible form of profiling for a mostly student audience on a default-on basis.
- **Whatever is chosen,** the sensitive-terms screen should be built first, because today's F60 path needs it too.

The brief says F61 should not be built until F60 has run at real events. Stage 1 can be built once the owner agrees. It should be **switched on** only after F60 has run at two or three real events and the lawyer has read the DPIA.

### Owner decisions needed
1. **Which path?**
   - (a) Staged: A with anonymous outcome counts now, embeddings and tuning later on evidence (recommended)
   - (b) A only, no counting
   - (c) A and embeddings (B) together now
   - (d) Nothing yet; wait until F60 has run at real events
2. **Where do the field, goals and kinds come from?**
   - (a) Code proposes a field from the card; the person confirms or changes it; goals and kinds only if they pick them (recommended)
   - (b) Only what the person picks; nothing proposed
   - (c) Code maps from the card silently, without showing it (not recommended)
3. **Where do the picks show?**
   - (a) In their suggestion entry at events only (recommended)
   - (b) Also on their card, for anyone they hand it to
   - (c) Nowhere; used only for matching (not recommended: breaks "nothing kept that the card does not show")
4. **The opt-out?**
   - (a) Keep the per-event untick and add a global "Suggest me at events" in Settings, on by default (recommended)
   - (b) Per-event untick only, as now
   - (c) A global setting, off by default (opt-in) for profile-based matching
5. **Learning from outcomes?**
   - (a) Anonymous counts only; nothing about a person kept after 48 hours (recommended)
   - (b) No outcome data at all
   - (c) Per-person learned preferences, with opt-in consent (not recommended)
6. **Special category words in tags and intentions?**
   - (a) Screen them out of matching and the AI, still shown where the person put them; apply to F60 now (recommended)
   - (b) As (a), and also refuse to save them in intentions
   - (c) Rely on the prompt's instruction only
7. **Policy and sign-off?**
   - (a) One Terms and Privacy version bump covering F60's section 8f and F61, and lawyer review of the DPIA before it is turned on (recommended)
   - (b) Bump for F61 separately, when it ships
   - (c) No bump; update "Last updated" only (not recommended: a material change)

---

## 6. If approved: draft tasks and acceptance checks

Assumes decision 1 (a). Migration and decision numbers are "the next free one" at the time (0042 and D055 are the latest as of this note; another item may take the next).

### Tasks
- [ ] F61.2 Decision note recording the owner's answers (next free D number), linked from [[Decision Log]] and [[F61 Matching profiles for better suggestions]]; F61's plan note rewritten from this research.
- [ ] F61.3 Sensitive-terms screen: one shared list and function (`src/lib/sensitiveTerms.js`), applied to tags, headline and intention in `rankSuggest()`, `candidateRecord()` and `viewerRecord()` (so F60 benefits now); one fixed line in `SUGGEST_RANK_SYSTEM` (bump `PROMPT_VERSION`); tests, including negatives.
- [ ] F61.4 Taxonomy: `src/lib/matchTaxonomy.js` (fields with synonyms, goals, looking-to-meet kinds, the two-way goal pairs), no imports; a test that no value is in the sensitive list; `proposeField()` from visible fields only.
- [ ] F61.5 Storage and picks: additive migration (profile picks), profile editor section (proposed field with change and remove, optional goals and kinds), an optional "Looking to meet" row on the check-in panel; picks in the data download; tests.
- [ ] F61.6 Scoring and reasons: taxonomy points in `rankSuggest()` (goal fit both ways, kind fit, same field) above word and F16 points; reasons that name the pick; picks shown in the entry (allowed keys test updated); the AI record gains `field`, `goals` and `kinds` (fenced, as data).
- [ ] F61.7 Global switch and notice: `users` column or table, Settings toggle, `consent_log` scope, `suggestCandidates()` honouring it; new `SUGGEST_NOTICE` and `SUGGEST_DETAIL` wording and version; tests.
- [ ] F61.8 Outcome counts (C1): an additive table for shown rows (opaque ids, position, kind of match, connected), written on each list; marked when a connection is made during the event; folded into anonymous counts and deleted in the daily purge; counts on `/admin` (hidden under 10); in the person's own download while held; tests with a fixed clock.
- [ ] F61.9 Paperwork: DPIA in [[UK GDPR Audit 2026-11-01]] (outline above), the F60 LIA extended, Privacy Policy section 8f (version bump only on the owner's word), [[Privacy and Data Retention]], [[Data Model]], [[API Surface]], [[Features]]; browser check with four test accounts (a hirer, a job seeker, a designer, one with a faith society tag) at 375 and 1280 px, light and dark.
- Later, only on evidence: F61.10 embeddings shortlist (option B) for events over about 150 people, with Vectorize deletion tests and the owner's Cloudflare steps; F61.11 weight tuning from the counts after about 15 events.

### Acceptance checks
- [ ] The owner has chosen, recorded as a decision note, before any code.
- [ ] A person whose card says "fintech analyst" is suggested to someone whose intention is "meet people in finance", with the reason naming finance, with AI off.
- [ ] A person who picked "Hire" is ranked above a same-field person for someone whose goal is "Find an internship or job", and the reason says so.
- [ ] A tag naming a faith, health, sexuality, political, union or ethnic group never makes a match, a reason, or a field in the AI request (search the captured body), and still shows on the card.
- [ ] A proposed field is shown to its owner before it is used; removing it stops it being used on the next request.
- [ ] Global switch off: the person is in nobody's list at any event and their picks are not read; per-event untick still works alone.
- [ ] Shown rows are gone 48 hours after the event ends (fixed clock) and only anonymous counts remain, with no user, suggestion or event id.
- [ ] Picks and shown rows are in the person's download; account deletion removes both.
- [ ] Hosts see nothing new (`test/who-to-meet-all.mjs` host-facing file rule still passes).
- [ ] `npm test` passes; public pages within budget.

---

## Sources (web)
- ICO, "Rights related to automated decision making including profiling": https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/rights-related-to-automated-decision-making-including-profiling/ (read 2026-11-24)
- ICO, "When do we need to do a DPIA?": https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/ (read 2026-11-24)
- Cloudflare, Vectorize pricing: https://developers.cloudflare.com/vectorize/platform/pricing/ (as read on 2026-11-24, check before relying: Workers Free 30 million queried and 5 million stored dimensions a month; Workers Paid 50 million queried included then $0.01 per million, 10 million stored included then $0.05 per 100 million; queried dimensions counted as (queries + stored vectors) x dimensions)
- Cloudflare, Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/ (as read on 2026-11-24, check before relying: `bge-m3` $0.012 per million input tokens, 1,075 Neurons per million; 10,000 free Neurons a day, then $0.011 per 1,000 Neurons; output dimensions not stated on the page)
- Haiku 5.5 and `bge-m3` prices used in the cost tables are those in [[AI Safety and Cost Plan]] (checked there on 2026-11-10).

Related: [[F61 Matching profiles for better suggestions]] · [[F60 Intention at check-in and who to meet for everyone]] · [[D054 Everyone checked in can be suggested unless they untick Suggest me, shown only what their card shows]] · [[F16 Shared ground without AI]] · [[F24 Do I know someone who]] · [[F17 Event presence and who to meet]] · [[F25 AI who-to-meet ranking]] · [[D035 AI who to meet only re-orders the list F17 already offers]] · [[AI Safety and Cost Plan]] · [[Privacy and Data Retention]] · [[Data Model]] · [[UK GDPR Audit 2026-11-01]] · back to [[00 Master To-Do]]
