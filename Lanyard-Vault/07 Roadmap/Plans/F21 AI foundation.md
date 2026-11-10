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
- [x] F21.3 `sanitize.js` and `validate.js` with unit tests and the injection test file.
  - `sanitize.js` (`cleanText`, `deepClean`, `pickFields`, `safeJson`), `validate.js` (`parseModelJson`, schema-lite `validate`, `filterIds`, `exactQuotes`, `stripContacts`), `prompt.js` (`buildSystem`, `buildUser`, `assignIds`), and a `refine` hook in `callModel` for a feature's own checks. `test/ai-injection.mjs` (150 checks) runs a stubbed model that obeys every attack in the data; it is in `npm test` before the budget check.
- [x] F21.4 Admin spend panel, kill switch and allow-list.
  - `worker/ai/admin.js` (routes on `adminApp`, behind the token), `src/components/AdminAi.vue` in `/admin`: state, key and gateway set or not, prices (flagged while unconfirmed), spend against both budgets, calls, cache hit rate, fallbacks, per feature, top 10 people (ids only), people at a limit three days running, kill switch, rollout stage, allow-list and a test call. The kill switch, stage and list are in `ai_settings` (D1), not KV: read on every call, so they act at once. Checked in the browser at 375 and 1280 px, light and dark, with the local stub.
- [x] F21.5 Settings toggle, policy and DPIA text (the owner approves the wording).
  - `src/views/settings/AiSearchSetting.vue` (Privacy and data, above the consent history) and `AiAllowances.vue` (Plan), both lazy and calling `api()` directly, so nothing was added to `api.js`; `worker/ai/routes.js` (`GET /api/ai/status`, `PUT /api/ai/search`); Privacy Policy section 8c, table rows and processor line; DPIA draft and LIA in [[UK GDPR Audit 2026-11-01]]; [[D028 AI goes through one Worker-side foundation that fails closed]]; the vault notes. Checked in a browser at 375 and 1280 px, light and dark, against the local stub.
- [x] F21.6 Owner steps written below and copied to the master list.

## Owner steps
Do these in order. Nothing is on until step 8, and the kill switch on `/admin` can always turn it off again.
1. Review the F21 commits, `git push`, then `npm run db:remote` (applies 0018 to 0024; 0024 is additive and safe before the new code) and `npm run deploy`. AI stays **off**: `AI_ENABLED = "0"` in `wrangler.production.toml`.
2. **Check the prices.** The figures in the plan ($0.10 in, $0.50 out per million tokens) were **not** checked against Anthropic's published pricing by the build. Look up the current price of `claude-haiku-5-5` and set `AI_PRICE_INPUT_PER_MTOK_USD` and `AI_PRICE_OUTPUT_PER_MTOK_USD` in `[vars]`. Until both are set the admin page says "not checked" and the spend figures may be wrong.
3. **Anthropic.** A separate workspace and API key for Lanyard production with a low monthly spend limit. Accept the DPA. Confirm in the commercial terms that API data is not used for training. The Privacy Policy says so, and that sentence is only true once you have confirmed it.
4. **Cloudflare AI Gateway.** Create one. Turn request and response body logging off (or the shortest retention). Set a daily spend limit a little above `AI_DAILY_BUDGET_USD` and a rate limit. The build did not rely on Gateway features: confirm that spend limits and rate limits work as the plan describes, and that the Anthropic address has the form `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/anthropic` (the Worker adds `/v1/messages`).
5. `npx wrangler secret put CLAUDE_API_KEY --config wrangler.production.toml`.
6. In `wrangler.production.toml` set `AI_GATEWAY_URL`, optionally `AI_ALERT_EMAIL` (for the 50% and 90% budget emails) and adjust `AI_DAILY_BUDGET_USD` and `AI_MONTHLY_BUDGET_USD` (now $2 and $30).
7. Approve the Privacy Policy wording (section 8c and the table rows), the people-search default, and the DPIA and LIA drafts in [[UK GDPR Audit 2026-11-01]] (ideally with a lawyer or legal clinic). Decide whether to bump `TERMS_VERSION` so everyone re-accepts; the build did not.
8. Set `AI_ENABLED = "1"`, then `npm run deploy`. On `/admin`, AI section: the stage is "Only the addresses listed", so add your own (confirmed) email to the allow-list and press **Run a test call**. It should say it worked. Compare its cost with the Gateway dashboard.
9. Use it for a week with only you on the list, then move the stage to Plus accounts, then everyone, watching the spend on `/admin` and the Gateway dashboard. Review after 4 weeks ([[AI Safety and Cost Plan]] section 8).

