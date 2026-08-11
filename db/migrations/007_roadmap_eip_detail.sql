-- Pass: ROADMAP redesign (CH 07) — richer per-EIP cards.
-- ADDITIVE columns on roadmap_eips: a fuller `rationale` and the `layer`
-- (EL/CL) each EIP touches. metric_meta is NOT touched. Fresh installs get
-- these from db/schema.sql; the seed values live in db/roadmap.sql.
--
-- ⚠ MANUAL REMOTE STEP. The production D1 already exists, so this schema change
-- must be applied by hand to remote D1, then the seed re-run to populate:
--
--   wrangler d1 execute ethereum_beat --remote --file db/migrations/007_roadmap_eip_detail.sql
--   wrangler d1 execute ethereum_beat --remote --file db/roadmap.sql
--
-- KV: no bust strictly required (the page + /api/roadmap self-heal on a missing
-- roadmap:latest), but bust it to force an immediate refresh after re-seeding:
--   wrangler kv key delete --binding=SNAP roadmap:latest --remote
--
-- SQLite has no "ADD COLUMN IF NOT EXISTS"; running this twice errors harmlessly.

ALTER TABLE roadmap_eips ADD COLUMN rationale TEXT;
ALTER TABLE roadmap_eips ADD COLUMN layer TEXT;
