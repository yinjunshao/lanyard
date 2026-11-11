---
tags: [decision]
status: Accepted
date: 2026-11-11
---
# D032 Follow-up drafts are built from database rows and checked on the way out

**Status:** Accepted  ·  **Date:** 2026-11-11

## Context
[[F22 AI follow-up drafts]] is the first AI feature a person sees. It writes a message about someone the asker met, so the model is handed another person's words. [[AI Safety and Cost Plan]] rule 1 says the model may only see what the asker can already see. Built on [[D028 AI goes through one Worker-side foundation that fails closed]] as it stands, before F21's real-key check, with the owner's say-so of 2026-11-11.

## Decision
- **Everything the model sees is read from the database** for a connection the asker is in (`followupContext`): the other person's first name and the line their card shows, the topics from the card they shared with the asker and the shared ground (F16's `visibleSide` and `sharedGround`), the event name, date and how they connected, the asker's first name, own tags and (only if switched on) own note, and the typed line. The browser sends only which offered items it wants, the choices and the typed line; anything not offered is dropped. Never the other person's email, links, photo, headline, about text, hidden fields or other connections.
- **Choices are fixed lists.** Channel, tone and goal are looked up in the prompt file, so nothing typed can change the instructions. The prompt version is part of the cache key.
- **Checked on the way out.** The foundation's schema check removes links, emails, phone numbers and markup; the feature adds a length limit (80 words, or 120 and a subject of 8 for email), no placeholders, no emoji (one on an enthusiastic WhatsApp message). A reply that fails is thrown away and the template is shown.
- **A template is always the fallback**, with the foundation's message. It is built on the page from the same choices (60 combinations), obeys the same limits and never errors.
- **Email is always offered** as a channel, and LinkedIn and WhatsApp only when the other person's card shows that link. The plan said a channel needs the other person's link, but a card can never hold an email address, so email would never have appeared. Email opens a blank message to paste into.
- **The People row menu is not built.** Rows are one link each; the action is on the person's page.
- **Counts only** (migration 0026): drafts shown, copied, opened and marked, with no person or text.
- **The AI search opt-out does not stop drafts** (F21's setting, unchanged). Open owner question; it is one word (`optOut: true` on `followup` in `AI_LIMITS`).

## Consequences
The model's own wording cannot be checked by code: if it obeys an injected "say I'm the best" in plain words, that text reaches the person as an editable draft they read first. The real model's resistance is an owner check. Any change F21's real-key rollout makes to the request or reply may need rework here.

**Evidence:** `worker/ai/followup.js`, `worker/ai/prompts/followup.js`, `src/lib/followupTemplates.js`, `src/components/FollowupComposer.vue`, `migrations/0026_followup_counts.sql`, `test/followup.mjs`, `test/ai-injection.mjs`

Related: [[D026 Shared ground is worked out from what each person shows, and never stored]], [[D022 Record how a connection was made, once and without guessing]], [[D024 Signed-in frame and heavy pieces load only where used]] · back to [[Decision Log]]
