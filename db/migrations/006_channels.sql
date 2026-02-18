CREATE TABLE IF NOT EXISTS channels (
  channel_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  youtube_channel_id TEXT,
  default_language TEXT NOT NULL DEFAULT 'tr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE publishes
ADD COLUMN IF NOT EXISTS channel_id TEXT;

CREATE INDEX IF NOT EXISTS idx_publishes_channel_id ON publishes(channel_id);
