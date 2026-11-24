---
tags: [roadmap, feature, events, ai, privacy]
id: F69
priority: P0
phase: 11
size: S
status: Done
needs: [F60]
---
# F69 Keep sensitive words out of who to meet

**Priority:** P0 · **Phase:** 11 Owner requests (2026-11-24, second batch) · **Size:** S · **Needs:** [[F60 Intention at check-in and who to meet for everyone]] · back to [[00 Master To-Do]]

> [!note] Owner decision 2026-11-24: "Screen them, fix F60 now". Words that can reveal special category data are screened out of matching and out of what goes to the AI, but are still shown on the card where the person put them.

## What the owner asked for (2026-11-24)
The F61 research ([[F61 Research Matching options]]) found that today's who to meet uses every visible tag and the intention line, both in the plain order and in what it sends to the AI. So a tag such as a faith society can become a reason ("Into ...") and can reach the model. Asked what to do, the owner chose **"Screen them, fix F60 now"**.

## Current state
- `worker/suggestMatch.js` scores with the viewer's intention, the other person's intention and shared-ground facts. Its reasons quote tags (`Into ${t}`, line 33).
- `worker/ai/suggestRank.js` and `worker/ai/prompts/suggestRank.js` send candidates' visible fields, tags and intentions to the model.
- The older who-to-meet path (`worker/presenceMatch.js`, `worker/ai/prompts/whoToMeet.js`) still exists. Check whether any page still calls it. If one does, it gets the same screen.
- Nothing in `worker/` screens these words.

## Plan
- **One list,** in `src/lib/sensitiveTerms.js`, with no imports, so the Worker and tests can read it. It holds words and short phrases for:
  - religion or belief (for example the names of faiths, and words like "prayer", "church", "mosque", "synagogue", "temple");
  - health and disability;
  - sex life and sexual orientation, and gender identity;
  - political opinions and parties;
  - trade union membership;
  - racial or ethnic origin, including "BAME" and named ethnic or national-heritage societies by their common words.

  Use whole-word, case-insensitive matching with simple plurals. Keep the list plain and reviewable, and add a header comment saying what it is for and that a list cannot catch every phrasing.
- **`isSensitive(text)`** returns true when a tag, intention phrase or headline phrase contains a listed term.
- **Applied before matching and before the AI:**
  - Matching drops any tag that hits. It also drops intention words that hit, and drops the whole intention for both scoring and the AI when it is mostly sensitive.
  - The AI never receives a tag or intention that hits. Headline phrases are screened for the AI too.
  - A reason can never contain a screened term. Test the final reason strings, not only the inputs.
- **Nothing changes on the card:** the person's tags still show where they put them, and their entry in other people's lists still shows their own tags as their card does. Only matching and the AI ignore them.
- **One fixed line in the system prompt:** "Never match people on, or mention, religion or belief, health, sexuality or gender identity, politics, ethnicity or trade union membership." Pin it in the prompt test.
- **Shared ground ([[F16 Shared ground without AI]]):** decide whether the "same tags" shared-ground fact used by who to meet also passes through the screen. It should, for who to meet. Do not change the person-page shared ground, which is about two people who already connected. Say which you did in the Log.
- **Out of scope:**
  - "Do I know someone who" ([[F24 Do I know someone who]]), where a person searches their own connections in their own words;
  - follow-up drafts.

  Note both in the Log for the owner.
- **Privacy notes:** add a line to [[Privacy and Data Retention]] and to the F60 section of the Privacy Policy (section 8f) saying that suggestions never use words about religion, health, sexuality, politics, ethnicity or union membership. Do not bump the Terms version. Flag whether it is material; it reduces processing, so probably not.

## Tasks
- [x] F69.1 `sensitiveTerms.js` and `isSensitive`; the screen in the plain order, the AI input and the reasons (and the old who-to-meet path, if still reached); the prompt line; Privacy Policy line; tests; vault notes ([[Privacy and Data Retention]], [[F60 Intention at check-in and who to meet for everyone]] Log, [[UK GDPR Audit 2026-11-01]] if it has an F60 section).

