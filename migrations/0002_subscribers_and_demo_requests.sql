-- RentVolt API — Newsletter + enterprise demo requests
-- Created: 2026-04-18

-- ─── newsletter_subscribers ────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext UNIQUE NOT NULL,
  source          text,          -- homepage, pricing, cancel, etc.
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  ip              inet,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_newsletter_source ON newsletter_subscribers(source);

-- ─── demo_requests (enterprise book-a-demo) ────────────
CREATE TABLE IF NOT EXISTS demo_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        citext NOT NULL,
  company      text,
  use_case     text,
  volume       text,           -- self-reported monthly request volume
  notes        text,
  status       text NOT NULL DEFAULT 'new'
               CHECK (status IN ('new','contacted','qualified','closed')),
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON demo_requests(status);

INSERT INTO schema_migrations (version) VALUES ('0002_subscribers_and_demo_requests') ON CONFLICT DO NOTHING;
