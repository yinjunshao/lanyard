---
tags: [roadmap, feature, events, ai, research]
id: F61
priority: P3
phase: 10
size: L
status: In progress
needs: [F60]
---
# F61 Matching profiles for better suggestions

**Priority:** P3 · **Phase:** 10 Owner requests (2026-11-24) · **Size:** L · **Needs:** [[F60 Intention at check-in and who to meet for everyone]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"Perhaps later on, we can also start designing an algorithm which profiles people depending on their profile to suggest people with each other better."

## Current state
- Suggestions at events use word matches and shared ground (`worker/presenceMatch.js`, [[F16 Shared ground without AI]]) and, after [[F60 Intention at check-in and who to meet for everyone]], an AI ranking per request. Nothing about a person is stored between events for matching.

## Plan (research first, later)
Not to be built until F60 has run at real events. First a short research note, then a plan for the owner to approve:
- What signals help: field or industry, what someone does, what they want (intention), the kinds of people they want to meet, who they connected with afterwards and whether they followed up (outcome signals).
- Options: a fixed taxonomy of fields and goals that each profile is mapped to (cheap, explainable); text embeddings of what a card shows (needs a vector store and an embeddings model); learning from which suggestions led to a connection.
- Privacy: building a profile of someone to match them is profiling under UK GDPR. It needs a clear notice, an opt-out, a data protection impact assessment, no special category data, nothing inferred that a person would not expect, and nothing kept that their card does not show. Retention and an explanation of "why you were suggested" are required.
- Cost and safety per [[AI Safety and Cost Plan]].

## Tasks
- [x] F61.1 Research note with options, costs and the privacy assessment, for the owner to choose from (no code).
  - Written as [[F61 Research Matching options]]: four options (a fixed list scored in code, embeddings, learning from outcomes, a staged mix), costs at 50, 300 and 1,000 attendees, a UK GDPR assessment with a DPIA outline, and seven owner decisions.

## Acceptance checks
- [ ] The owner has chosen an option, recorded as a decision note, before any code.

## Log
- 2026-11-24 (Claude subagent): F61.1 research note written ([[F61 Research Matching options]]). It recommends a staged path: first a fixed list of fields, goals and kinds of people, scored in code, with anonymous counts of which kinds of match led to a connection; embeddings only once events regularly pass about 150 people. A DPIA is needed. It found that nothing screens special category words (faith, health, sexuality, politics) out of F60's matching today, and recommends a screen first whatever is chosen. Waiting on the owner's seven decisions in section 5 of the note; no code until then.

Related: [[F60 Intention at check-in and who to meet for everyone]] · back to [[00 Master To-Do]]
