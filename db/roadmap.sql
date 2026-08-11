-- Ethereum Beat — ROADMAP channel seed (CH 07).
-- Apply with: wrangler d1 execute ethereum_beat --file db/roadmap.sql [--local|--remote]
-- Idempotent (INSERT OR REPLACE). Machine fields (status/target/meta link) are
-- refreshed daily from Forkcast; these summaries + CROPS tags are hand-authored
-- and the refresh never overwrites them.
--
-- VOICE: protocol/network-health significance only. No price, "catalyst",
-- market or trading framing — that is stripped from the upstream sources on
-- purpose. Dates SLIP: date_locked = 1 ONLY when a mainnet date is truly fixed.

INSERT OR REPLACE INTO roadmap_upgrades
  (id, name, codename, status, sort, target_label, date_locked, activation_date,
   summary, significance, crops, meta_eip_url, source_name, source_url, updated_at)
VALUES
  ('fusaka', 'Fusaka', 'Fulu + Osaka', 'live', 10, 'Dec 2025 · live', 1, '2025-12-03',
   'Live since December 2025. PeerDAS lets a node confirm blob data is available by sampling small pieces instead of downloading every blob, so running a node stays affordable as Layer-2 data grows.',
   'Data-availability sampling lets the network carry far more rollup data without asking each node to store all of it. Verifying the chain stays within reach of ordinary hardware, keeping it in many independent hands rather than a handful of large operators.',
   'CR,O',
   'https://eips.ethereum.org/EIPS/eip-7607',
   'Forkcast', 'https://forkcast.org/upgrade/fusaka', NULL),

  ('glamsterdam', 'Glamsterdam', 'Gloas + Amsterdam', 'devnet', 20, 'H2 2026 target · no date locked', 0, NULL,
   'In development and running on devnets, aiming for the second half of 2026 — no mainnet date is locked. Headlined by enshrined proposer-builder separation (ePBS) and block-level access lists.',
   'ePBS builds the proposer/builder split into the protocol, so validators no longer depend on trusted relays to receive blocks — shrinking a central point that could be pressured to exclude transactions. Block-level access lists declare upfront which state a block touches, making blocks easier to verify and cheaper to execute in parallel.',
   'CR,S,O',
   'https://ethereum-magicians.org/t/eip-7773-glamsterdam-network-upgrade-meta-thread/21195',
   'Forkcast', 'https://forkcast.org/upgrade/glamsterdam', NULL),

  ('hegota', 'Hegotá', NULL, 'planning', 30, '~2027 · early planning', 0, NULL,
   'Early planning for around 2027. Headliner selection has begun, with FOCIL — fork-choice-enforced inclusion lists — slated to make censorship resistance a protocol guarantee rather than a best effort.',
   'FOCIL lets a committee of validators force valid transactions to be included, so no single block builder can quietly leave a transaction out. It turns censorship resistance from something the network hopes for into something the protocol enforces.',
   'CR',
   'https://ethereum-magicians.org/t/eip-8081-hegota-network-upgrade-meta-thread/26876',
   'Forkcast', 'https://forkcast.org/upgrade/hegota', NULL);

INSERT OR REPLACE INTO roadmap_eips
  (upgrade_id, eip, title, inclusion, summary, rationale, layer, crops, sort)
VALUES
  ('fusaka', 7594, 'PeerDAS', 'included',
   'Nodes sample small pieces of blob data instead of downloading all of it, keeping node operation affordable as data scales.',
   'Full nodes today download every blob to check the data is available. PeerDAS lets each node download and verify only a small random sample of the columns, relying on erasure coding and the wider network to guarantee the rest is retrievable. Data-availability cost stops scaling with the number of blobs per node, so blob capacity can rise without pricing ordinary operators out of running a node.',
   'CL', 'CR,O', 10),

  ('glamsterdam', 7732, 'ePBS', 'scheduled',
   'Enshrined proposer-builder separation: the protocol runs the proposer/builder split directly, removing reliance on trusted relays.',
   'Block building is dominated by a few specialised builders reached through off-protocol relays the proposer must trust. ePBS writes the proposer/builder split into consensus itself: the proposer commits to a builder bid, and the block is revealed and attested in-protocol with no trusted relay. That removes a fragile central piece of the pipeline and a point that could be pressured to exclude transactions.',
   'CL', 'CR,S', 10),
  ('glamsterdam', 7928, 'Block-level access lists', 'scheduled',
   'Declares which accounts and storage a block touches upfront, enabling parallel execution and cheaper verification.',
   'A block-level access list declares up front every account and storage slot the whole block will touch. Clients can then load that state in parallel and validate transactions concurrently instead of discovering dependencies one at a time. It is a building block for stateless clients and cheaper verification, keeping the cost of checking the chain low as throughput grows.',
   'EL', 'O,S', 20),

  ('hegota', 7805, 'FOCIL', 'scheduled',
   'Fork-choice-enforced inclusion lists let a committee force valid transactions to be included, so builders cannot silently censor.',
   'Inclusion lists let a committee of validators name transactions the next block must include if they are valid and there is room, and fork-choice enforcement means a block that ignores the list is rejected by honest validators. Censoring a transaction then costs the block itself, turning censorship resistance into an enforced rule rather than a norm.',
   'CL', 'CR', 10);
