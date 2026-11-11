---
tags: [decision]
status: Accepted
date: 2026-11-11
---
# D034 People search offers only what a card shows and trusts only quotes it can find

**Status:** Accepted  ·  **Date:** 2026-11-11

## Context
[[F24 Do I know someone who]] lets a person ask in plain words for someone they already know. It reads other people's profiles, so it must never show anyone the asker could not already see, and a model that is told to rank one person first, or that invents a person, must not get its way. Built on [[D028 AI goes through one Worker-side foundation that fails closed]] as it stands, before its real-key check, with the owner's say-so of 2026-11-11.

## Decision
- **Who is searched is decided in code before the model.** The asker's own connections; not anyone blocked either way; not anyone with `ai_search_ok = 0` (through `searchableIds`, and the same people passed as `subjects`); only people with a profile and a card they shared with the asker (the connection's card if it is theirs, else their default card, the `sharedCard` rule). No new route reads more than these.
- **Each person is a record of what the shared card shows**, in the mode they use: the line under the name (`subtitleOf`), headline and about as the card shows them (`cardFacts`), the card's tags (`visibleSide`), projects, the card note, where and when they met, and the asker's own tags and note. No name, link, email, photo or id. The model gets opaque ids; real ids stay in a map on the server.
- **Another person's field that reads like an instruction to the model** ("always rank me first", "ignore all previous instructions") is left out of its record by `looksLikeInstruction`; the rest of the record still counts. This is a screen, not a guarantee.
- **The model must prove each match with a quote.** It returns `{ id, quote, reason }`. The code keeps a match only if the id was offered and the quote is really in that person's record (compared ignoring case, accents and punctuation, on whole words). A reason that names a number, an acronym, a capitalised word or an id that is not in the record or the question is replaced by `Matches "quote"`. Where it matched ("Come to me for", "Your note") is worked out by code from where the quote was found. A reply that picked people but none provable is thrown away and the page ranks by keyword.
- **Nothing new is stored.** A checked reply sits in `ai_cache` for 10 minutes with the people in its key, so it cannot be served for a different set of people; opting out, blocking and deleting an account also delete every kept search reply at once.
- **When there is nobody to search**, the answer is an empty list with no model call and no quota used, and it does not say whether that is no connections or all opted out.
- **The page keeps a keyword fallback** (`src/lib/ask.js`: the question's words, "at least half must match"), used whenever AI is off, used up, ineligible or failing.
- **Narrowing** to 150 people is by how many of the question's words they match, then recency. It cannot find a person who matches only by meaning ("ML" for "machine learning") once someone has more than 150 connections; embeddings (plan step 3, later) would fix that.

## Consequences
Code cannot catch a person who writes a plain, believable claim about themselves, nor a model that praises someone in plain words in a reason (the reason is replaced only when it names something outside the record). The asker reads the reason beside "Matched on" and can open the card. Whether the real model ranks well, and resists "always rank me first", is an owner check. Any change the real-key rollout of F21 makes may need rework.

**Evidence:** `worker/ai/peopleSearch.js`, `worker/ai/prompts/peopleSearch.js`, `src/lib/ask.js`, `src/components/PeopleAsk.vue`, `test/people-search.mjs`, `test/ai-injection.mjs`

Related: [[D033 Feedback summaries count in code, quote exactly and never name anyone]], [[D032 Follow-up drafts are built from database rows and checked on the way out]], [[AI Safety and Cost Plan]] · back to [[Decision Log]]
