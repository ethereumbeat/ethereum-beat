-- Ethereum Beat — ROADMAP channel seed (CH 07).
-- Apply with: wrangler d1 execute ethereum_beat --file db/roadmap.sql [--local|--remote]
-- Idempotent (INSERT OR REPLACE). Machine fields (status/target/meta link) are
-- refreshed daily from Forkcast; these summaries, rationales, CROPS tags, layer,
-- category and phase are hand-authored and the refresh never overwrites them.
--
-- VOICE: protocol/network-health significance only. No price, "catalyst", market
-- or trading framing. Dates SLIP: date_locked = 1 ONLY when a mainnet date is
-- truly fixed. Every EIP number is verified against eips.ethereum.org and each
-- fork meta EIP (7600 Pectra, 7607 Fusaka, 7773 Glamsterdam, 8081 Hegotá).
--
-- Timeline order (sort): Pectra → Fusaka → Glamsterdam → Hegotá → Verge/Purge
-- horizon.  category: 'upgrade' = a dated network upgrade; 'horizon' = long-range
-- research direction (no codename, no date).

DELETE FROM roadmap_eips;
DELETE FROM roadmap_upgrades;

INSERT OR REPLACE INTO roadmap_upgrades
  (id, name, codename, status, category, sort, target_label, date_locked, activation_date,
   summary, significance, crops, meta_eip_url, source_name, source_url, updated_at)
VALUES
  ('pectra', 'Pectra', 'Prague + Electra', 'live', 'upgrade', 5, 'May 2025 · live', 1, '2025-05-07',
   'Live since May 2025. Pectra reshaped staking and validator mechanics and brought smart-account features to ordinary wallets, while widening the data path that anchors Layer-2 networks to Ethereum.',
   'Pectra combined execution and consensus changes to make the validator lifecycle safer and lighter, and to put account-abstraction features within reach of everyday accounts. Fewer, larger validators ease the messaging load every node carries, and execution-layer exit and deposit paths remove trust gaps in how stake enters and leaves the network.',
   'O,S',
   'https://eips.ethereum.org/EIPS/eip-7600',
   'Forkcast', 'https://forkcast.org/upgrade/pectra', NULL),

  ('fusaka', 'Fusaka', 'Fulu + Osaka', 'live', 'upgrade', 10, 'Dec 2025 · live', 1, '2025-12-03',
   'Live since December 2025. Fusaka introduced data-availability sampling (PeerDAS), letting a node confirm blob data is present by checking small random samples instead of downloading every blob.',
   'PeerDAS lets the network carry far more rollup data without asking each node to store all of it, so verifying the chain stays within reach of ordinary hardware. Keeping node operation affordable keeps the network in many independent hands as data demand grows.',
   'O,S',
   'https://eips.ethereum.org/EIPS/eip-7607',
   'Forkcast', 'https://forkcast.org/upgrade/fusaka', NULL),

  ('glamsterdam', 'Glamsterdam', 'Gloas + Amsterdam', 'devnet', 'upgrade', 20, '2026 target · not locked', 0, NULL,
   'In development on devnets, targeting 2026 with no mainnet date locked. Headlined by enshrined proposer-builder separation (ePBS) and block-level access lists.',
   'ePBS writes the proposer and builder split into the protocol, so validators no longer depend on trusted relays to receive blocks, removing a central point that could be pressured to exclude transactions. Block-level access lists let clients verify blocks in parallel, keeping the cost of checking the chain low as throughput grows.',
   'CR,O,S',
   'https://ethereum-magicians.org/t/eip-7773-glamsterdam-network-upgrade-meta-thread/21195',
   'Forkcast', 'https://forkcast.org/upgrade/glamsterdam', NULL),

  ('hegota', 'Hegotá', 'Heze + Bogotá', 'planning', 'upgrade', 30, 'late 2026 · planning', 0, NULL,
   'Early planning for late 2026, with headliner selection under way. FOCIL is the leading censorship-resistance candidate, alongside native account abstraction and statelessness research.',
   'Hegotá is shaping up around censorship resistance. Its lead candidate, FOCIL, would let a committee of validators force valid transactions to be included, turning censorship resistance from something the network hopes for into something the protocol enforces.',
   'CR,O',
   'https://ethereum-magicians.org/t/eip-8081-hegota-network-upgrade-meta-thread/26876',
   'Forkcast', 'https://forkcast.org/upgrade/hegota', NULL),

  ('verge-purge', 'Verge / Purge', NULL, 'research', 'horizon', 40, 'long-range · research', 0, NULL,
   'Not a scheduled upgrade — the long-range direction of the roadmap. The Verge aims to make verifying the chain cheap enough for anyone; the Purge aims to shrink what nodes must store and simplify the protocol.',
   'These are research directions, not dated forks. Together they keep Ethereum verifiable on modest hardware over the long run: stateless clients that check blocks without storing all state, and history and state expiry that stop a node footprint from growing without bound.',
   'O,S',
   NULL,
   'Strawmap', 'https://strawmap.org', NULL);

