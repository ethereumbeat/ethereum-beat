-- Pass 15: take stablecoin supply off the BEAT homepage rotation.
-- Too financial for the beat; it moves to CH6 LAYERS as the onchain-economy
-- panel. The metric, its API and /pulse/stables_supply keep working — only
-- the home feature flag changes. Idempotent.
--   wrangler d1 execute ethereum_beat --local  --file db/migrations/003_unfeature_stables.sql
--   wrangler d1 execute ethereum_beat --remote --file db/migrations/003_unfeature_stables.sql

UPDATE metric_meta SET featured = 0 WHERE metric_key = 'stables_supply';
