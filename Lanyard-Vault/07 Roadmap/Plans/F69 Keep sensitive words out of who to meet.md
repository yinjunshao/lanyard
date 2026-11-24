---
tags: [roadmap, feature, events, ai, privacy]
id: F69
priority: P0
phase: 11
size: S
status: Not started
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
- [ ] F69.1 `sensitiveTerms.js` and `isSensitive`; the screen in the plain order, the AI input and the reasons (and the old who-to-meet path, if still reached); the prompt line; Privacy Policy line; tests; vault notes ([[Privacy and Data Retention]], [[F60 Intention at check-in and who to meet for everyone]] Log, [[UK GDPR Audit 2026-11-01]] if it has an F60 section).

## Acceptance checks
- [ ] Two people both tagged "Christian Union" and nothing else in common: neither is suggested to the other for that, and no reason mentions it (test through the real Worker).
- [ ] Two people both tagged "Finance": they are still matched with "Into Finance" (test).
- [ ] With the AI stubbed, the request body sent to the gateway contains none of the screened tags or intention phrases from a fixture of 12 sensitive examples, while the person's card response still shows their tags (test).
- [ ] The system prompt contains the fixed line (test).
- [ ] An intention "meet other Muslim founders" is used for "founders" and not for "Muslim" (test).
- [ ] `npm test` passes; public pages within budget (Worker-only, so unchanged).

## Log
-

Related: [[F61 Research Matching options]] · [[F60 Intention at check-in and who to meet for everyone]] · back to [[00 Master To-Do]]
