-- RentVolt API — Initial schema
-- Created: 2026-04-17
-- Owner: Groundwork Labs LLC

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── users ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   citext UNIQUE NOT NULL,
  stripe_customer_id      text UNIQUE,
  terms_accepted_version  text,
  terms_accepted_at       timestamptz,
  terms_accepted_ip       inet,
  terms_accepted_ua       text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ─── api_keys ───────────────────────────────────────────
-- key_hash = sha256(raw_key); we never store the raw key.
CREATE TABLE IF NOT EXISTS api_keys (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash                text UNIQUE NOT NULL,
  key_prefix              text NOT NULL,
  plan                    text NOT NULL CHECK (plan IN ('free','growth','scale','enterprise')),
  monthly_requests        int  NOT NULL,
  used                    int  NOT NULL DEFAULT 0,
  reset_at                timestamptz NOT NULL DEFAULT now(),
  status                  text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','past_due','cancelled','revoked')),
  stripe_subscription_id  text UNIQUE,
  last_used_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user    ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_status  ON api_keys(status);

-- ─── usage_events (append-only) ─────────────────────────
CREATE TABLE IF NOT EXISTS usage_events (
  id            bigserial PRIMARY KEY,
  api_key_id    uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint      text NOT NULL,
  status_code   int  NOT NULL,
  ms            int,
  ip            inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_key_time ON usage_events(api_key_id, created_at DESC);

-- ─── webhook_events (Stripe idempotency) ────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  stripe_event_id  text PRIMARY KEY,
  event_type       text NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  error            text
);

-- ─── listings_cache ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS listings_cache (
  cache_key   text PRIMARY KEY,
  payload     jsonb NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listings_cache_expires ON listings_cache(expires_at);

-- ─── privacy_requests (CCPA/CPRA) ───────────────────────
CREATE TABLE IF NOT EXISTS privacy_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL,
  request_type   text NOT NULL
                 CHECK (request_type IN ('access','delete','correct','opt_out','limit_sensitive','appeal')),
  status         text NOT NULL DEFAULT 'received'
                 CHECK (status IN ('received','in_progress','completed','denied')),
  verification_token text,
  received_at    timestamptz NOT NULL DEFAULT now(),
  responded_at   timestamptz,
  notes          text
);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_email ON privacy_requests(email);

-- ─── magic_links (dashboard passwordless auth) ──────────
CREATE TABLE IF NOT EXISTS magic_links (
  token        text PRIMARY KEY,
  email        citext NOT NULL,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON magic_links(expires_at);

-- ─── free_key_issuance (daily per-IP limit) ─────────────
CREATE TABLE IF NOT EXISTS free_key_issuance (
  ip          inet NOT NULL,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ip, issued_at)
);
CREATE INDEX IF NOT EXISTS idx_free_key_issuance_time ON free_key_issuance(issued_at DESC);

-- ─── demo_usage (unauthenticated demo tracking) ─────────
CREATE TABLE IF NOT EXISTS demo_usage (
  ip          inet PRIMARY KEY,
  count       int  NOT NULL DEFAULT 1,
  first_used  timestamptz NOT NULL DEFAULT now(),
  last_used   timestamptz NOT NULL DEFAULT now()
);

-- ─── feedback (cancel-page responses) ───────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        citext,
  reason       text,
  message      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── schema_migrations ──────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations (version) VALUES ('0001_initial') ON CONFLICT DO NOTHING;
