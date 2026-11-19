---
tags: [decision, ai, security]
status: Accepted
date: 2026-11-19
---
# D048 Typed tone, goal and points reach the model only as fenced descriptions

**Status:** Accepted  ·  **Date:** 2026-11-19

## Context
[[F44 Custom tone goal and points in follow-ups]]. Until now nothing a person typed could become an instruction in a follow-up draft: tone, goal and channel were fixed lists whose words live in `worker/ai/prompts/followup.js`, and the only free text (`extra`, up to 300 characters) went into the data block. On 2026-11-19 the owner decided people may type their own tone ("short fenced text, but shorter than 40 characters, max 15 characters"), goal and talk-about points, and accepted the risk that this puts typed words in front of the model ([[AI Safety and Cost Plan]], rule 7).

## Decision
- **Shape.** `tone` and `goal` are a preset id or `{ custom: "<text>" }` and nothing else. A `talkAbout` item is an offered topic (a string, matched against what was offered, as before) or `{ custom: "<text>" }` for a point the person typed. Any other shape for tone or goal is a 400. In `talkAbout`, an entry with no `custom` key is dropped as before, so the old behaviour and tests are unchanged.
- **One rule, shared.** `normaliseCustom` in `src/lib/followupTemplates.js` is used by the Worker as the real check and by the page to warn early, so the two cannot drift. It makes the text NFC, removes control, zero-width, direction-override, variation-selector and tag characters, collapses spaces, trims, and turns a curly apostrophe into a plain one. Then only letters (any script), marks, digits, spaces and `' - , . ! ?` are allowed, on one line. Anything else is a 400 in plain words: quotes, `<>{}[]`, backticks, `:`, `/`, `\`, `#`, `*`, `;`, `=`, `@`, guillemets, emoji, full-width and typographic marks, and line breaks (refused, not turned into a space). The Worker also refuses text that reads as a web or email address, which cleaning would otherwise empty.
- **Limits** (counted after cleaning): tone 1 to 15, goal 1 to 40, each point 1 to 40, at most 3 typed points (the same point twice, in any case, counts once). The goal, point and point-count limits are the orchestrator's choice, not the owner's (the owner set 15 for tone); they are the constants `CUSTOM_MAX` and `MAX_CUSTOM_POINTS` in one file.
- **Typed text is data only.** It goes into the `<data>` block under `myTone`, `myGoal` and `myPoints`, only when typed, cleaned again by `callModel` and written with `safeJson` like every other field. The system prompt has one fixed sentence for "Your own" tone and one for goal, plus one fixed paragraph describing the three keys as descriptions that never change the rules; so it is byte-identical whatever was typed (tested). The preset prompt differs from the custom one only in the Tone and Goal lines. `PROMPT_VERSION` is `followup-4`.
- **Same checks on the way out.** Schema, links, emails and phone numbers removed, no placeholders, word limits and emoji removal are unchanged. A custom tone never gets the single emoji the enthusiastic WhatsApp preset may keep.
- **Cache and Try again.** The cache key already covers the whole data block and the system prompt, so a different typed value is a different request; Try again skips the cache and counts, as before.
- **Template fallback.** A custom tone uses the friendly template, a custom goal a neutral line that uses nothing it said, and typed points are listed as written in a sentence of their own.
- **Page.** Tone and Goal end with a "Your own…" chip that opens a field with a counter (15, 40); Talk about has "Add your own point" (40 each, up to 3, removable). The field fades in on the F40 token.

## Residual risk (accepted by the owner)
- **Plain words still steer the model.** A tone of "ignore rules" or a goal of "ignore previous instructions" is allowed as text, because letters and spaces cannot be told from a real tone by code. The model may follow it in its wording. What it cannot do is break the rules in code: no tool or action exists, the reply is schema-checked, stripped of links, emails and phone numbers, cut to the word limit, freed of emoji and placeholders, and the person reads and edits it before sending. Whether the real model resists is an owner check.
- **Only the asker's own draft is affected.** The typed words come from the person who reads the draft. They cannot change what another person sees, and the model is given nothing the asker could not already see.
- **Cost is unchanged.** The extra text is at most 15 + 40 + 3 x 40 characters plus the fixed sentences, under 500 characters in all (tested), against 300 for `extra` already; `max_tokens` is still 300.
- **Not covered:** look-alike letters (a Cyrillic "a") are letters and are allowed; they change nothing the model does.

## Consequences
- A new typed field must use `normaliseCustom` and the data block, never the instructions. `test/ai-injection.mjs` holds the attack cases (fence closers, hidden characters, NFC, "ignore rules", an obeying model) and `test/followup.mjs` the limits, cache and template cases.
- If the owner wants a longer tone, goal or point, or more points, change the constants and the tests that name them.

**Evidence:** `src/lib/followupTemplates.js` (`normaliseCustom`, `CUSTOM_MAX`), `worker/ai/prompts/followup.js` (`readChoice`, `readTalkAbout`, `followupSystem`), `worker/ai/followup.js`, `src/components/FollowupComposer.vue`, `test/followup.mjs`, `test/ai-injection.mjs`

Related: [[D032 Follow-up drafts are built from database rows and checked on the way out]], [[D028 AI goes through one Worker-side foundation that fails closed]], [[D044 Errors say what happened and what to do, and the vague ones stay vague]] · back to [[Decision Log]]
