---
name: Propose a metric
about: Propose a new protocol-health metric to track
title: "[metric] "
labels: metric
---

<!-- Ethereum Beat tracks measures of protocol HEALTH and usage, grouped by the
     four CROPS properties. This template walks through everything a maintainer
     needs to add it. Not sure yet? Float the idea in Discussions first:
     https://github.com/ethereumbeat/ethereum-beat/discussions -->

**The metric**
What should it measure, in one plain-language sentence?

**CROPS category** (pick one of the four properties)
- [ ] CR — Censorship Resistance
- [ ] O — Open Source and Free
- [ ] P — Privacy
- [ ] S — Security

> Liveness/uptime is the mission CROPS protects, not a CROPS property. If this
> is a liveness signal, say so — it belongs to the HEARTBEAT framing.

**Source**
- Name:
- Public endpoint (URL):
- Data licence: <!-- e.g. CC BY 4.0, public, terms link -->
- Update cadence / history available: <!-- daily? how far back? -->
- Needs an API key? <!-- keyless is strongly preferred; the site must run keyless -->

**Why it matters (and why it's non-financial)**
How does this number demonstrate its CROPS property? **No price, market-cap or
trading framing** — those are out of scope by design.

**Metadata** (for the `metric_meta` row)
- `unit`: <!-- count | pct | usd | usd_small | eth | days | epoch | mgas_s | … -->
- `agg_mode`: <!-- mean | sum | last -->
- `featured`: <!-- 1 to enter the home rotation, 0 to keep it detail-only -->
- one-line `description` (shown in the detail view):

---

<details>
<summary>How a maintainer wires this up (the <code>metric_meta</code> workflow)</summary>

1. **Metadata** — add a `metric_meta` row in `db/meta.sql` (label, CROPS
   `category`, `unit`, `description`, `source_name`, `source_url`, `agg_mode`,
   `featured`, `sort`). See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-metric).
2. **Source module** — add `worker/sources/<name>.ts` exporting
   `fetchDaily(env): Promise<Row[]>`; register it in `worker/collector.ts` (and
   in `scripts/seed.ts` if it can backfill history). `curl` the endpoint first
   and parse what it *actually* returns.
3. **Seed & check locally** — `npm run seed`, then hit
   `/api/metric/<key>?range=d|w|m|q|y`.
4. **Activation on production is manual** — merging code does **not** make a
   metric live. `metric_meta` lives in D1, so after deploy you must:
   - apply the migration to remote D1
     (`wrangler d1 execute ethereum_beat --remote --file db/migrations/<n>_<name>.sql`), and
   - bust the KV snapshot so it recomputes
     (`wrangler kv key delete --binding=SNAP snapshot:latest --remote`).

   A metric with no rows never renders, so a broken or missing source degrades
   silently rather than showing an empty card.
</details>