## Acceptance checks
- [x] With the stub, the 4th free draft in a day returns the template fallback and costs nothing. (`test/ai.mjs`, "Quotas": the 4th call of a Free account in a day is `{ fallback: true, reason: "quota_day" }`, says "back tomorrow", makes no gateway call, adds no cost and is not counted as a call. The foundation returns the fallback; the template itself is F22's.)
- [x] Setting `AI_DAILY_BUDGET_USD=0.000001` locally makes every feature fall back. (`test/ai.mjs`, "Budget": attendee, Plus and host features all return `budget_day` with no call and no cost.)
- [x] No prompt text is stored anywhere except `ai_cache` (7 days). (Better than written: no prompt is stored at all. `ai_cache` holds the checked **reply**, 7 days at most; `test/ai.mjs` checks the usage, spend and settings tables and the cache for the input text, and the data download and purge.)
- [ ] A real call through the AI Gateway with the production key works: the admin "Run a test call" says it worked and the cost matches the Gateway dashboard. **Needs the owner's key and the Gateway; cannot be ticked by an agent.**

## Log
- 2026-11-10 (owner decision): bump the Terms and Privacy version. `TERMS_VERSION` in `worker/legal.js` is now `2026-11-10`, so everyone is asked to accept again on their next visit after the deploy. One bump covers the face-photo section (F17) and the AI section (F21).
- 2026-11-10 (Claude subagent): Built the foundation, tested with a stubbed gateway only. **No real model call was made, and `.dev.vars` was not opened.** Decision: [[D028 AI goes through one Worker-side foundation that fails closed]]. Migration `0024_ai_foundation.sql`. Left In progress on purpose: the last acceptance check needs the owner's key and the Gateway, and AI is off in production config until the owner steps are done.
- **Prices are not confirmed.** The $0.10 and $0.50 per million tokens come from the plan and were not checked against Anthropic's published pricing. They are config (`AI_PRICE_*`, `worker/ai/price.js`), and the admin page says "not checked" until the owner sets both vars. **Owner step 2: confirm the prices and set the price vars.**
- **Provider features not relied on.** Prompt caching parameters, the Batch API and Gateway spend limits were not built on: we have our own cache (`ai_cache`), budget counters (`ai_daily`) and kill switch. The Gateway address form, spend limits and rate limits are owner steps to verify (step 4).
- **API for later features** (`worker/ai/`): `callModel(env, { feature, actor: { kind: "user"|"host", id }, promptVersion, system, data, schema, maxTokens, subjects, scope, regenerate, automatic, ip, cacheTtlMs, stub, allowFrom, refine })` returns `{ fallback: false, result, cached, usage, remaining }` or `{ fallback: true, reason, message }`; `allowanceFor(env, actor, feature, scope)` for "2 of 3 left today"; `searchableIds(db, ids)` (people who have not opted out of AI search; features must use it when gathering people and pass the same people as `subjects`); `cleanText`, `pickFields`, `deepClean`, `assignIds`, `parseModelJson`, `S` and `validate`, `filterIds`, `exactQuotes`, `stripContacts`; `prompts/adminTest.js` shows the shape of a prompt file. A feature needs an entry in `AI_LIMITS` (`worker/plans.js`); `feedback_summary_auto` is already there for F23's automatic summary (separate from the 3 regenerations a day). Use `ip: c.req.header("cf-connecting-ip")` from routes; leave it out for cron jobs and pass `automatic: true`.
- **How each line of the privacy and security bar is tested** (`test/ai.mjs` unless noted): the key never reaches a response, log, usage row or cache row (one test reads all of them for the key; the status, admin and test-button responses are searched too); guests, accounts with no confirmed email, signed-out callers, a wrong kind of caller and disabled or deleted hosts are refused with no gateway call and no usage row; quota (day, month, per event, an expired Plus plan), burst, address limit, daily and monthly budget (including `0.000001` and a mistyped budget), kill switch (env, unset, admin) and timeout each return a friendly fallback, are checked to make no call where none should be made, and add nothing to spend; a cache hit adds no cost, no call and no quota use, a row is never returned to anyone else (not another user, not a host with the same id) and changed input, prompt version, model or an opt-out gives a miss or a refusal; no prompt is stored, replies are cached for at most 7 days (a request for a year is cut), and the cache, counts and orphan rows are in the export, removed on account deletion and by the purge (13 months for counts, simulated clock); the opt-out is checked inside `callModel` before the cache is read, with blocks, and the Settings switch, consent history and export are tested; injection rules are in `test/ai-injection.mjs` (150 checks, a model that obeys every attack: allowed ids only, exact quotes only, no new links, emails or phone numbers, no hidden fields reach the model, `</data>` cannot close the block, no `v-html` for model text); hosts see nothing per person (they have only their own counts, tested in their export; summaries use anonymous answers); admin routes return 401 without the token, 503 when it is unset, and are refused with an attendee or host cookie.
- **Tests changed:** none of the existing tests were weakened or edited. `package.json` runs `test/ai.mjs` and `test/ai-injection.mjs` before the budget check. One existing check, `test/codes.mjs` "a held (retired) random code can't be claimed", failed once in about ten runs by chance (a random card code made only of digits, so the request is a 400 not a 409); it is unrelated and passes on a re-run. It needs a fix in its own feature.
- First-load JS (gzip, `test/budget.mjs`), before (commit e37bdd8) and after: PublicCard 49,906 to 49,898 B (-8), PrivacyRequest 50,086 to 50,078 B (-8), Privacy 47,379 to 48,456 B (+1,077, the new policy section), Landing 44,698 to 44,687, Hosts 43,160 to 43,154, Terms 47,220 to 47,214, Redeem 46,504 to 46,498, SignIn 47,787 to 47,781 (the small falls are the shorter chunk map in the entry). Headroom now: PublicCard about 1.3 KB, PrivacyRequest about 1.1 KB, Privacy about 2.7 KB. The new Settings components are in the lazy Settings chunks and nothing was added to `api.js`, `store.js`, `profile.js`, `Icon.vue`, the entry or the router.
- **Decisions I made without the owner:** kill switch, stage and allow-list in D1 not KV; the allow-list holds email addresses; stage names `allowlist`, `plus`, `everyone` (default `allowlist`, empty); a verified-email, non-guest account is the eligibility rule; hosts count as in at the Plus stage; `optOut` applies to people search and who-to-meet only; a reply that is paid for but fails the check still counts against the quota and the budget; a timed-out call counts nothing (the provider may still bill it); `feedback_summary_auto` as its own limit (30 a day) so the automatic summary does not use the host's 3 regenerations; the opt-out is logged in `consent_log` as scope `ai_search`; the admin "Run a test call" button; quotas are checked then taken, so a concurrent pair of calls can overshoot by one.
- **Not checked:** a real model call; a real phone or screen reader; the budget emails against a real mailbox (tested through the mail outbox); the Gateway address form.

> [!question] Does the AI search opt-out also stop follow-up drafts? Today `optOut` is set for people search and who-to-meet only, because the setting's wording is about being found. A draft to someone you connected with uses their visible fields for the asker's own message, but they might expect "no AI" to cover it. Setting `optOut: true` on `followup` in `AI_LIMITS` is a one-word change. Owner: decide, and make [[F22 AI follow-up drafts]] and the Settings wording match.

> [!question] Terms and Privacy version. The Privacy Policy now has an AI section (8c) and the people-search default. The agent did not bump `TERMS_VERSION` (it makes everyone accept again, and F17 flagged the same). Owner: decide before turning AI on. The policy says the providers may not train on this data and that logging is off: both need the owner steps 3 and 4 first.

Related: [[Security]], [[Privacy and Data Retention]] · back to [[00 Master To-Do]]
