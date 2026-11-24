---
tags: [roadmap, feature, events, ai, research]
id: F61
priority: P3
phase: 10
size: L
status: Not started
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
- [ ] F61.1 Research note with options, costs and the privacy assessment, for the owner to choose from (no code).

## Acceptance checks
- [ ] The owner has chosen an option, recorded as a decision note, before any code.

## Log
-

Related: [[F60 Intention at check-in and who to meet for everyone]] · back to [[00 Master To-Do]]
