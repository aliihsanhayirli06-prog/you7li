ALTER TABLE publishes
ADD COLUMN IF NOT EXISTS video_asset_path TEXT,
ADD COLUMN IF NOT EXISTS youtube_video_id TEXT,
ADD COLUMN IF NOT EXISTS youtube_published_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS youtube_sync_status TEXT;
