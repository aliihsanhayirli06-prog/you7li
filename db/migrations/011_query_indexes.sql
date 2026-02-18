CREATE INDEX IF NOT EXISTS idx_publishes_status_created_at
  ON publishes(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_action_occurred
  ON usage_events(action, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_queue_status_created
  ON review_queue(status, created_at DESC);
