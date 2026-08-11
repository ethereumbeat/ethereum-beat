-- Pass: ROADMAP 5-panel timeline (CH 07) — Pectra … Verge/Purge horizon.
-- ADDITIVE columns:
--   roadmap_upgrades.category — 'upgrade' (a dated network upgrade) vs 'horizon'
--     (long-range, un-dated research direction, e.g. Verge/Purge). Lets the UI
--     render the horizon panel with no codename/date, tagged "long-range · research".
--   roadmap_eips.phase — thematic phase label ('Verge' | 'Purge') used to group the
--     horizon's EIPs; NULL for dated-upgrade EIPs.
-- metric_meta is NOT touched. Fresh installs get these from db/schema.sql; the seed
-- sets the values.
--
-- ⚠ MANUAL REMOTE STEP. Production D1 already exists, so apply by hand to remote,
-- then re-run the seed to populate the new upgrades/EIP rows:
--
--   wrangler d1 execute ethereum_beat --remote --file db/migrations/008_roadmap_category.sql
--   wrangler d1 execute ethereum_beat --remote --file db/roadmap.sql
--
-- Then bust the KV snapshot so the page rebuilds from D1 immediately:
--   wrangler kv key delete --binding=SNAP roadmap:latest --remote
--
-- SQLite has no "ADD COLUMN IF NOT EXISTS"; running this twice errors harmlessly.

ALTER TABLE roadmap_upgrades ADD COLUMN category TEXT;
ALTER TABLE roadmap_eips ADD COLUMN phase TEXT;
