-- Ethereum Beat — metric metadata seed
-- Apply with: wrangler d1 execute ethereum_beat --file db/meta.sql [--local|--remote]
-- featured controls the home rotation; the snapshot builder additionally skips
-- any metric that has no data rows, so optional metrics degrade silently.

INSERT OR REPLACE INTO metric_meta
  (metric_key, label, category, unit, description, source_name, source_url, featured, sort, agg_mode)
VALUES
  -- HEARTBEAT (liveness)
  ('uptime_days', 'Days of uptime', 'heartbeat', 'days',
   'Continuous days since genesis on 30 July 2015. Ethereum has never stopped producing blocks.',
   'computed from genesis', 'https://ethereum.org/en/history/', 1, 10, 'last'),
  ('finality_ok', 'Chain finalising', 'heartbeat', 'epoch',
   'The last finalised epoch. Finality means the chain''s history is locked in and cannot be rewritten.',
   'Beacon API (PublicNode)', 'https://ethereum-beacon-api.publicnode.com', 1, 20, 'last'),

  -- CENSORSHIP RESISTANCE
  ('validators_active', 'Active validators', 'censorship-resistance', 'count',
   'Independent validators currently securing the chain. More validators means no small group can block transactions.',
   'beaconcha.in', 'https://beaconcha.in', 1, 30, 'last'),
  ('staked_eth', 'ETH staked', 'censorship-resistance', 'eth',
   'Total ETH locked by validators as collateral for honest behaviour, shown with the share of all ETH.',
   'ultrasound.money', 'https://ultrasound.money', 1, 40, 'last'),
  ('staked_pct', 'Share of ETH staked', 'censorship-resistance', 'pct',
   'The percentage of all ETH that is staked to secure the network.',
   'ultrasound.money', 'https://ultrasound.money', 0, 45, 'last'),
  ('builder_share', 'Top builder share', 'censorship-resistance', 'pct',
   'Share of blocks built by the largest block builder. Lower concentration makes censorship harder.',
   'relayscan.io', 'https://www.relayscan.io', 0, 50, 'mean'),

  -- pass 13c: the old "resilience" property is gone. Client diversity is
  -- open-client evidence, so it lands under O (open source & free); node
  -- distribution defeats jurisdictional censorship, so it lands under CR.
  ('client_diversity_cl', 'Largest consensus client', 'openness', 'pct',
   'Share of the biggest consensus client. Below one third, a single client bug cannot break finality.',
   'blockprint (Sigma Prime)', 'https://blockprint.sigp.io', 0, 60, 'last'),
  ('client_diversity_el', 'Largest execution client', 'openness', 'pct',
   'Share of the biggest execution client. Diversity keeps one bug from becoming everyone''s bug.',
   'ethernodes.org', 'https://ethernodes.org', 0, 70, 'last'),
  ('node_countries', 'Countries running nodes', 'censorship-resistance', 'count',
   'Countries where Ethereum nodes run. Geographic spread means no jurisdiction can switch Ethereum off.',
   'ethernodes.org', 'https://ethernodes.org', 0, 80, 'last'),

  -- OPENNESS / OPEN SOURCE & FREE (usage + open clients)
  ('daa_combined', 'Daily active addresses', 'openness', 'count',
   'Unique addresses active today across Ethereum and its layer 2 networks.',
   'growthepie', 'https://www.growthepie.com', 1, 90, 'sum'),
  ('txcount_combined', 'Daily transactions', 'openness', 'count',
   'Transactions settled today across Ethereum and its layer 2 networks.',
   'growthepie', 'https://www.growthepie.com', 1, 100, 'sum'),
  ('throughput', 'Throughput', 'openness', 'mgas_s',
   'Combined computation processed per second across Ethereum and its layer 2 networks, measured in gas.',
   'growthepie', 'https://www.growthepie.com', 1, 110, 'mean'),
  ('blobs_daily', 'Blobs per day', 'openness', 'count',
   'Data blobs posted to Ethereum each day. Blobs are how layer 2 networks land their data on Ethereum.',
   'growthepie', 'https://www.growthepie.com', 0, 120, 'sum'),
  ('l2_count', 'Live layer 2 networks', 'openness', 'count',
   'Layer 2 networks live on Ethereum and tracked by growthepie.',
   'growthepie', 'https://www.growthepie.com', 0, 130, 'last'),
  ('contracts_deployed', 'New contracts per day', 'openness', 'count',
   'Smart contracts deployed on Ethereum today. Every one is a small act of permissionless building.',
   'Dune', 'https://dune.com', 0, 140, 'sum'),

  -- SECURITY (value secured — things do what they claim; pass 13c: the
  -- old combined "privacy & security" bucket becomes S. No metric today
  -- measures Privacy (P); the property still exists as a badge and on /about.)
  -- pass 15: unfeatured from the BEAT rotation (too financial for the beat);
  -- it lives on CH6 LAYERS as the onchain-economy panel. Metric, API and
  -- /pulse/stables_supply keep working.
  ('stables_supply', 'Stablecoin supply', 'security', 'usd',
   'Value of stablecoins issued on Ethereum and its layer 2 networks. Everyday money settling on neutral rails.',
   'growthepie', 'https://www.growthepie.com', 0, 150, 'last'),
  ('rwa_value', 'Real-world assets', 'security', 'usd',
   'Value of tokenised real-world assets, such as treasury bills and bonds, secured by Ethereum.',
   'DefiLlama', 'https://defillama.com', 1, 160, 'last'),
  ('tvs', 'Total value secured', 'security', 'usd',
   'Total value locked in applications that trust Ethereum and its layer 2 networks for security.',
   'growthepie', 'https://www.growthepie.com', 1, 170, 'last');

