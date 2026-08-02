-- PR C: per-metric comparison window. Adds metric_meta.compare_window and sets
-- each metric's window so the homepage delta and the detail view compare over a
-- meaningful span (a daily "vs yesterday" is meaningless on slow metrics), and
-- monotonic metrics show their caption/nothing instead of a 0.0% delta.
--
-- Existing DBs (SQLite has no ADD COLUMN IF NOT EXISTS, so run once):
--   wrangler d1 execute ethereum_beat --local  --file db/migrations/004_compare_window.sql
--   wrangler d1 execute ethereum_beat --remote --file db/migrations/004_compare_window.sql
-- Then rebuild the KV snapshot so the new field reaches the page:
--   wrangler kv key delete --binding=KV snapshot:latest --remote   (self-heals on next read)

ALTER TABLE metric_meta ADD COLUMN compare_window TEXT DEFAULT 'd';

UPDATE metric_meta SET compare_window = 'none' WHERE metric_key IN ('uptime_days', 'finality_ok');
UPDATE metric_meta SET compare_window = 'm' WHERE metric_key IN
  ('staked_eth', 'staked_pct', 'validators_active', 'tvs', 'stables_supply', 'rwa_value',
   'client_diversity_cl', 'client_diversity_el');
UPDATE metric_meta SET compare_window = 'w' WHERE metric_key IN
  ('median_l2_fee', 'builder_share', 'validator_queue_entry', 'validator_queue_exit', 'blob_chains');
UPDATE metric_meta SET compare_window = 'q' WHERE metric_key IN ('l2_count', 'node_countries');
UPDATE metric_meta SET compare_window = 'd' WHERE metric_key IN
  ('participation_rate', 'daa_combined', 'txcount_combined', 'throughput', 'blobs_daily',
   'blobs_per_block_avg', 'contracts_deployed');