## Acceptance checks
- [x] Two people both tagged "Christian Union" and nothing else in common: neither is suggested to the other for that, and no reason mentions it (test through the real Worker).
  - Verified: `test/sensitive-terms.mjs` checks in Abel and Bea (only tag "Christian Union") to a live event on the real Worker: both lists come back in the "new" mode (nobody matched) and no reason in either contains "christian" or "union". The same holds in the pure checks for all 18 fixture examples as a tag and headline on both sides.
- [x] Two people both tagged "Finance": they are still matched with "Into Finance" (test).
  - Verified: same file, real Worker: Cal and Dee (only tag "Finance") are matched with the shared-ground reason "Both into Finance" (the reason two shared tags give, as before F69); a third person who wrote "Meet people in finance" gets Dee with "Into Finance".
- [x] With the AI stubbed, the request body sent to the gateway contains none of the screened tags or intention phrases from a fixture of 12 sensitive examples, while the person's card response still shows their tags (test).
  - Verified: a recorded gateway (no real model) captures the raw request body for a viewer and six people carrying 18 examples (religion, health, sexuality, gender identity, politics, trade union, ethnicity; as tags, intentions and headline phrases), plus the viewer's own "Hindu Society" tag and "Pride network lead" headline phrase: none of 23 search words is in it, while the plain parts ("Founders", "Founder at Acme", "meet other founders") are. Each `GET /api/c/:id` still shows every tag and the whole headline; each entry's tags, headline and intention equal the card's.
- [x] The system prompt contains the fixed line (test).
  - Verified: `SENSITIVE_LINE` is pinned word for word, `SUGGEST_RANK_SYSTEM` has it as its own line, the captured `system` sent to the gateway has it, and F25's old prompt has it too.
- [x] An intention "meet other Muslim founders" is used for "founders" and not for "Muslim" (test).
  - Verified: real Worker, AI off: Mo's list matches Fay (tag "Founders", reason "Into Founders") and not Gus (tag "Muslim Society"), while Mo's entry in Gus's list still shows "meet other Muslim founders". With the recorded gateway, the viewer's record is `intention: "meet other founders"` and "Muslim" is nowhere in the raw body.
- [x] `npm test` passes; public pages within budget (Worker-only, so unchanged).
  - `npm test` exit 0 and `npm run build` exit 0. The list is in no front-end bundle (searched `dist/assets`). First-load gzip B before to after: Landing 44,299 to 44,303; PublicCard 47,650 to 47,656; Hosts 42,650 to 42,654; Privacy 50,158 to 50,271 (the new 8f bullet; 929 B left); Terms 46,774 to 46,779; Redeem 46,010 to 46,011; SignIn 47,116 to 47,121; PrivacyRequest 49,835 to 49,843 (limit 51,200). The few bytes on the other pages come from the entry's route map naming the new Privacy chunk file (entry 40,863 to 40,866), not from any new code.

