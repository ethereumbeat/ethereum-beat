# Roadmap

Where Ethereum Beat is and where it's going. This is a synthesis of the shipped
passes in [SPEC.md](SPEC.md) and the open threads in [DECISIONS.md](DECISIONS.md)
— read those for the full reasoning behind any line here.

Priorities are **P0** (do next) → **P3** (nice, someday). Nothing here is a
promise; it's the maintainers' current read on what would move the instrument
forward. Want to pick something up? Comment on (or open) the matching issue, or
start a thread in
[Discussions](https://github.com/ethereumbeat/ethereum-beat/discussions).

The north star doesn't change: **measure Ethereum's protocol health against the
four CROPS properties, with no price or market framing, on the free tier.**

---

## Shipped

The dial, the seven channels, the CROPS grouping, the sci-fi detail overlay, the
seven-theme system, the world map, the daily collector with per-source
try/catch, the open JSON API, SEO/AEO metadata (JSON-LD, `/methodology`,
`/llms.txt`), embeddable SVG badges, collector-failure alerting with a stale
badge, and the contact + community surfaces. See SPEC passes 1–15 and the dated
DECISIONS entries.

---

## P0 — revive dark metrics

Metrics whose `metric_meta` row already exists but that don't render because
their source went dark. Each is "a source module + `featured = 1` away" — the
highest-leverage contribution because the UI, API, and metadata are already
built.

- **`client_diversity_cl` / `client_diversity_el`** — consensus/execution client
  share. Named sources are dead, blocked, or stale; needs a live, keyless
  replacement (e.g. a crawler or a maintained aggregator).
- **`builder_share`** — MEV builder concentration (a censorship-resistance
  signal). Same story: find a reachable source.
- **Node map from a live crawler** — geography is currently baked to static JSON
  at build time with an "as of" stamp. A reachable crawler makes it live.

See DECISIONS → *Punted / degraded*. The workflow is the
[Propose a metric](https://github.com/ethereumbeat/ethereum-beat/issues/new?template=metric_request.md)
template.

## P1 — new CROPS coverage

Grow the metric set where a property is thinly covered, keyless and
non-financial.

- **`contracts_deployed`** — punted rather than key-gated; a Dune integration
  needs a curated query id that can't be tested without a key. A keyless
  equivalent (or a maintained public export) would let it ship. Meta row exists.
- **`validators_active`** without a key — currently only collected when
  `BEACONCHAIN_API_KEY` is set; a keyless source would put it in the keyless
  rotation.
- **More Privacy (P) and Censorship-Resistance (CR) vitals** — these two
  properties are the thinnest. Well-sourced proposals welcome.

## P2 — platform & distribution

- **`/feed.xml`** — the RSS autodiscovery `<link>` is already in the head,
  waiting for the feed. A daily "vitals digest" feed.
- **`/digest/*`** — human-readable daily/weekly digest pages (the sitemap and
  spec already reserve the path).
- **PWA install pass** — the webmanifest, icons, and screenshots are finished
  groundwork; this pass adds the service worker and install prompt.
- **Historical depth** — longer backfills / higher-resolution history where
  sources allow.

## P3 — polish & housekeeping

- **Framework upgrades** — `astro` 5 → 7 and `@astrojs/cloudflare` 12 → 14,
  deferred as breaking bumps out of scope for a hardening pass. They also pull
  transitive `sharp` / `esbuild` / `undici` / `ws` fixes. See DECISIONS →
  *Dependency audit*. Runtime exposure is limited (dev/build tooling only), so
  this is not urgent — but it clears the standing `npm audit` advisories.
- **More badges & embeds** — additional vitals in the `/badge/*.svg` set.
- **Accessibility & i18n passes** — beyond the current contrast gate.

---

## How work gets prioritised

There's no fixed schedule. Two things move an item up: **a reachable, keyless,
correctly-licensed source exists** (P0/P1 are gated almost entirely on this),
and **someone wants to build it**. If that someone is you, say so — it's the
fastest way to reprioritise.
