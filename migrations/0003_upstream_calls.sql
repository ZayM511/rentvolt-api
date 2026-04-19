-- RentVolt API — Upstream cost tracking
-- Created: 2026-04-19
-- Purpose: log every upstream API call (RentCast, HUD, Census) so we can
-- reconcile monthly bills, watch unit economics, and alert when a tier is
-- margin-negative.

CREATE TABLE IF NOT EXISTS upstream_calls (
  id              bigserial PRIMARY KEY,
  source          text NOT NULL,        -- 'rentcast', 'hud', 'census'
  endpoint        text,                  -- short label, e.g. 'listings/rental/long-term'
  api_key_id      uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  plan            text,                  -- 'free' | 'growth' | 'scale' | 'enterprise' | null (demo)
  cost_cents      int NOT NULL DEFAULT 0,
  cache_hit       boolean NOT NULL DEFAULT false,
  duration_ms     int,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_upstream_calls_time   ON upstream_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upstream_calls_source ON upstream_calls(source);
CREATE INDEX IF NOT EXISTS idx_upstream_calls_plan   ON upstream_calls(plan);

INSERT INTO schema_migrations (version) VALUES ('0003_upstream_calls') ON CONFLICT DO NOTHING;
