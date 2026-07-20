-- Migration for DBs created before dp10c: adds metric_meta.caption.
-- Fresh installs get the column from db/schema.sql (CREATE TABLE), so this
-- is only for existing local/remote databases. SQLite has no
-- "ADD COLUMN IF NOT EXISTS"; running it twice errors harmlessly.
--   wrangler d1 execute ethereum_beat --local  --file db/migrations/001_caption.sql
--   wrangler d1 execute ethereum_beat --remote --file db/migrations/001_caption.sql
ALTER TABLE metric_meta ADD COLUMN caption TEXT;
UPDATE metric_meta SET caption = '100% UPTIME SINCE 2015' WHERE metric_key = 'uptime_days';
