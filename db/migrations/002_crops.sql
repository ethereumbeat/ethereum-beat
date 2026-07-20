-- Pass 13c: re-home metrics to the four CROPS properties (CR · O · P · S).
-- The invented "resilience" category is retired; the combined
-- "privacy-security" bucket becomes "security". Idempotent.
--   wrangler d1 execute ethereum_beat --local  --file db/migrations/002_crops.sql
--   wrangler d1 execute ethereum_beat --remote --file db/migrations/002_crops.sql

-- client diversity = open-client evidence -> Open source & free (O)
UPDATE metric_meta SET category = 'openness'
  WHERE metric_key IN ('client_diversity_cl', 'client_diversity_el');

-- node distribution defeats jurisdictional censorship -> Censorship resistance (CR)
UPDATE metric_meta SET category = 'censorship-resistance'
  WHERE metric_key = 'node_countries';

-- value-secured metrics -> Security (S); the old combined bucket is gone
UPDATE metric_meta SET category = 'security'
  WHERE category = 'privacy-security';

-- backstop: nothing should remain under the retired category
UPDATE metric_meta SET category = 'censorship-resistance'
  WHERE category = 'resilience';
