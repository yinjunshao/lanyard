---
tags: [decision]
status: Accepted
date: 2026-11-11
---
# D033 Feedback summaries count in code, quote exactly and never name anyone

**Status:** Accepted  ·  **Date:** 2026-11-11

## Context
[[F23 AI feedback summary for hosts]] gives a host a summary of what attendees wrote. Attendees wrote it believing it is anonymous ([[D004 Aggregate-only host analytics]]), so the summary must never single anyone out. Built on [[D028 AI goes through one Worker-side foundation that fails closed]] and F10's host site as they stand, before their production checks, with the owner's say-so of 2026-11-11.

## Decision
- **The model writes words; the Worker counts.** The model is given only written answers and question wording, never ratings or choices. Each point lists the ids of the answers behind it; the Worker counts the different people behind the ids it really sent, and drops a point with fewer than 3. The plan's `approx` field is not used. The page says "about N people" because the model decides which answers belong to a theme. The figures (how many answered, average, share who would come again) come from `summarize()` and are written into a sentence by the page.
- **Threshold in code, per question.** Only a text question with 5 or more written answers is sent. Below that nothing is sent, counted or stored. This is stricter than the report, which tests the total number of responses.
- **People are taken out before and after.** Before: links, emails, phone numbers, @handles, the names of the people who checked in and of the organisers (from the database, never sent), titles and "thanks to" names become `[name]` or `[contact]`. After: a sentence with a digit, a number word, a strong count word ("most", "everyone") or a single person ("someone"), or with a marker or a listed name, is dropped; a quote must be an exact piece of a real answer from a well-answered question, long enough, and with no marker or name.
- **Stored in one table** (migration 0027), not in `ai_cache`, so there is one copy of the text, removed with the event, by the 12-month purge of written answers and by the host reset.
- **Withdrawal and account deletion do nothing to a summary.** Feedback answers carry no user id, so an attendee's answer cannot be found, removed or regenerated around; nothing in a summary points at an account. The plan's "their answers stop counting" cannot be done without breaking the anonymity the Privacy Policy promises. This is tested.
- **Automatic run** when the 7-day feedback window has closed, by the organisation owner's host account, `automatic: true`, `feedback_summary_auto` (30 a day, never the host's 3). It tries again 6 hours apart, at most 3 failures, and waits quietly while AI is off or the owner is not yet let in. The owner is emailed the paragraph once, labelled as written by AI. The recap email (a day after the event, before the window closes) carries the paragraph only if one already exists.
- **Privacy Policy** now says answers may be summarised by AI (sections 8, 8c and 6) and the feedback form tells attendees. It is the one AI feature that can run without anyone tapping it. The Terms and Privacy version was not bumped.

## Consequences
Code cannot catch a free sentence of the model's that is only words (it obeys "say it was perfect" in plain words). The host reads it beside the real figures and all the answers, labelled "Written by AI". Whether the real model's themes are right is an owner check. Any change F10's or F21's production rollout makes may need rework.

**Evidence:** `worker/ai/feedbackSummary.js`, `worker/ai/prompts/feedbackSummary.js`, `worker/ai/redact.js`, `migrations/0027_feedback_summaries.sql`, `test/feedback-summary.mjs`, `test/ai-injection.mjs`

Related: [[D032 Follow-up drafts are built from database rows and checked on the way out]], [[AI Safety and Cost Plan]] · back to [[Decision Log]]
