---
tags: [roadmap, feature, ai]
id: F21
priority: P1
phase: 4
size: L
status: In progress
needs: [F09]
---
# F21 AI foundation

**Priority:** P1 · **Phase:** 4 AI · **Size:** L · **Needs:** [[F09 Settings in category pages]] (for the AI privacy setting) · **Unlocks:** [[F22 AI follow-up drafts]], [[F23 AI feedback summary for hosts]], [[F24 Do I know someone who]], [[F25 AI who-to-meet ranking]] · back to [[00 Master To-Do]]

The shared plumbing that makes every AI feature safe and cheap. The design and reasons are in [[AI Safety and Cost Plan]]. Read it first; this note is the build list.

> [!note] Owner decision 2026-11-10: AI people search is **on by default with an opt-out** in Settings (`users.ai_search_ok` default 1).

## Build
### Module `worker/ai/`
- `client.js`: `callModel({ feature, actor, system, data, schema, maxTokens })`
  1. checks `AI_ENABLED` and the KV kill switch
  2. checks eligibility (verified-email account, or host account; the allow-list during rollout)
  3. checks the quota (`AI_LIMITS` in `worker/plans.js`) and the burst limit (`bump()`)
  4. computes the cache key (SHA-256 of feature + canonical JSON input) and returns the cached result if present
  5. checks the app budget (`ai_daily`)
  6. calls Anthropic Messages through `AI_GATEWAY_URL` with `AI_MODEL`, `max_tokens` and a timeout (10 s)
  7. records tokens and cost (`ai_usage`, `ai_daily`), stores the cache entry, returns parsed output
  8. on any failure, returns `{ fallback: true, reason }`. Never throws to the user.
- `sanitize.js`: strips control and zero-width characters and URLs from third-party text, escapes delimiters, caps lengths.
- `validate.js`: JSON-schema-lite checks, id allow-list filtering, exact-substring quote check, link and email stripping.
- `prompts/`: one file per feature with the system prompt and builder. System prompts carry a version string, which is part of the cache key.
- `price.js`: per-model token prices in micro-dollars, in one place, with a comment saying the date the prices were checked.

### Tables (one migration)
- `ai_usage(day, actor_kind, actor_id, feature, calls, input_tokens, output_tokens, cost_micros, PRIMARY KEY(day, actor_kind, actor_id, feature))`
- `ai_cache(key PRIMARY KEY, feature, actor_id, result TEXT, created_at, expires_at)`. Purged daily after 7 days in `worker/purge.js`.
- `ai_daily(day PRIMARY KEY, cost_micros, calls)`

### Settings and policy
- Settings → Privacy and data ([[F09 Settings in category pages]]): "Let people I've connected with find me using AI search" (`users.ai_search_ok`, default 1), with a short explainer.
- Settings → Plan shows AI allowances for Free and Plus.
- Privacy Policy "AI features" section, processor list, DPIA and LIA notes ([[AI Safety and Cost Plan]] §6).

### Admin
`/admin`: today's and this month's spend against budget, calls per feature, cache hits, fallbacks, top users by calls, kill switch toggle, allow-list editor.

### Tests
- `test/ai.mjs` with a stubbed `fetch` for the gateway: quota refusal, burst refusal, cache hit costs nothing, budget exhaustion → fallback, kill switch → fallback, timeout → fallback, guests refused.
- `test/ai-injection.mjs` (see the plan §5 Rule 6).

## Tasks
- [x] F21.1 Migration and `price.js`, `AI_LIMITS`, env var reading.
  - `migrations/0024_ai_foundation.sql` (`users.ai_search_ok`, `ai_usage`, `ai_cache`, `ai_daily`, `ai_settings`), `worker/ai/config.js` (all env reading, the stub-mode rule), `worker/ai/price.js` (prices are the plan's, **unchecked**, until the owner sets the price vars), `AI_LIMITS` in `worker/plans.js`, production vars with `AI_ENABLED = "0"`. `test/ai.mjs` is in `npm test` before the budget check.
- [x] F21.2 `client.js` with all eight steps and tests.
  - `worker/ai/client.js` (`callModel`, `allowanceFor`) with `store.js`, `optout.js`, `prompt.js`, `messages.js`, `alerts.js`, `stub.js`, `data.js`, and the cleaning and checking modules it needs (`sanitize.js`, `validate.js`, tested properly in F21.3). The 183 checks in `test/ai.mjs` use a stubbed `fetch`. Added: a per-actor burst and address limit, a per-event quota, 50% and 90% budget emails, the AI section of both data downloads, the purge (cache 7 days, counts 13 months, orphans) and erasure.
- [ ] F21.3 `sanitize.js` and `validate.js` with unit tests and the injection test file.
- [ ] F21.4 Admin spend panel, kill switch and allow-list.
- [ ] F21.5 Settings toggle, policy and DPIA text (the owner approves the wording).
- [ ] F21.6 Owner steps written below and copied to the master list.

## Owner steps
See the owner checklist in [[AI Safety and Cost Plan]]: API key and workspace spend limit, AI Gateway with logging off and a spend limit, secrets and vars, the DPA.

## Acceptance checks
- [ ] With the stub, the 4th free draft in a day returns the template fallback and costs nothing.
- [ ] Setting `AI_DAILY_BUDGET_USD=0.000001` locally makes every feature fall back.
- [ ] No prompt text is stored anywhere except `ai_cache` (7 days).

## Log
-

Related: [[Security]], [[Privacy and Data Retention]] · back to [[00 Master To-Do]]
