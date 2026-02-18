CREATE TABLE IF NOT EXISTS usage_events (
  event_id TEXT PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL,
  actor_role TEXT,
  channel_id TEXT,
  publish_id TEXT,
  units DOUBLE PRECISION NOT NULL,
  amount_usd DOUBLE PRECISION NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_occurred_at ON usage_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_channel_id ON usage_events(channel_id);
