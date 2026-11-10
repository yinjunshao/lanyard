---
tags: [decision]
status: Accepted
date: 2026-11-10
---
# D028 AI goes through one Worker-side foundation that fails closed

**Status:** Accepted  ·  **Date:** 2026-11-10

## Context
[[F21 AI foundation]] is the plumbing for every AI feature ([[F22 AI follow-up drafts]], [[F23 AI feedback summary for hosts]], [[F24 Do I know someone who]], [[F25 AI who-to-meet ranking]]). The risks are cost (abuse, a loop), privacy (other people's text in a prompt, a provider keeping it) and prompt injection. [[AI Safety and Cost Plan]] set the design; this records the choices made while building it.

## Decision
- **One call path.** Features call `callModel(env, {...})` in `worker/ai/client.js`. It never throws and returns `{ fallback: true, reason, message }` when anything stops it, so a feature always has a non-AI result to show. A refused call costs nothing and takes no quota.
- **Everything is configuration, nothing is guessed.** Model id (`AI_MODEL`, default `claude-haiku-5-5`), gateway address, budgets and per-million-token prices are vars. No gateway address or key means "not set up" and a fallback: it never defaults to calling a provider directly. Prices default to the plan's figures and the admin page says plainly while they are unconfirmed. Only the plain Messages request and reply shape is used (`model`, `max_tokens`, `system`, `messages`; `content[0].text`, `usage`, `stop_reason`). We did **not** build on provider prompt caching, the Batch API or Gateway spend limits: caching, budgets and the kill switch are our own, and the provider-side settings are owner steps to verify.
- **The kill switch, rollout stage and allow-list live in D1 (`ai_settings`), not KV.** The plan said KV with a minute's delay; D1 is read on each call, takes effect at once, and the KV binding is legacy and due for removal. The stage starts at "allow-list" with nobody on it, and `AI_ENABLED` is `"0"` in production config, so shipping the code switches nothing on.
- **Who may call.** The foundation loads the caller from the database (a verified-email, non-guest account, or an active host account) and applies the limits for that tier from `AI_LIMITS`. Quotas and burst keys include the kind (`user` or `host`), so the two identities never share a counter even if an id string matched.
- **Cache keyed per person.** The key is a SHA-256 over person, feature, prompt version, model, the exact cleaned input, the people involved and the schema, and a row is only returned to the person it belongs to. A cached reply is the only generated text we store (7 days at most); no prompt is stored. A search opt-out or a block is checked before the cache is read, so a cached reply is never served for someone who has since opted out.
- **The opt-out lives in the foundation.** `searchableIds()` is what features use to gather people; `callModel` is also given the people in the prompt (`subjects`) and refuses the whole call if any has `ai_search_ok = 0` or is blocked (features marked `optOut` in `AI_LIMITS`: search and who-to-meet; not follow-up drafts, see the question in the plan note).
- **Injection rules are helpers, not conventions.** `sanitize.js` cleans text and builds records with only chosen fields (`pickFields`); `prompt.js` wraps data in `<data>` as JSON with `<`, `>` and `&` escaped and puts the guard sentence in the system field only; `validate.js` rebuilds the reply from a schema, drops unknown ids and invented quotes and strips contact details that were not in the input. A feature's own checks run in a `refine` hook before the reply is cached.
- **Money.** Cost is worked out from the reply's token counts and added to `ai_daily`; a call is refused unless its worst case (all of `max_tokens`) fits in what is left of the day and the month. Emails at 50% and 90% need `AI_ALERT_EMAIL`.
- **A local stub for development.** `AI_STUB=1` answers with a canned reply and calls nothing; it is refused unless every `APP_ORIGIN` is a local address. Only `wrangler.toml` sets it, never `wrangler.production.toml`, and tests check both.

## Consequences
Nothing here proves the real model behaves; the foundation only limits what a misbehaving or injected model can do (no tools, only checked text, only what the asker could already see). A reply that is paid for but unusable still counts against the person's quota. A timed-out request may still be billed by the provider although we record no cost; the Gateway and provider spend limits are the net for that. Quota and budget counting is not atomic across the two database statements, so concurrent calls can overshoot by one; the burst limit makes that rare.

**Evidence:** `worker/ai/`, `migrations/0024_ai_foundation.sql`, `test/ai.mjs`, `test/ai-injection.mjs`

Related: [[Privacy and Data Retention]], [[Security]] · back to [[Decision Log]]
