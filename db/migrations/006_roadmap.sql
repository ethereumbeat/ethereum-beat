-- Pass: ROADMAP channel (CH 07). NEW tables, a schema change — metric_meta is
-- NOT touched. This migration is idempotent (CREATE TABLE IF NOT EXISTS); the
-- seed content lives in db/roadmap.sql (INSERT OR REPLACE, also idempotent).
--
-- ⚠ MANUAL REMOTE STEP. Fresh installs get these tables from db/schema.sql, but
-- the production D1 already exists, so this schema change must be applied by
-- hand to remote D1 (the deploy pipeline never runs migrations):
--
--   wrangler d1 execute ethereum_beat --remote --file db/migrations/006_roadmap.sql
--   wrangler d1 execute ethereum_beat --remote --file db/roadmap.sql
--
-- KV: no bust required. /api/roadmap and /roadmap self-heal — a missing
-- roadmap:latest key is rebuilt from D1 on first request. Only bust it to force
-- an immediate refresh after re-seeding:
--   wrangler kv key delete --binding=SNAP roadmap:latest --remote
--
-- Local/CI get the same tables via db/schema.sql; db/roadmap.sql seeds both.

CREATE TABLE IF NOT EXISTS roadmap_upgrades (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  codename TEXT,
  status TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  target_label TEXT,
  date_locked INTEGER NOT NULL DEFAULT 0,
  activation_date TEXT,
  summary TEXT,
  significance TEXT,
  crops TEXT,
  meta_eip_url TEXT,
  source_name TEXT,
  source_url TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS roadmap_eips (
  upgrade_id TEXT NOT NULL,
  eip INTEGER NOT NULL,
  title TEXT NOT NULL,
  inclusion TEXT NOT NULL,
  summary TEXT,
  crops TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (upgrade_id, eip)
);
