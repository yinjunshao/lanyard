-- Lanyard v2 schema (D1 / SQLite)
-- Conventions: ids are 10-char unguessable hex; short codes are user-facing.
-- All timestamps are unix milliseconds.

PRAGMA foreign_keys = ON;

-- ---------- Identity ----------
CREATE TABLE users (
  id               TEXT PRIMARY KEY,
  created_at       INTEGER NOT NULL,
  is_guest         INTEGER NOT NULL DEFAULT 1,
  recovery_email   TEXT,
  email_domain     TEXT,
  verified_student INTEGER NOT NULL DEFAULT 0,
  verified_at      INTEGER,
  has_passkey      INTEGER NOT NULL DEFAULT 0,
  over_18          INTEGER NOT NULL DEFAULT 0,
  age_confirmed_at INTEGER
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,            -- random 32-char token, value of cookie
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE webauthn_credentials (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,     -- base64url
  public_key    TEXT NOT NULL,           -- base64url COSE
  counter       INTEGER NOT NULL DEFAULT 0,
  transports    TEXT,                     -- JSON array
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_webauthn_user ON webauthn_credentials(user_id);

-- ---------- Profile + cards ----------
CREATE TABLE profiles (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  photo_key  TEXT,
  uni        TEXT,
  course     TEXT,
  year       TEXT,
  headline   TEXT,                        -- "what you do"
  about      TEXT,
  links      TEXT NOT NULL DEFAULT '{}',  -- JSON {label:url}
  tags       TEXT NOT NULL DEFAULT '[]',  -- JSON "come to me for"
  projects   TEXT NOT NULL DEFAULT '[]',  -- JSON up to 3 {title,line,url,image_key}
  is_public  INTEGER NOT NULL DEFAULT 1,
  show_age   INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE cards (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code          TEXT UNIQUE,              -- 4-char human code (default card keeps legacy code)
  name          TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  visible_links TEXT NOT NULL DEFAULT '[]', -- JSON: subset of profile link keys, [] = all
  tags          TEXT NOT NULL DEFAULT '[]', -- JSON per-card override subset; [] = use profile tags
  theme         TEXT NOT NULL DEFAULT 'default', -- default | formal | night | host
  strap_color   TEXT,                     -- host brand override
  event_id      TEXT,
  is_default    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_cards_user ON cards(user_id);

-- ---------- Connections ----------
CREATE TABLE connections (
  id          TEXT PRIMARY KEY,
  user_a      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    TEXT,
  selfie_key  TEXT,
  consent_a   INTEGER NOT NULL DEFAULT 0, -- selfie consent recorded at capture
  consent_b   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  UNIQUE (user_a, user_b)
);
CREATE INDEX idx_conn_a ON connections(user_a);
CREATE INDEX idx_conn_b ON connections(user_b);
CREATE INDEX idx_conn_event ON connections(event_id);

CREATE TABLE notes (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  text          TEXT NOT NULL DEFAULT '',
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, connection_id)
);

CREATE TABLE messages (
  id            TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  from_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text          TEXT NOT NULL DEFAULT '',
  photo_key     TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_messages_conn ON messages(connection_id);

-- ---------- Events / hosts ----------
CREATE TABLE orgs (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  plan                TEXT NOT NULL DEFAULT 'pilot', -- pilot|pay_per_event|termly|licence
  org_type            TEXT NOT NULL DEFAULT 'other', -- society|careers_service|company|other
  verification_status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  verified_by         TEXT,
  union_listing_url   TEXT,
  discount_tier       TEXT,
  created_at          INTEGER NOT NULL
);

CREATE TABLE org_members (
  org_id  TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL DEFAULT 'owner',   -- owner|staff|sponsor_viewer
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE events (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT REFERENCES orgs(id) ON DELETE SET NULL,
  code               TEXT NOT NULL UNIQUE, -- short join code for /e/:code
  name               TEXT NOT NULL,
  starts_at          INTEGER,
  venue              TEXT,
  theme              TEXT NOT NULL DEFAULT 'default',
  strap_color        TEXT,
  perks              TEXT NOT NULL DEFAULT '[]', -- JSON
  directory_on       INTEGER NOT NULL DEFAULT 1,
  checkin_questions  TEXT NOT NULL DEFAULT '[]', -- JSON up to 3 {key,label}
  is_paid            INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL
);
CREATE INDEX idx_events_org ON events(org_id);

CREATE TABLE checkins (
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers    TEXT NOT NULL DEFAULT '{}',      -- JSON answers to checkin questions
  sponsor    TEXT NOT NULL DEFAULT '[]',      -- JSON of sponsor ids explicitly opted in
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX idx_checkins_user ON checkins(user_id);

CREATE TABLE sponsors (
  id        TEXT PRIMARY KEY,
  event_id  TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  logo_key  TEXT,
  perk      TEXT
);
CREATE INDEX idx_sponsors_event ON sponsors(event_id);

-- ---------- Billing (credits, no Stripe yet) ----------
CREATE TABLE credits (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  events_granted INTEGER NOT NULL DEFAULT 0,
  events_used    INTEGER NOT NULL DEFAULT 0,
  expires_at     INTEGER,
  reason         TEXT,
  granted_by     TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_credits_org ON credits(org_id);

CREATE TABLE promo_redemptions (
  code       TEXT NOT NULL,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (code, org_id)
);

-- ---------- Safety / GDPR ----------
CREATE TABLE consents (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL,             -- 'selfie' | 'marketing' | 'sponsor:<id>'
  granted    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, scope)
);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