## Log
- 2026-11-24 (Claude subagent): F69 needs F60, which is built and tested but unticked (it waits on the owner's real-model check). Built on F60 as it stands, with the owner's say-so (the standing say-so for AI items since 2026-11-11, and the decision of 2026-11-24 to "fix F60 now"). No real model was called; `.dev.vars` was not opened; no migration.
- F69.1: `src/lib/sensitiveTerms.js` (no imports; `SENSITIVE_TERMS` in six groups, `HERITAGE` x `GROUPS` for heritage societies, `isSensitive`, `findSensitive`, `stripSensitive`; whole words, any case and accents, simple plurals, phrases, "LGBTQ+", CamelCase and "...soc" run-togethers) and `worker/suggestScreen.js` (`screenFields`, `screenSide`, `screenLine`, `screenHeadline`, `safeReason`). Applied in the plain order (`suggestMatch.js`: both sides, both intentions, the F16 facts), the AI order (`ai/suggestRank.js`: every candidate record and the viewer's own; a reason with a listed word is blanked in `refine` before it is kept and replaced by that person's plain reason; a pick whose quote has one is dropped), and `entryOf` (`safeReason`, the last net). The prompt has the fixed line (`SENSITIVE_LINE`, `suggest-rank-2`). Privacy Policy 8f has one new bullet. `test/sensitive-terms.mjs` (69 checks), wired into `npm test` before the budget. Vault: [[D057 Who to meet never matches on or sends special category words]], [[Decision Log]], [[Privacy and Data Retention]], [[UK GDPR Audit 2026-11-01]] (F60 LIA), [[AI Safety and Cost Plan]] (section 6), [[F60 Intention at check-in and who to meet for everyone]] Log, [[Codebase Map]], [[Testing]].
- **Shared ground:** the "same tags" (and course, company, institution) facts used by Who to meet go through the screen; the person-page shared ground (F16, two people already connected, `sharedGround`) is unchanged, as the plan says (a test pins that it still says "Both into Christian Union" there).
- **The older who-to-meet path:** no page calls F17's `GET /api/e/:id/suggestions` or F25's `/api/ai/who-to-meet/:eventId` any more, but both routes are still mounted in the Worker, so a script could reach them. They got the same screen (`presenceMatch.js` `rank` and `topicsOf`, `presenceApp.js` `entryOf`, `ai/whoToMeet.js` `buildRecord` and the wish) and the same prompt line (`who-to-meet-3`). A later clean-up could remove them.
- **Decisions without the owner:** which words are on the list (see the file: 342 terms in six groups, plus 384 heritage-society phrases from 48 words and 8 group words); "health" alone is **not** screened, so "Health tech", "Healthcare", "Digital health" and "Public health" still match as industries, while "mental health" and named conditions are screened; also not screened alone: "labour", "union", "black", "asian" and other heritage words, "race", "liberal", "cancer", "blind", "bi", "aids", "lent", "ministry", "poc", "theology", "vegan", "gender", pronouns. "Temple", "pride", "faith" and "god" are screened even though they have other senses (cost: a lost match, never data). An intention is dropped whole when the listed words outnumber the useful words left (group words such as "society" and "network" do not count as useful), so "meet other Muslim founders" keeps "meet other founders" and "Islamic Society" goes whole; "Find a Friday prayers group" keeps "Find a Friday group" (the residual the F61 note names). A headline is cut at `, ; | / · •` and spaced dashes. A course, role, company or institution with a listed word is left out whole (for example "Islamic Studies").
- **For the owner, out of scope:** Do I know someone who (F24, a person searching their own connections in their own words) and follow-up drafts (F22, F44) are not screened. Say if either should be.
- **Tests and guards:** no existing test or guard was changed. `test/copycheck.mjs` (no named societies) flagged a capitalised example in a code comment; the comments now use lower case, and the list itself is lower case plain words (checked in the new test), so the guard stays as it was for UI files and everything else.
- **Not checked:** no browser look at the Privacy page (one bullet of text, same markup as its neighbours) and no local `AI_STUB` run; the recorded-gateway tests cover the AI path. How a real model behaves with the new prompt line is part of F60's open real-model check.
- **Privacy Policy:** one bullet in 8f ("Words we never use"). The Terms and Privacy version is **not** bumped. In our view this change is not material on its own: it narrows processing and gives people more protection; it can go with the F60 bump the owner already has to decide.

## Owner steps
- Worker and one Privacy Policy line, no migration, no secret: `npm run deploy` (with F60). When doing F60's real-model check, also try a test account with a sensitive tag (for example "Christian Union") and an intention such as "meet other Muslim founders", and confirm the reasons never mention them.
- Decide: whether Do I know someone who (F24) and follow-up drafts should be screened too; whether this 8f bullet goes in the Terms and Privacy version bump already pending for F60 (we think it is not material on its own); review the word list in `src/lib/sensitiveTerms.js`, especially the common words left out (listed above).

Related: [[F61 Research Matching options]] · [[F60 Intention at check-in and who to meet for everyone]] · back to [[00 Master To-Do]]
