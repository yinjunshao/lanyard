-- AI foundation (F21). Additive: old code ignores the new column and tables, so this is safe to
-- apply before the new code is deployed. Nothing here stores a prompt. A reply is stored only in
-- ai_cache, for at most 7 days; everything else is counts, tokens and cost.

-- People search opt-out (owner decision 2026-11-10): on by default, switched off in Settings.
-- Read through worker/ai/optout.js, never directly by a feature.
ALTER TABLE users ADD COLUMN ai_search_ok INTEGER NOT NULL DEFAULT 1;

-- Counts per day, person (or host account), feature and scope. scope is '' except for features that
-- are limited per event (who to meet), where it holds the event id. actor_id is not a foreign key
-- because it can name a user or a host account; the purge and erasure remove orphans.
-- Kept 13 months (purge). No text.
CREATE TABLE ai_usage (
  day           TEXT NOT NULL,              -- UTC, YYYY-MM-DD
  actor_kind    TEXT NOT NULL,              -- 'user', 'host' or 'admin'
  actor_id      TEXT NOT NULL,
  feature       TEXT NOT NULL,
  scope         TEXT NOT NULL DEFAULT '',
  calls         INTEGER NOT NULL DEFAULT 0, -- calls that went to the model and count against the quota
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micros   INTEGER NOT NULL DEFAULT 0, -- millionths of a US dollar
  cache_hits    INTEGER NOT NULL DEFAULT 0,
  fallbacks     INTEGER NOT NULL DEFAULT 0, -- asked, got the non-AI result
  limited       INTEGER NOT NULL DEFAULT 0, -- refused because a quota was reached
  PRIMARY KEY (day, actor_kind, actor_id, feature, scope)
);
CREATE INDEX idx_ai_usage_actor ON ai_usage(actor_kind, actor_id);

-- A stored reply. The key is a SHA-256 over the actor, feature, prompt version, model and the exact
-- input, so another person (or the same person with different data) can never get this row.
-- Deleted when it expires (7 days at most, daily purge), with the account, and in the data export.
CREATE TABLE ai_cache (
  key        TEXT PRIMARY KEY,
  feature    TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id   TEXT NOT NULL,
  result     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_ai_cache_actor ON ai_cache(actor_kind, actor_id);
CREATE INDEX idx_ai_cache_expires ON ai_cache(expires_at);

-- Spend per UTC day, for the budget. alerted is a bit mask of the 50% and 90% emails already sent.
CREATE TABLE ai_daily (
  day         TEXT PRIMARY KEY,
  cost_micros INTEGER NOT NULL DEFAULT 0,
  calls       INTEGER NOT NULL DEFAULT 0,
  cache_hits  INTEGER NOT NULL DEFAULT 0,
  fallbacks   INTEGER NOT NULL DEFAULT 0,
  alerted     INTEGER NOT NULL DEFAULT 0
);

-- Kill switch, rollout stage and allow-list, changed from the admin page and read on every call, so
-- a change takes effect at once. Keys: killed ('1'), rollout ('allowlist' | 'plus' | 'everyone'),
-- allow (a JSON list of email addresses).
CREATE TABLE ai_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
