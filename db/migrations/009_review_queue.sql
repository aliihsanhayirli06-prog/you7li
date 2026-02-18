CREATE TABLE IF NOT EXISTS review_queue (
  review_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  publish_id TEXT NOT NULL,
  channel_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decision TEXT,
  reason TEXT,
  risk_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  categories JSONB,
  note TEXT,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_review_queue_tenant_status
  ON review_queue(tenant_id, status, created_at DESC);
