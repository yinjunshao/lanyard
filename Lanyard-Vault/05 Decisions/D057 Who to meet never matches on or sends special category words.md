---
tags: [decision, privacy, events, ai]
status: Accepted
date: 2026-11-24
---
# D057 Who to meet never matches on or sends special category words

**Status:** Accepted  ·  **Date:** 2026-11-24  ·  Narrows what [[D054 Everyone checked in can be suggested unless they untick Suggest me, shown only what their card shows]] matches on (not what it shows)

## Context
The F61 research ([[F61 Research Matching options]], section 4) found that Who to meet ([[F60 Intention at check-in and who to meet for everyone]]) matched people on every tag their card shows and on their intention, and sent both to the AI. A tag such as a faith society, a disability group, an LGBTQ+ network, a political society, a union or a heritage society could become a reason ("Into ...") and reach the model. That is special category data (UK GDPR Article 9) used for a new purpose with no Article 9 condition. Asked what to do, the owner chose **"Screen them, fix F60 now"** (2026-11-24) ([[F69 Keep sensitive words out of who to meet]]).

## Decision
- **One list,** `src/lib/sensitiveTerms.js`, with no imports, read by the Worker and the tests and by no page: words and short phrases for religion or belief, health and disability, sexuality and gender identity, political opinions and parties, trade union membership, and racial or ethnic origin (including "BAME" and ethnic or national-heritage societies by their common words, such as "nigerian society"). Whole words, any case and accents, simple plurals, phrases, "LGBTQ+", CamelCase and "...soc" run-togethers. `isSensitive(text)`.
- **Screened before matching and before the AI** (`worker/suggestScreen.js`): a tag, course, role, company or institution with a listed term is left out; a headline is cut into phrases and each phrase with a term is left out; an intention loses the listed words, and is left out whole when what is left is mostly them (or nothing useful). This covers both people's sides, both intentions, the F16 shared-ground facts used by Who to meet, the plain order (`suggestMatch.js`) and every record sent to the model, the viewer's own included (`ai/suggestRank.js`).
- **Reasons:** no reason shown can contain a listed term (`safeReason` in the entry). An AI reason that has one is blanked before it is kept and replaced by the plain order's reason for that person; a pick whose quote has one is dropped.
- **The prompt** has one fixed line: "Never match people on, or mention, religion or belief, health, sexuality or gender identity, politics, ethnicity or trade union membership." (`suggest-rank-2`).
- **Shown as before:** the card, and the person's entry in other people's lists (headline, tags, intention), still show exactly what the card shows. Only matching and the AI ignore the words.
- **Not screened on purpose:** common words that are usually about something else: "health" alone and health as an industry (health tech, healthcare, digital or public health), "labour" alone (labour law), "union" alone (students' union, Unity), "black", "asian", "chinese" and other heritage words alone (black belt, Asian markets, a language), "race" alone, "liberal" alone, "cancer" alone (cancer research), "blind", "bi", "aids", "lent", "ministry", "poc", "theology", "vegan", "gender" alone, pronouns.
- **The older path:** F17's list (`GET /api/e/:id/suggestions`) and F25's route (`/api/ai/who-to-meet/:eventId`) are no longer called by any page but are still mounted, so they get the same screen and prompt line (`who-to-meet-3`).
- **Out of scope:** the person page's shared ground (two people who already connected), Do I know someone who ([[F24 Do I know someone who]], a person searching their own connections in their own words) and follow-up drafts.

## Consequences
Two people who share only a faith society, a health group or a political society are not matched for it, and the model never sees it. Some harmless matches are lost where a listed word is used in another sense ("Inner Temple", "takes pride in", "good faith"); this costs a suggestion, not data. A list cannot catch every phrasing ("Friday prayers group" keeps "Friday group"; a coded or misspelt word passes), and a model may still infer from what is left: the residual risk named in F61. Any later matching (F61's fields, picks or embeddings) must use the same screen first. The Privacy Policy section 8f says so in one line; the Terms and Privacy version was not bumped (it narrows processing).

**Evidence:** `src/lib/sensitiveTerms.js`, `worker/suggestScreen.js`, `worker/suggestMatch.js`, `worker/ai/suggestRank.js`, `worker/ai/prompts/suggestRank.js`, `worker/suggestApp.js`, `worker/presenceMatch.js`, `worker/ai/whoToMeet.js`, `test/sensitive-terms.mjs`

Related: [[D054 Everyone checked in can be suggested unless they untick Suggest me, shown only what their card shows]], [[D035 AI who to meet only re-orders the list F17 already offers]], [[D026 Shared ground is worked out from what each person shows, and never stored]] · back to [[Decision Log]]