-- pass 6 additions (spec §13.7)
INSERT OR REPLACE INTO metric_meta
  (metric_key, label, category, unit, description, source_name, source_url, featured, sort, agg_mode)
VALUES
  ('participation_rate', 'Sync participation', 'heartbeat', 'pct',
   'Share of the sync committee signing off on the latest block. Near 100% means validators are present and agreeing.',
   'Beacon API (PublicNode)', 'https://ethereum-beacon-api.publicnode.com', 1, 25, 'last'),
  ('validator_queue_entry', 'Validators joining', 'censorship-resistance', 'count',
   'Validators waiting in the entry queue. A long queue means more people want to help secure Ethereum than it admits per day.',
   'beaconcha.in', 'https://beaconcha.in', 0, 47, 'last'),
  ('validator_queue_exit', 'Validators leaving', 'censorship-resistance', 'count',
   'Validators waiting to exit. Ethereum rate-limits both doors so the validator set changes slowly and safely.',
   'beaconcha.in', 'https://beaconcha.in', 0, 48, 'last'),
  ('median_l2_fee', 'Median layer 2 fee', 'openness', 'usd_small',
   'The typical cost of a transaction on Ethereum''s layer 2 networks. Affordability is what makes openness real.',
   'growthepie', 'https://www.growthepie.com', 0, 125, 'mean'),
  ('blobs_per_block_avg', 'Blobs per block', 'openness', 'count',
   'Average blobs carried per block today, against a protocol target of 14.',
   'growthepie', 'https://www.growthepie.com', 0, 121, 'mean'),
  ('blob_chains', 'Chains posting blobs', 'openness', 'count',
   'Distinct chains that posted blob data to Ethereum today.',
   'growthepie', 'https://www.growthepie.com', 0, 122, 'last');

-- dp10c: per-metric arc caption overrides (fallback is the delta line).
-- uptime is the first user: its daily delta is meaningless.
UPDATE metric_meta SET caption = '100% UPTIME SINCE 2015' WHERE metric_key = 'uptime_days';
