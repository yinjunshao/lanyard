-- F36: card payments through a provider (Polar first, D041). Additive only: three new tables,
-- safe to apply before the code is deployed (nothing reads them until BILLING_ENABLED = "1").
-- Kept 6 years, like billing_requests: a row never cascades away. When an account or an
-- organisation is deleted (account deletion, the host reset), its id on the row becomes NULL
-- and the organisation's name stays.

-- One row per checkout we start, with our own product and price. Paid only by a verified webhook.
CREATE TABLE billing_orders (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,              -- 'polar'
  product           TEXT NOT NULL,              -- our product id: plus_month, plus_year or a HOST_SKUS id
  kind              TEXT NOT NULL,              -- 'plus' or 'credits'
  amount_pence      INTEGER NOT NULL,           -- our price when the checkout started
  currency          TEXT NOT NULL,              -- 'gbp'
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,          -- Plus
  org_id            TEXT REFERENCES orgs(id) ON DELETE SET NULL,           -- host packs
  org_name          TEXT,
  host_account_id   TEXT REFERENCES host_accounts(id) ON DELETE SET NULL,  -- who pressed Pay
  checkout_id       TEXT UNIQUE,                -- the provider's checkout id
  provider_order_id TEXT UNIQUE,                -- the provider's order id, once paid
  status            TEXT NOT NULL DEFAULT 'open', -- open, paid, refunded, part_refunded, mismatch, failed
  express_start_at  INTEGER,                    -- when they ticked "start straight away"
  paid_at           INTEGER,
  refunded_at       INTEGER,
  created_at        INTEGER NOT NULL
);
CREATE INDEX idx_billing_orders_user ON billing_orders(user_id);
CREATE INDEX idx_billing_orders_org ON billing_orders(org_id);

-- One row per provider subscription (Plus), as its webhooks last said.
CREATE TABLE billing_subscriptions (
  id                       TEXT PRIMARY KEY,
  provider                 TEXT NOT NULL,
  provider_subscription_id TEXT NOT NULL,
  order_id                 TEXT,               -- the billing_orders row that started it
  user_id                  TEXT REFERENCES users(id) ON DELETE SET NULL,
  product                  TEXT NOT NULL,
  status                   TEXT NOT NULL,
  current_period_end       INTEGER,
  cancel_at_period_end     INTEGER NOT NULL DEFAULT 0,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  UNIQUE (provider, provider_subscription_id)
);
CREATE INDEX idx_billing_subscriptions_user ON billing_subscriptions(user_id);

-- Every verified webhook, once. The UNIQUE webhook id is what makes a replay do nothing; the
-- token is this delivery's, and every grant in the same batch runs only if it is the stored one.
CREATE TABLE billing_events (
  webhook_id  TEXT NOT NULL UNIQUE,
  provider    TEXT NOT NULL,
  type        TEXT NOT NULL,
  token       TEXT NOT NULL,
  outcome     TEXT,
  received_at INTEGER NOT NULL
);