INSERT OR REPLACE INTO roadmap_eips
  (upgrade_id, eip, title, inclusion, summary, rationale, layer, crops, phase, sort)
VALUES
  -- ── PECTRA ─────────────────────────────────────────────────────────────
  ('pectra', 7702, 'Set code for EOAs', 'included',
   'Lets an ordinary wallet temporarily run contract code, enabling batching, sponsored fees and scoped permissions.',
   'Account-abstraction features arrive for the accounts nearly everyone already uses, with no move to a new address. Transaction bundling, gas sponsorship and key-scoping improve day-to-day safety and usability, narrowing the gap between simple and smart accounts across the ecosystem.',
   'EL', 'O,S', NULL, 10),
  ('pectra', 7251, 'Increase the MAX_EFFECTIVE_BALANCE', 'included',
   'Raises a validator maximum effective balance from 32 to 2048 ETH, letting stake consolidate into fewer validators.',
   'Operators can merge many small validators into one and solo stakers can compound rewards, shrinking the total validator count. A smaller set lowers peer-to-peer message and signature-aggregation load, easing the burden on every node and helping consensus scale while node operation stays broadly runnable.',
   'CL', 'O', NULL, 20),
  ('pectra', 7002, 'Execution layer triggerable withdrawals', 'included',
   'Lets validators exit or partially withdraw from their withdrawal credentials, without the active validator key.',
   'Withdrawal credentials represent ultimate ownership of staked funds, yet previously could not force an exit, leaving stakers dependent on node operators. Enabling exits from the execution layer closes a real trust gap, especially for pooled and delegated staking, with a fee that guards the request queue against spam.',
   'EL+CL', 'S,O', NULL, 30),
  ('pectra', 6110, 'Supply validator deposits on chain', 'included',
   'Reads validator deposits directly from block data, removing consensus-layer deposit voting.',
   'Deposits are taken from the execution block instead of proposer voting over polled data, making forged deposits infeasible and cutting deposit delay from around twelve hours to roughly thirteen minutes. It also removes a polling dependency, hardening a security-critical part of the staking path.',
   'EL+CL', 'S', NULL, 40),
  ('pectra', 7691, 'Blob throughput increase', 'included',
   'Raises target and maximum blobs per block, expanding the data availability Layer-2 rollups post to Ethereum.',
   'More blob capacity gives rollups more room to publish their data to Ethereum, reinforcing the security those layers inherit from the base chain. Fee parameters are retuned so the blob market stays stable as capacity grows.',
   'EL+CL', 'O', NULL, 50),

  -- ── FUSAKA ─────────────────────────────────────────────────────────────
  ('fusaka', 7594, 'PeerDAS — peer data availability sampling', 'included',
   'Nodes verify blob data by sampling small random pieces instead of downloading all of it.',
   'Full nodes once downloaded every blob to confirm availability. PeerDAS has each node check only a small random sample, relying on erasure coding and the wider network for the rest. Data-availability cost stops scaling with the number of blobs per node, so capacity can rise without pricing ordinary operators out of running a node.',
   'EL+CL', 'O,S', NULL, 10),
  ('fusaka', 7892, 'Blob-parameter-only hardforks', 'included',
   'Defines lightweight forks that adjust only blob-capacity parameters, nothing else.',
   'Blob capacity can rise in small, well-observed steps as sampling proves stable in production. Isolating blob parameters into minimal forks lowers coordination risk and the chance of consensus bugs, making data scaling a controlled process rather than one large jump.',
   'EL+CL', 'O', NULL, 20),
  ('fusaka', 7935, 'Set default gas limit to 60M', 'included',
   'Raises the execution clients default block gas target toward 60 million.',
   'A higher default lifts per-block execution capacity for users and applications, and coordinating it across clients keeps validators aligned rather than fragmented. Other Fusaka limits keep worst-case blocks bounded so the higher target does not strain smaller nodes.',
   'EL', 'O', NULL, 30),
  ('fusaka', 7951, 'Precompile for secp256r1 curve support', 'included',
   'Adds cheap on-chain verification for secp256r1 (P-256) signatures used by secure hardware.',
   'Wallets and contracts can verify signatures from passkeys and phone secure enclaves at low cost. That strengthens account security and lowers the barrier to self-custody for mainstream users, while staying interface-compatible with existing use.',
   'EL', 'S,O', NULL, 40),
  ('fusaka', 7825, 'Transaction gas limit cap', 'included',
   'Caps any single transaction at about 16.7 million gas at the protocol level.',
   'Bounding per-transaction gas limits worst-case building and validation cost, shrinking denial-of-service surface. Predictable bounds help clients keep block processing times stable across varied hardware, protecting smaller operators as the block gas limit rises.',
   'EL', 'S,O', NULL, 50),

  -- ── GLAMSTERDAM ────────────────────────────────────────────────────────
  ('glamsterdam', 7732, 'Enshrined proposer-builder separation', 'scheduled',
   'Moves the proposer-builder split into the protocol, replacing trusted external relays with an in-protocol path.',
   'Block building is dominated by a few specialised builders reached through off-protocol relays the proposer must trust. Enshrining the split lets the proposer commit to a builder in-protocol, with the block revealed and attested without a trusted relay. That removes a fragile central piece and a point that could be pressured to censor transactions.',
   'CL', 'CR,O,S', NULL, 10),
  ('glamsterdam', 7928, 'Block-level access lists', 'scheduled',
   'Records the accounts and storage a block touches, enabling parallel validation and cheaper verification.',
   'A block-level access list declares up front the state the whole block will read and write. Clients can then load state and validate transactions in parallel instead of discovering dependencies one at a time. Cheaper, faster verification keeps running a full node accessible to more participants.',
   'EL', 'O,S', NULL, 20),
  ('glamsterdam', 7688, 'Forward-compatible consensus data structures', 'scheduled',
   'Migrates consensus data structures so verifiers stay valid across upgrades without changes.',
   'Stable, forward-compatible merkleization means light clients and independent verifiers do not break each time an unrelated feature changes. That lowers the maintenance burden of verifying the chain and keeps the verifier ecosystem diverse across successive upgrades.',
   'CL', 'O,S', NULL, 30),
  ('glamsterdam', 7782, 'Reduce block latency', 'considered',
   'A proposal to halve slot time from 12 to 6 seconds, cutting time-to-inclusion.',
   'Shorter slots reduce how long a transaction waits and spread bandwidth more evenly, but they raise the bar on propagation and hardware for smaller validators. It is actively discussed but was not selected as a headliner, so its inclusion is genuinely unsettled.',
   'CL', NULL, NULL, 40),

  -- ── HEGOTÁ ─────────────────────────────────────────────────────────────
  ('hegota', 7805, 'Fork-choice enforced inclusion lists (FOCIL)', 'candidate',
   'A validator committee builds inclusion lists that proposers must honour, enforced by the fork-choice rule.',
   'Inclusion lists let a committee name transactions the next block must include if they are valid and there is room, and honest validators reject a block that ignores the list. Censoring a transaction then costs the block itself, making timely inclusion a protocol-enforced property rather than a norm.',
   'CL', 'CR', NULL, 10),
  ('hegota', 8141, 'Frame transaction', 'considered',
   'A transaction type whose validation and fee payment are defined by contract-call frames — native account abstraction.',
   'It moves account abstraction into the protocol, so an account becomes simply an address with code, without the external relayer and separate mempool that ERC-4337 relies on. Reducing off-protocol infrastructure supports decentralization and a simpler trust model. It supersedes the earlier, withdrawn native account-abstraction design.',
   'EL', 'O', NULL, 20),
  ('hegota', 7864, 'Ethereum state using a unified binary tree', 'research',
   'Replaces the state trie with a single binary tree to shrink proofs and enable stateless clients.',
   'Small witnesses would let a client verify a block without holding the full state, the core of the statelessness effort. The direction has moved from earlier verkle-tree designs toward binary trees. It is an active research candidate for Hegotá, not yet fixed in the upgrade scope.',
   'EL', 'O,S', NULL, 30),

  -- ── VERGE / PURGE HORIZON ──────────────────────────────────────────────
  ('verge-purge', 6800, 'Ethereum state using a unified verkle tree', 'research',
   'Replaces the state trie with a verkle tree so blocks can be verified without storing the state.',
   'Proofs today are too large for practical stateless clients, forcing verifiers to hold the full state. Verkle trees shrink witnesses enough to verify a block on near-trivial hardware — the heart of the Verge. The exact tree design may evolve toward binary or hash-based forms, but the goal of cheap, independent verification is constant.',
   'EL', 'O,S', 'Verge', 10),
  ('verge-purge', 4444, 'Bound historical data in execution clients', 'research',
   'Execution clients stop serving chain data older than a bounded window, capping node disk growth.',
   'Unbounded history means every full node stores an ever-growing archive that slowly prices out home operators. Bounding it keeps the disk footprint flat so nodes stay cheap to run, protecting decentralization. Old history remains available from out-of-band providers, so verification is unaffected.',
   'EL', 'O,S', 'Purge', 20),
  ('verge-purge', 7736, 'Leaf-level state expiry', 'research',
   'Expired state can be set aside with a path to restore it, keeping the active state bounded.',
   'State, unlike history, must be held by every validating node, so its growth is the harder long-term problem. Leaf-level expiry lets the active set stay small while preserving a way to reactivate old entries, keeping nodes light without losing data. It depends on the state-tree transition, so it is genuinely long-range.',
   'EL', 'O,S', 'Purge', 30);
