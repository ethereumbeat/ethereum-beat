# ETHEREUM BEAT — one-shot build spec for Claude Code

> **Numbering:** section numbers (`## N.`) are file-local; the **Pass** number in each heading is the cross-file key that aligns SPEC and DECISIONS. Do not renumber existing sections.

Build a complete, deployable website called **Ethereum Beat** (working domain: `ethereumbeat.xyz`, configurable). It tracks the pulse of Ethereum: a centre ETH glyph beats like a heart, and each beat surfaces one KPI. Simple, beautiful, non-financial in tone, aligned with the Ethereum Foundation's framing of the protocol (CROPS properties and sovereignty measurements) rather than price and speculation.

Build the whole thing in one shot. Do not ask questions. Where a decision is ambiguous, pick the option that is simpler, cheaper, and closer to this spec. Verify every external endpoint with `curl` before wiring it in; if an endpoint is dead or has changed shape, degrade gracefully (see Resilience rules) and note it in the README.

---

## 1. Concept

- The heartbeat is the metaphor and the mechanic. Ethereum produces a block every 12 seconds, and the site's pulse is genuinely synced to it: the lub-dub fires on real slot boundaries computed client-side from the Beacon genesis timestamp. The featured KPI advances every N beats (`BEATS_PER_KPI`, default 1; if 12s per KPI tests as too slow, set 1 beat per KPI but add a smaller mid-slot half-pulse so the rhythm stays alive).
- On each beat, the centre glyph does a lub-dub pulse and the active KPI transitions to the next one.
- The user can sit back and watch the rotation, or take control: advance/rewind KPIs, or dive into a detail view for any KPI with daily / weekly / monthly / quarterly / yearly ranges.
- Tone: protocol health, usage, and credible neutrality. Value-secured numbers appear because they measure trust placed in Ethereum, but nothing is framed as price action. No candles, no token prices, no "market cap" language anywhere.

## 2. Metric system

Organise every metric under a category. Categories mirror the EF's CROPS protocol properties plus two pragmatic groups. Each metric gets a one-line "why it matters" description shown in the detail view, written in plain language, British English, no em-dashes.

### Categories and metrics

**HEARTBEAT (liveness)**
| metric_key | Metric | Source |
|---|---|---|
| `uptime_days` | Days of continuous uptime since genesis (30 July 2015) | computed locally |
| `finality_ok` | Chain finalising (yes/no + last finalised epoch) | beaconcha.in API |

**CENSORSHIP RESISTANCE**
| `validators_active` | Active validators | beaconcha.in API |
| `staked_eth` | Total ETH staked + % of supply | beaconcha.in API |
| `builder_share` | Optional: relay/builder concentration | relayscan.io (verify; drop if unavailable) |

**RESILIENCE (sovereignty measurements)**
| `client_diversity_cl` | Consensus client diversity (largest client share) | clientdiversity.org data sources (blockprint; verify endpoint) |
| `client_diversity_el` | Execution client diversity | ethernodes.org (verify JSON endpoints) |
| `node_countries` | Node count and country spread | ethernodes.org (verify; drop if unscrapable) |

**OPENNESS (usage: the big numbers)**
| `daa_combined` | Daily active addresses, L1 + all tracked L2s | growthepie |
| `txcount_combined` | Daily transactions, L1 + L2 | growthepie |
| `throughput` | Throughput (gas/s or UOPS equivalent) | growthepie |
| `blobs_daily` | Blobs posted per day (L2 data landing on L1) | Blobscan API (verify) or growthepie DA metrics |
| `l2_count` | Live L2s building on Ethereum | growthepie master.json chain count (exclude DEV/ARCHIVED) |
| `contracts_deployed` | Optional: new contracts per day | Dune (only if DUNE_API_KEY provided) |

**PRIVACY & SECURITY (lighter for v1)**
| `stables_supply` | Stablecoin supply settled on Ethereum + L2s | DefiLlama stablecoins API (free, no key) |
| `rwa_value` | Real-world assets tokenised on Ethereum | DefiLlama RWA category TVL (free, no key) |
| `tvs` | Total value secured by Ethereum (L1 + L2) | growthepie total value secured |

Rules:
- The KPI rotation on the home page shows roughly 10 to 12 metrics; keep it curated. Everything in the table is stored, but `metric_meta.featured` controls what enters the rotation.
- Optional metrics (marked above) must be feature-flagged: if the source fails or no key is present, they simply do not appear. The site must never render an empty or broken KPI card.
- Every metric row in `metric_meta` includes `source_name` and `source_url` for attribution (growthepie requires attribution; give every source a credit line in the detail view and a /about page listing all of them).

### Primary data sources (verified)
- **growthepie**: public JSON API at `https://api.growthepie.com/`. Use `master.json` for chain/metric metadata and `v1/fundamentals.json` or `v1/export/{metric}.json` for flat daily rows (`metric_key`, `origin_key`, `date`, `value`). No auth. Respect their guidance: fewer, broader calls, max 10/min. This is the backbone: it gives full daily history, which solves backfill for W/M/Q/Y ranges on day one.
- **DefiLlama**: free, keyless (stablecoins, RWA/TVL categories).
- **beaconcha.in**: free tier, key optional via `BEACONCHAIN_API_KEY`.
- **L2Beat**: no stable public API; do not depend on it. If an L2 registry is needed beyond growthepie, read L2Beat's open-source config from their GitHub repo at build time only, never at runtime.
- **Etherscan / Dune**: only behind optional env keys.

## 3. Architecture (all Cloudflare, free tier)

Single Worker deployment via `@astrojs/cloudflare` adapter, one `wrangler.toml`.

- **Astro on Cloudflare Workers**: static-first pages, server endpoints for the API routes.
- **Cron Trigger** (`0 6 * * *` UTC daily): the collector. Fetches every source with per-source try/catch and a 10s timeout each, upserts daily rows into D1, recomputes the snapshot, writes it to KV.
- **D1** (`ethereum_beat`): the time series store.
- **KV**: one key, `snapshot:latest`, holding the full JSON the home page needs (current value, sparkline of last 30 points, and deltas for d/w/m/q/y per metric). The home page render is one KV read. Cheap and fast.
- **Cache API**: API route responses served with `s-maxage=3600`; the cron busts nothing (KV is always current, cache TTL handles the rest).
- No R2, no Durable Objects, no queues. Keep it minimal. Everything fits comfortably in Workers/D1/KV free tiers because there is exactly one write cycle per day.

### D1 schema
```sql
CREATE TABLE metrics (
  metric_key TEXT NOT NULL,
  date TEXT NOT NULL,            -- YYYY-MM-DD
  value REAL NOT NULL,
  PRIMARY KEY (metric_key, date)
);
CREATE TABLE metric_meta (
  metric_key TEXT PRIMARY KEY,
  label TEXT, category TEXT, unit TEXT,
  description TEXT, source_name TEXT, source_url TEXT,
  featured INTEGER DEFAULT 0, sort INTEGER DEFAULT 0
);
```

### Aggregation rules (computed in SQL at request/snapshot time)
- **Daily**: last 30 daily points.
- **Weekly**: last 26 weeks, weekly mean (or sum for count-type metrics; add `agg_mode` column: `mean` | `sum` | `last`).
- **Monthly**: last 24 months. **Quarterly**: last 12 quarters. **Yearly**: full history by year.
- Deltas shown as percentage change vs the previous period, rendered as "vs last week" etc., never as green/red financial ticks. Use neutral up/down glyphs.

### Seeding
Write `scripts/seed.ts` (run locally with wrangler): pulls growthepie `fundamentals.json` full history plus DefiLlama historical series and bulk-inserts into D1, so all ranges work from first deploy. Idempotent (INSERT OR REPLACE).

### API routes (Astro endpoints)
- `GET /api/snapshot` → the KV snapshot.
- `GET /api/metric/[key]?range=d|w|m|q|y` → series + meta from D1.
- Both JSON, both edge-cached 1h, CORS open (nice for others to build on, on-brand for openness).

## 4. Frontend

- **Astro + one React island** (`<BeatStage client:load />`) for the whole interactive experience. Tailwind v4. TypeScript strict.
- **Pages**: `/` (the beat), `/pulse/[metric]` (detail, server-rendered with the island hydrating the chart), `/nodes` (the decentralisation map), `/about` (concept, methodology, source credits).
- Home page fetches `/api/snapshot` once; no polling. Everything after load is animation, not network.

### The beat engine
- A single rAF-driven clock in the island. Heartbeat is a lub-dub: two scaled pulses (about 1.06 then 1.12) with an exponential settle, plus a soft radial glow that breathes with it.
- An ECG trace line runs horizontally behind or beneath the glyph; on each beat it draws a QRS-style spike, then flatlines until the next beat. SVG path drawn procedurally, not a canned GIF.
- Each beat advances the featured KPI: number crossfades with a tabular-numbers count-up (respect `prefers-reduced-motion`: no count-up, no pulse scaling, instant swaps).
- Interaction: arrow keys, horizontal swipe, and click on left/right zones advance/rewind. Clicking the KPI (or pressing Enter) opens the detail view. Hovering the glyph pauses rotation.
- The ETH glyph is drawn as layered SVG polygons so the pulse can stagger the facets slightly (top and bottom halves pulse 60ms apart). Do not use the official EF logo lockup; use the generic octahedron glyph geometry.

### Live data layer (the periphery)

The micro-annotations at the edges are not decoration: they are live. This layer is client-side only, costs nothing, and gives the page its "always breathing" quality.

Three tiers of liveness:

**Tier 1: pure clock maths, zero network.** Computable every frame from the Beacon Chain genesis timestamp (1606824023) and 12s slots / 32-slot epochs:
- current slot and epoch (ticking up)
- seconds into the current slot (a 0 to 12 counter, this can drive the actual heartbeat so the lub-dub lands exactly on slot boundaries)
- slots until the next epoch boundary
- estimated seconds to finality (time to end of current epoch + 2 epochs)
- days-hours-minutes-seconds since genesis (the uptime counter, ticking live)
- UTC clock and unix timestamp

**Tier 2: one JSON-RPC poll per slot (every 12s).** Use a public execution RPC via a tiny `lib/rpc.ts` with an ordered fallback list (verify each with curl at build time; candidates: Cloudflare's Ethereum gateway to stay on-theme, publicnode, llamarpc). One `eth_getBlockByNumber("latest", false)` call per beat yields:
- block height (increments on each beat, deeply satisfying)
- last block hash, truncated hex (constantly mutating hex is perfect ticker texture)
- base fee in gwei
- gas used as % of gas limit (render as a tiny 20-char monospace bar)
- transaction count in the block
- blob count in the block (`blobGasUsed / 131072`)
- ETH burned in the block (baseFee x gasUsed, shown in ETH; this is protocol mechanics, not price talk)

**Tier 3: slow-refresh live stats (fetch once on load from `/api/snapshot`).** Active validator count, total staked, node count. Present them in the periphery with a "as of today" stamp.

Rendering rules: the tickers live in the four margins as monospace micro-type, some rotated, each with a small red dot and occasionally a thin connector arc to the disc (the Image-1 grammar). Values update with a 120ms mono flicker (old value, one frame of scrambled hex, new value), never with layout shift; every ticker has fixed-width slots. On mobile, collapse to a single scrolling ticker strip along the bottom edge. If all RPCs fail, Tier 2 tickers hide entirely; Tier 1 keeps the page alive forever.

### Node map (decentralisation made visible)

A dedicated view (route `/nodes`, plus a compact version as the detail view for the resilience KPIs): a world map showing where Ethereum physically lives.

- **Rendering**: no map library, no tiles. A dot-matrix world map: land rendered as a grid of tiny monospace-feeling dots (generate the dot grid once from a public-domain land GeoJSON at build time, bake to a static JSON of dot coordinates). Countries with nodes get their dots brightened; node concentration shown by dot intensity, with the top countries annotated by red dot + connector line + monospace label (`US 32.1%`, `DE 14.8%`, ...). A slow radar-sweep highlight passes over the map every beat.
- **Data**: country-level aggregates only (privacy-friendly, no per-node coordinates). Cron fetches execution-layer node counts by country from ethernodes.org and consensus-layer distribution from Nodewatch or Miga Labs' crawler (verify all three at build time; ship whichever responds reliably, one is enough). Store as a JSON blob in KV (`nodes:geo`) refreshed daily; historical country counts also land in D1 under `metric_key = nodes_<iso2>` so the detail view can show trends.
- **Companion stats** on the same view: total nodes, active validators, client diversity bars (thin monospace bars, largest-client share highlighted in red if above 50%, because that is the number that matters), countries count, and a one-line explanation of why geographic and client spread is the point.

### Charts
- No charting library. Hand-rolled SVG: area/line with a smooth monotone curve (implement monotone cubic interpolation directly, or use `d3-shape` only, nothing else), a single accent gradient fill, dotted baseline, and a scrub cursor showing date + value in a fixed readout (no floating tooltips jittering about).
- Range toggle D / W / M / Q / Y as a segmented control; range changes animate the path with a morph or a quick redraw + fade, whichever reads cleaner.
- Sparklines on KPI cards: 30-point mini path, no axes.

### Art direction: technical print brutalism

The look is a synthesis of Korean print-poster minimalism and sci-fi instrument panels. Reference qualities: a huge central disc dominating a quiet field; tiny monospace annotations scattered at the edges; thin crosshair ticks and registration marks orbiting the subject; spec-sheet tables with big thin numerals; restrained glitch and scan texture; one hot accent against monochrome.

Concrete rules:
- **Stage**: the ETH glyph sits inside a large circle at dead centre (the disc IS the heart; the glyph is drawn within it). The disc gets a subtle organic edge treatment (slightly irregular radius via SVG turbulence or a hand-drawn-feeling path, echoing an ink-printed circle, very subtle, not grunge).
- **Palette**: paper grey-white background (`#EDEDEB`-ish) with near-black ink as the default theme, plus a dark theme (near-black bg, bone ink) toggleable. One accent only: signal red (`#E10600`-ish) used for live-data dots, connector lines, and the active state. Nothing else gets colour.
- **Type**: two voices. A grotesk with tabular figures for the big KPI numerals (self-hosted woff2, e.g. Inter or Space Grotesk), and a monospace (e.g. IBM Plex Mono or JetBrains Mono) for every annotation, label, table, and live ticker. Micro-type is genuinely micro: 9 to 11px, tracked out, uppercase, some labels rotated 90 degrees along the viewport edges like printers' marks.
- **Ornament grammar**: thin 1px rule lines, corner brackets, crosshair ticks arcing around the disc, small red dots joined by fine curved connector lines pointing from edge annotations toward the disc, timestamp stamps (`2026 - 07 - 18` style with spaced hyphens), a small page-number-like index (`_01`, `_02`) identifying the active KPI category.
- **Texture**: extremely light film grain on the background and an occasional single-frame glitch slice on KPI transition (a horizontal displacement band for 80ms). Use sparingly; the base must stay clean and printable-looking. Respect `prefers-reduced-motion`: no glitch, no grain animation.
- **Charts** inherit the same grammar: hairline axes, monospace tick labels, red-only accents, dotted baselines. They should look like instrument readouts, not dashboards.
- All of it built on `src/styles/tokens.css` (colour, type scale, spacing, radius, motion durations/easings) so theming stays a one-file change.

## 5. Repo structure
```
ethereum-beat/
  src/
    pages/ (index.astro, pulse/[metric].astro, about.astro, api/…)
    components/BeatStage.tsx, EthGlyph.tsx, KpiCard.tsx, PulseChart.tsx, EcgLine.tsx,
               LiveTickers.tsx, NodeMap.tsx, Ornaments.tsx (brackets, crosshairs, connector arcs)
    lib/ (beat.ts, clock.ts (slot/epoch maths), rpc.ts, format.ts, metrics.ts, aggregate.ts)
    data/land-dots.json (baked dot-matrix world map)
    styles/tokens.css, global.css
  worker/ collector.ts (cron entry), sources/*.ts (one module per data source)
  scripts/seed.ts
  wrangler.toml, astro.config.mjs, README.md
```
Each source module exports `fetchDaily(): Promise<Array<{metric_key, date, value}>>` and is individually try/catched by the collector. A failing source never blocks the others.

## 6. Build order (do it in this sequence)
1. Scaffold Astro + Cloudflare adapter + Tailwind v4 + wrangler config with D1, KV binding, cron trigger.
2. D1 schema + `metric_meta` seed (all metrics, descriptions, attribution).
3. Source modules: growthepie first, then DefiLlama, then beaconcha.in, then optional ones. `curl` each endpoint first and shape parsers to the real responses.
4. Collector + snapshot writer + `scripts/seed.ts` backfill.
5. API routes with caching.
6. BeatStage island: beat engine, glyph, ECG, KPI rotation, keyboard/touch nav.
7. Detail pages + PulseChart with the five ranges.
8. About page, README (setup, keys, deploy, how to add a metric), `prefers-reduced-motion` pass, mobile pass (the glyph experience must be first-class on a phone: full-viewport stage, swipe nav).
9. Run `npm run build`, fix everything, provide `wrangler deploy` instructions and the seed command.

## 7. Environment
Optional keys only, all read from Worker secrets: `BEACONCHAIN_API_KEY`, `DUNE_API_KEY`, `ETHERSCAN_API_KEY`. The site must run fully keyless with growthepie + DefiLlama + public beaconcha.in.

## 7b. Open source requirements
This repository will be public from day one. Therefore:
- **No secrets in the repo, ever.** Keys via `wrangler secret put`; local dev via `.dev.vars`, which is gitignored along with `.wrangler/`. Ship a `.dev.vars.example`.
- **Portable config.** `wrangler.toml` uses placeholder D1/KV IDs with a README section walking a contributor through creating their own bindings (`wrangler d1 create`, `wrangler kv namespace create`), seeding, and deploying to their own account.
- **LICENSE**: MIT for the code. The README carries a separate "Data" section stating that displayed data comes from third-party sources under their own terms, crediting each (growthepie is CC BY 4.0 and requires attribution; keep the in-UI credits too).
- **Fonts**: only SIL OFL typefaces committed to the repo (Inter / Space Grotesk / IBM Plex Mono all qualify). Include their licence files alongside the woff2s.
- **Trademark note** in the README: the Ethereum glyph and name are used to represent the Ethereum network; the project is unaffiliated fan/ecosystem work unless stated otherwise (maintainer will adjust wording).
- **Contributor path**: a short CONTRIBUTING.md covering how to add a metric (metric_meta row + source module + seed) since that is the most likely community contribution.

## 8. Acceptance criteria
- Deploys to Cloudflare with `wrangler deploy`; zero paid services.
- Home page paints the beating glyph and first KPI in under a second on a warm edge cache.
- All five ranges return sensible series for every featured metric after seeding.
- One daily cron keeps everything fresh; no other scheduled work, no client polling.
- Nothing on the site mentions price, market cap, or trading.
- Sources credited; growthepie attribution present.
- Lighthouse: 95+ performance and accessibility on the home page.

## 9. Design pass 2

CONTEXT FROM A LIVE REVIEW: the structure is right but the page feels static
between slot beats, the ECG line is faint and meaningless, margins are
static labels, there is no visible glitch/analog detail, keyboard support
is only arrows + Enter, and the type does not dominate. Fix all of that.

1. HEARTBEAT, PHYSIOLOGICAL
   Decouple the visual pulse from the 12s slot. The disc beats continuously
   like a resting heart: lub-dub (strong S1, softer S2 ~180ms later) at
   60-72 bpm, always running. The 12s slot boundary becomes the SYSTOLE:
   one stronger beat, the ECG fires its big QRS spike, the KPI advances,
   the glitch slice triggers. The page must never be still.

2. ECG, PROMOTED AND MEANINGFUL
   The current thin line becomes a real telemetry strip: full-width,
   noticeably taller, continuously scrolling like a hospital monitor,
   procedural SVG/canvas. Encode real data:
   - QRS amplitude per slot = that block's gas used %
   - small P-wave blip at epoch boundaries
   - visible flatline + monospace "NO SIGNAL" stamp if RPC drops,
     recovering on reconnect
   Monitor readout at the strip end: slot, block height, and the actual
   beat rate as a BPM-style label.

3. MARGINS GO LIVE + LINES EVERYWHERE
   The rotated edge labels become live tickers (block hash truncated hex,
   base fee, gas bar, burned ETH, txs) updating with a 2-frame hex-scramble
   flicker, fixed-width so nothing shifts. Add drawn motion:
   - connector arcs from annotations draw in (stroke-dash) on each systole,
     hold, retract
   - blueprint dimension lines with end ticks measure the disc on KPI
     change, then fade
   - a 1px scanline sweeps the viewport top-to-bottom on a slow loop
   - crosshair ticks around the disc rotate almost imperceptibly
   All 1px, ink or red only, transform/opacity animations only.

4. BOLDER TYPE + NEW FONTS
   Swap typefaces (OFL only, self-hosted woff2 + licence files):
   - display/numerals: Unbounded (fallback Archivo expanded weights)
   - micro/mono: Martian Mono (fallback JetBrains Mono)
   KPI value scales to viewport (clamp ~10-14vw), heavy weight, tabular
   figures; active KPI label set in red. Primary content is pure ink on
   paper, no soft greys.

5. GLITCH + ANALOG
   - very low-opacity scanline/CRT overlay page-wide
   - Bayer-dither on the disc edge (printed-ink feel)
   - 80ms RGB-split + horizontal displacement slice on KPI transition
   - once per epoch, a thin pixel-sorted slice crosses the disc
   - crop marks + registration marks in the four corners
   Items 1, 3, 5 must fully respect prefers-reduced-motion: static layout,
   instant swaps, no overlays.

6. KEYBOARD, COMPLETE
   Keep ←/→ and Enter. Add: Esc back · Space pause/resume rotation ·
   T toggle INK/BONE · N nodes · B home · ? monospace shortcuts overlay
   styled like the system. Visible focus states; fully mouse-free operable.

7. GUARDRAILS
   One rAF loop drives everything, no per-element timers. Suspend all
   animation when the tab is hidden. Verify both themes, mobile (single
   bottom ticker strip, full-viewport disc), reduced motion. Log
   trade-offs in DECISIONS.md.

## 10. Design pass 3 — terminal, dial, arcade

DIRECTION SHIFT: pass 2 made it alive but it still reads too polished, too
Swiss. Push it toward terminal output and instrument panel. Less poster,
more machine.

1. TYPE: TERMINAL, NOT SWISS
   Drop Unbounded. New system (self-host woff2 + licence files, OFL only):
   - display/numerals: Departure Mono (pixel-terminal character, heavy
     presence at size). Fallback: VT323.
   - everything else stays Martian Mono.
   The big KPI numeral keeps its viewport scale but now looks like output
   from a machine, not typography from a studio. Where Departure Mono's
   pixel grid shows at size, that is the point; do not smooth it.
   Re-tune letter-spacing and sizes for the new faces; pixel fonts need
   less tracking and often one size notch down.

2. ECG BECOMES ATMOSPHERE
   The telemetry strip stops crossing the disc as a foreground element.
   Move it to the background layer: full-viewport width, positioned in the
   lower third, rendered at low contrast (5-12% ink opacity, red only for
   the systole spike), behind the disc and all content. Consider a second,
   even fainter trace offset above it for depth. It should read like
   ambient monitoring equipment in the room, not a line through the
   subject. Keep the BPM/slot readout, small, docked to a corner of the
   viewport in micro mono.

3. THE DISC BECOMES AN INSTRUMENT DIAL
   The circle stops being a passive backdrop and becomes the gauge:
   - EPOCH RING: 32 tick marks around the perimeter, one per slot; ticks
     fill as the epoch progresses, all clear at each new epoch. Current
     slot's tick is red and slightly longer.
   - SLOT SWEEP: a thin second-hand arc travels the full circle every 12s,
     continuous, so you can see the slot elapsing.
   - GAS ARC: a short arc segment (bottom-left quadrant, labelled GAS in
     micro mono) whose length maps last block's gas-used %.
   - FINALITY MARKER: a small notch trailing 2 epochs behind, labelled
     FINAL, so the gap between head and finality is visible geometry.
   All hairline, ink + red only, labels in micro mono with tiny leader
   lines. The dial must be legible: someone watching for 30 seconds
   should understand the epoch structure without reading the about page.

4. NAV GOES BOTTOM, ARCADE
   Remove the top-right nav. Build a bottom command bar, videogame HUD
   style, full-width, monospace:
   [←/→] PREV·NEXT   [ENTER] DIVE   [SPACE] HOLD   [N] NODES   [T] INK/BONE   [?] MANUAL
   Each item is a keycap-styled chip (1px border, key glyph highlighted);
   the whole bar reads like a fighting-game move list. Hovering/pressing a
   chip triggers the same action as the key, with a small press animation
   (chip depresses 1px, red flash). Active section gets selector brackets
   like a game menu: > NODES <. On mobile the bar stays, chips become
   tap targets, key glyphs hidden. Header keeps only the wordmark + live
   red dot, top-left, small.

5. KEEP / GUARDRAILS
   Heartbeat physiology, margin tickers, glitch, dimension lines, reduced
   motion support, one rAF loop, animations suspended when tab hidden.
   Re-check both themes and mobile after the type swap; pixel fonts can
   break layouts tuned for Unbounded. Log trade-offs in DECISIONS.md.

## 11. Design pass 4 — the number is the heartbeat

1. THE LINE BECOMES THE KPI (biggest change)
   Kill the synthetic ECG waveform. The background line is now the actual
   historical series of the KPI currently on screen: when DAILY
   TRANSACTIONS shows, the line IS daily transactions over time; when the
   KPI advances, the line morphs (animated path interpolation) into the
   next metric's normalised curve. The big number's own history is the
   heartbeat. Implementation:
   - fetch each featured metric's series once from the existing
     /api/metric endpoints (monthly range reads best as a silhouette),
     normalise to the strip's height, cache in memory
   - keep it background: lower third, full width, 5-12% ink opacity
   - keep it alive: on each systole a red pulse of light travels along
     the path left to right; the lub-dub subtly scales the path's
     amplitude so the curve itself breathes
   - the path morph on KPI change is a hero moment: ~600ms, eased,
     with a one-frame glitch slice mid-morph
   - keep the docked micro readout (slot · block · bpm) in a corner

2. BOLDER STILL: GLITCH + PIXEL FIELD
   Push the background from clean paper to degraded machine output:
   - a persistent pixel-dither field (coarse Bayer, 2-3px cells) drifting
     almost imperceptibly, denser near the viewport edges
   - random block-noise tiles: small rectangles of scrambled pixels that
     appear for 100-200ms at random intervals (roughly every few seconds)
   - a barely-visible hex-dump layer (3-4% opacity, Martian Mono) slowly
     scrolling behind everything, real bytes from the latest block hash
   - on each systole: red pixel debris kicks off the disc edge, 4-6 tiny
     squares that scatter and die within 400ms
   - displacement glitches get bigger and slightly more frequent
   Everything still ink + red only. All of it gated behind
   prefers-reduced-motion (static dither only, nothing else).

3. SIDE TICKERS: BIGGER, PROMINENT, CLICKABLE
   Scale the margin tickers up (roughly 2x current size, heavier weight);
   they are first-class citizens now, not marginalia. Each ticker becomes
   a real button (cursor, hover state: label flips to red, connector line
   draws toward the disc). Clicking opens a MODAL, videogame-menu styled:
   corner brackets, 1px border, monospace header like "BASEFEE // BEAT OF
   THE NUMBER", Esc/click-outside closes, focus trapped, arrows ignored
   while open. Modal content depends on ticker type:
   - per-block live values (basefee, gas %, txs, blobs, burned): chart a
     rolling in-session buffer (keep the last 128 blocks in memory from
     the existing per-slot RPC poll) so the user sees the value beating
     block by block, plus a one-line plain-language explanation of what
     the number is
   - protocol clock values (slot, epoch, finality): no chart; show the
     epoch dial explanation and current values
   - daily metrics (staked, TVS): reuse the existing series API, small
     chart, link out to the full /pulse detail page
   Every ticker gets a plain-language description; this is where a
   curious visitor learns what basefee actually means.

4. BUG: BOTTOM COMMAND BAR OFF-SCREEN
   The bar is fixed bottom-0 but hidden on real devices. Fix the viewport
   maths: replace 100vh layout sizing with 100dvh (fallback: svh), add
   env(safe-area-inset-bottom) padding to the bar, and verify nothing
   ancestor to it creates a transform/filter containing block that breaks
   position:fixed. Test at 1280x700, 1440x800, and iPhone-class viewports
   (Safari toolbar visible) before calling it done. The bar must be
   visible on load at every size, no scrolling required.

5. KEEP / GUARDRAILS
   Heartbeat physiology, dial (epoch ring, slot sweep, gas arc, finality
   notch), keyboard map + manual overlay, both themes, one rAF loop,
   suspend when tab hidden. Departure Mono stays. Log trade-offs in
   DECISIONS.md.

## 12. Design pass 5 — instant, locked, shareable

1. SEED SESSION BUFFERS: on load, one batched RPC pass fetches the last 64
   blocks (eth_getBlockByNumber, batched JSON-RPC or sequential with a
   concurrency cap of 4) so every ticker modal chart is full immediately.
   "N BLOCKS THIS SESSION" becomes "LAST N BLOCKS".
2. LOCK THE VIEWPORT: home route is a strict 100dvh grid, zero document
   scroll at any window size >= 1024x640. Audit what overflows at 1280x700
   and fix it structurally (scale, not clip).
3. MORPH REVEAL: during the 600ms KPI line morph, raise line opacity to
   ~30%, then ease back to ambient. The travelling red pulse fires once at
   morph completion.
4. DEEP LINKS: each featured KPI gets a hash route (e.g. #txcount). Arriving
   via hash selects that KPI and holds rotation (HOLD state on). Copy-link
   affordance in the KPI area (small chain-link glyph, monospace toast
   "LINK COPIED").
5. AUDIO, OFF BY DEFAULT: a [S] SOUND chip in the command bar. When enabled
   (requires the click, so autoplay rules are satisfied): soft synthesised
   lub-dub via WebAudio on each beat, a dry tick per new block, slightly
   accented tick on epoch boundaries. No audio files; synthesise. Persist
   the preference in the URL hash or a query param, not localStorage if the
   artifact constraint applies; in this deployed app localStorage is fine.
6. KEEP: everything from passes 2-4, reduced motion, one rAF loop, suspend
   on hidden tab. Log trade-offs in DECISIONS.md.

## 13. Pass 6 — observatory

(commit and push per numbered item IN ORDER; early items are fixes, late
items are big features; if anything must be punted, punt from the end,
never the start)

1. FIXES FIRST
   a. Side tickers: fix the alignment bug on the rotated margin text
      (baseline/anchor drift). Rebuild with a deterministic layout: fixed
      slot positions, writing-mode vertical-rl, identical padding, verified
      at 1280x700, 1536x960, 1920x1080.
   b. Add a human clock to the margins: local date + time ticker
      (2026 - 07 - 19 · 14:32:05, user's locale/timezone, ticking) alongside
      the existing UTC/UNIX.
   c. Remove the wordmark/logo from the top entirely. The command bar
      gains a tiny "ETHEREUM BEAT" label at its left end. The red live dot
      moves into the command bar too.
   d. Footer: replace the growthepie-only credit with a multi-source line:
      "DATA · GROWTHEPIE · ETHERNODES · PUBLICNODE · BEACONCHA.IN + OPEN
      ENDPOINTS" — each name a link, the whole line linking to
      /about#sources. Build it dynamically from the source registry
      (source_name in metric_meta plus the live-layer endpoints), so any
      source added later appears automatically and nothing needs
      hand-editing. /about gets the full SOURCES section with licence notes
      (growthepie CC BY 4.0 stated there and in the README). If the full
      line crowds the footer at smaller widths, collapse to
      "DATA · 6 OPEN SOURCES" linking to /about#sources.

2. NAVIGATION: NUMBERED CHANNELS
   Pages become numbered channels, switchable from anywhere, like a TV/
   arcade system:
   1 BEAT · 2 NODES · 3 BLOBS · 4 FLOW · 5 FINALITY · A ABOUT
   - number keys switch channels instantly from any page, any state
   - Esc always steps out: modal -> page -> channel 1
   - command bar shows all channels as chips with the active one in
     selector brackets: > 3 BLOBS <
   - left/right at channel level still cycles KPIs on BEAT only
   - transitions between channels: quick glitch cut (no soft crossfade)

3. HOMEPAGE DIAL: CONCENTRIC LIVE RINGS
   Around/inside the existing epoch ring, add concentric data rings that
   grow, contract and rotate with real values:
   - GAS RING: sweeps with each block's gas-used %, breathing
   - BLOB RING: segmented 0..target, fills per block, resets each block
   - PARTICIPATION RING: epoch attestation participation %, slow
   - STAKE RING: staked % of supply, near-static, annotated
   Each ring hairline, labelled in micro mono with leader lines, red only
   for the active/most-recent change. The dial should now read as one
   instrument with five concentric indicators, constantly in subtle motion.

4. CHANNEL 3 — BLOBS (new page)
   The DA heartbeat. Live per-block blob cells: a grid where each block
   appends a row of filled/empty blob slots vs target (from blobGasUsed),
   scrolling upward. Plus: blob base fee now, % of target over the last
   epoch, chains currently posting blobs (Blobscan API, verify; else count
   type-3 tx senders per block), and a daily blobs chart from the existing
   D1 series. Same instrument grammar as the map page.

5. CHANNEL 4 — FLOW (new page)
   Real-time transaction telemetry, terminal style. Try WSS subscriptions
   on public endpoints (verify publicnode/llamarpc WSS: newHeads works
   widely, newPendingTransactions often disabled). If pending stream
   works: a full-height scrolling mempool log. If not: on each new block,
   stream that block's real transactions into the log at a natural rate
   (hash, value in ETH, type badge: transfer/contract/blob), plus a
   header row: txs in flight this session, current base fee, last block
   fullness. Monospace log lines, newest at bottom, auto-scroll with a
   HOLD-on-hover. This page must feel like watching the chain breathe
   through a terminal.

6. CHANNEL 5 — FINALITY (new page)
   The journey of a block from proposed to final, as full-width progress
   bars all over the page, everything moving:
   - CURRENT EPOCH: 32-slot bar filling live
   - PREVIOUS EPOCH: justification state
   - FINALIZED: checkpoint, epochs-behind-head counter
   - a HEAD -> SAFE -> FINAL track showing the last ~96 slots as a strip
     with the three markers travelling it
   - live countdown to next epoch boundary and estimated wall-clock
     finality time (already computed for the ticker; reuse)
   Data: slot maths client-side + one beacon API call per epoch
   (finality checkpoints from a public beacon endpoint; verify
   publicnode's beacon API, fallback beaconcha.in). Plain-language one-
   liners under each bar: this page should teach finality to a newcomer.

7. NEW METRICS INTO THE ROTATION (collector + meta + seed)
   - participation_rate (beacon API, per epoch)
   - validator_queue_entry / _exit (beaconcha.in)
   - median_l2_fee (growthepie fees, affordability story)
   - blobs_per_block_avg + blob_chains (Blobscan or computed)
   - optional behind flags: censoring_relay_share (verify
     censorship.pics/neutralitywatch endpoint), userops_daily (BundleBear
     public API, verify)
   Each with a plain-language description and a CROPS category.

8. VALUES, LOUDER
   After each full KPI rotation on BEAT, insert one VALUES BEAT: the disc
   holds, no number, one principle in Departure Mono with a one-line
   plain-language gloss. Rotate through the CROPS set (censorship
   resistance / resilience / openness / privacy / security) plus
   "100% uptime since 2015". Skippable with arrow keys like any KPI. Each
   category detail page also gets its principle line under the title.

9. SHARE AS PNG
   A share affordance on every KPI (and each channel page): opens the
   share modal with 2-3 template previews in the site's exact visual
   language (disc template, dial template, minimal numeral template),
   rendered client-side on canvas at 1080x1080 and 1200x630: big number,
   label, category index, UTC timestamp + date stamp, site URL, dither
   texture baked in. Buttons: DOWNLOAD PNG, COPY TEXT (a one-line stat +
   URL), and Web Share API where available. Fonts must be loaded into the
   canvas correctly (document.fonts.ready) before rendering.

10. GUARDRAILS
    Everything from passes 2-5 holds: physiology, reduced motion, one rAF
    loop per page, suspend on hidden, both themes, mobile pass on all new
    channels (FLOW and FINALITY must work as vertical mobile screens).
    Verify every new endpoint with curl before wiring. Clean build.
    DECISIONS.md updated with anything punted or flaky.

## 14. Pass 7 — monochrome observatory

1. DESIGN LANGUAGE V2 (supersedes "ink + red only")
   Shift to dense monochrome cypherpunk. Red is DEMOTED: no longer the
   accent system, only a rare signal (sealed-block interrupts, alerts,
   one live dot). Everything else is ink on paper / bone on black.
   New ornament kit, used across all channels:
   - plus-mark point fields (+ scattered on a loose grid) as spatial
     texture, denser near data
   - hatched / diagonal-stripe fills for bars, gauges, loading and
     "filling" states (never flat fills)
   - callout boxes with elbow leader lines pointing at data (HUD
     annotation style), 1px borders, micro mono labels
   - barcode strips and block separators between sections
   - corner brackets on every module; occasional inverted panels
     (bone-on-ink blocks) for emphasis
   - truncated hex strings as decorative micro-copy where real data
     exists (never fake data)
   TYPE: push size contrast hard. Giant pixel numerals (Departure Mono)
   used architecturally — the channel number renders as a huge
   background glyph (30-50vh tall, 4-8% opacity) on every channel, like
   a chapter mark. Micro labels stay 9-10px. Mid sizes get variety:
   some labels big and pixelated, some tiny and tracked; break the
   current uniformity.

2. EVERY CHANNEL FULL-BLEED, ZERO PARAGRAPHS
   All channels (NODES, BLOBS, FLOW, FINALITY) become 100dvh full-width
   locked instruments like BEAT. Remove all page titles from the top and
   all inline explainer paragraphs. Replacements:
   - channel identity moves to the BOTTOM in pixel font, docked above
     the command bar: "CH_05 // FINALITY"
   - every module gets a [?] chip; clicking (or pressing E while the
     module is focused) opens an EXPLAIN modal carrying the removed
     plain-language text. On-screen copy budget: max one line per module.
   - the existing modal system is reused; Esc closes, as everywhere.

3. RETRO CHANNEL OSD + FULL NAV
   - Up/Down arrows now ALSO change channels (up previous, down next,
     wrapping), alongside 1-5 keys. Left/Right stays KPI cycling on BEAT.
   - On every channel switch, a TV-style OSD flashes: "CH 03 — BLOBS"
     huge pixel font, bottom-left, holds ~1.2s, glitch-cuts out.
   - A persistent vertical channel strip overlays one edge: 1 2 3 4 5,
     current channel in an inverted panel, others ghosted; clickable.
   This must feel like flipping channels on a haunted CRT.

4. A DISTINCT GRAPHIC SYSTEM PER CHANNEL (more animated, all real data)
   - CH2 NODES: keep the dot map; add plus-field texture and a node
     status grid strip (country boxes with counts, one flickering as
     data refreshes)
   - CH3 BLOBS: energy-cell stack aesthetic — blob slots per block as
     a vertical battery of hatched cells filling live; blob basefee as
     a thin gauge with leader-line callout
   - CH4 FLOW: keep the mempool waterfall; add hatched block-fullness
     bars, barcode separators on sealed blocks (red stays here), and a
     per-second inclusion rate counter in a callout box
   - CH5 FINALITY: rebuild the ladder as an instrument: concentric
     epoch circles construction (three intersecting/overlapping circle
     sets for head/justified/final) PLUS the travelling 96-slot track;
     hatched progress everywhere; countdown in giant pixel numerals
   Each channel should be recognisable from a thumbnail by its motif.

5. CROPS, EXPLICIT
   - every KPI and every channel gets a small CROPS badge (C/R/O/P/S
     letter in a 1px box); clicking it opens a values modal: which
     property this metric demonstrates and why it matters, two
     sentences, plain language
   - the VALUES BEAT on CH1 stays, restyled to the new language
     (inverted panel, pixel type)
   - /about gets a compact CROPS section: five properties, one line
     each, linked from all the badges
6. GUARDRAILS
   Reduced motion (static fields, no OSD animation, instant switches),
   one rAF loop per channel, suspend when hidden, both themes re-tuned
   for the monochrome shift (BONE theme especially), mobile pass on all
   channels, clean build, DECISIONS.md updated.

## 15. Pass 8 — morph and signal

1. PAGE TRANSITIONS: PERSIST + MORPH (the headline item)
   Kill the hard page loads. Wire Astro's ClientRouter (View Transitions):
   - PERSIST across navigations: command bar, channel strip, margin
     tickers, background layers (dither, hex, plus-fields), and the
     WSS/RPC connections + rAF loop (re-init cleanly where persistence
     is impossible; no visible reconnect gap on FLOW)
   - MORPH shared elements between channels (transition:name): the giant
     channel numeral morphs 1→3→5 as you flip; the disc on CH1 scales
     down/out toward the channel motif position; KPI numerals crossfade
     with a scramble frame
   - the glitch cut becomes an ACCENT layered on the morph (one
     displacement slice mid-transition), not a substitute for it
   - full fallback for browsers without View Transitions: fade + glitch
   - up/down + 1-5 + chips all route through the same transition path
   Target feel: the room stays, the instrument on the desk changes.

2. STRATEGIC COLOUR (tokens, semantic only)
   Introduce a phosphor accent set on top of the monochrome base. Colour
   means something or it doesn't appear:
   - RED (existing): alerts, sealed-block interrupts, the live dot
   - PHOSPHOR GREEN: confirmed/locked/healthy — finalised epochs,
     INCLUDED ticks, participation when >= 99%
   - AMBER: pending/queued/waiting — mempool pending state, validator
     queue, epoch awaiting justification
   All three defined in tokens.css for both themes. Decorative elements
   stay monochrome. Sparingly: a screen should read 95% mono.

3. CONTRAST + DESKTOP QA (both themes)
   Automated audit: every text node >= 4.5:1 against its actual
   background (3:1 allowed only for >= 24px display type), both INK and
   BONE, at 1280x700, 1536x960, 1920x1080. Fix failures structurally in
   tokens, not per-element. Hover/focus states must also pass. Ambient
   glyph layers are exempt but must never sit under readable text.

4. SHARE, DISCOVERABLE
   Keep the inline glyph but triple its hit area and add a label on
   hover. Add [X] SHARE as a command-bar chip on every channel (keyboard
   X), sharing the current channel view or active KPI. The share modal
   gains the channel-motif template for non-BEAT pages.

5. FLOW CHANNEL V2
   The waterfall gets meaning, not just motion:
   - classify each tx: TRANSFER / CONTRACT / BLOB (from type + input
     data); type badge per line, blob lines get the amber accent
   - show value in ETH where > 0; brightness scales with value
   - when a pending tx from this session gets sealed into a block, mark
     it INCLUDED with a phosphor-green tick — the mempool's promise
     being kept, visible live
   - sealed-block interrupts become full inverted-panel rows with a
     barcode strip and block stats
   - header gains a live txs/sec rate with a 60s sparkline in a callout
   - filter chips: ALL · VALUE · BLOBS · CONTRACTS (keyboard F cycles)
   - wide desktop (>1600px): two-column waterfall, sealed blocks span
     both columns
6. GUARDRAILS
   Reduced motion (no morphs, instant switches), suspend on hidden,
   mobile pass, both themes, clean build, DECISIONS.md updated. Verify
   the WSS stream survives at least 10 channel switches without leaking
   connections (check with the browser task manager / listener counts).

## 16. Pass 9 — dial refined

A. HOMEPAGE: CIRCULAR COMPOSITION
   1. ETH glyph: dead-centre of the disc, redrawn as LINE-ONLY (1px
      outline strokes, no filled facets). The lub-dub pulse stays exactly
      as is — it is loved. Facet stagger applies to strokes now.
   2. Disc: the outer circle becomes a clean hairline. Remove the
      irregular/textured edge treatment entirely.
   3. KPI numeral: centred within the disc (glyph above it), still huge
      pixel type. The composition reads top-to-bottom inside the circle:
      glyph -> label -> big number.
   4. Supporting values (delta, sub-stat, category): arranged ON ARC
      PATHS following the disc's curvature around the numeral (SVG
      textPath), noticeably BIGGER than now, set in matte red. This is
      the signature move of the pass; commit to it.
   5. KPI navigation becomes a 3D horizontal carousel: the incoming
      number rotates in from BEHIND the disc on the left, sweeps across,
      exits front-right (CSS perspective + rotateY track, like a
      cylinder seen from above). Arrow keys/swipe drive it; the beat
      advance uses the same motion. Reduced motion: instant swap.
   6. Share: the button below the disc becomes a CIRCULAR button
      (round, 1px ring, glyph centred, label on hover), echoing the
      composition.
   7. ETH STAKED KPI: always show the % of total supply alongside the
      absolute number (both on the arc treatment).
   8. Remove all L2 metrics from the homepage rotation (they move to
      the new channel, item C).

B. GLOBAL UI
   9. RED, TURNED UP: red returns as a first-class accent across the
      UI: arc values, active states, live indicators, selected chips.
      Phosphor green/amber keep their semantic roles. Screens should
      now read mono + confident red, not 95% mono.
  10. COMMAND BAR: solid red background behind the entire bottom bar
      (ink/bone text adjusted for contrast, AA minimum). Remove the
      vertical channel strip overlay completely; the red bar is now the
      only navigation. Number keys + up/down still work; OSD flash on
      switch stays.
  11. THEME BUG: theme choice must persist across every navigation and
      view transition (root attribute set before paint on every route,
      carried through ClientRouter; store in localStorage; no flash of
      wrong theme). Verify by switching theme then visiting all
      channels both directions.
  12. MARGIN FRAME EVERYWHERE: the homepage's margin ticker frame
      (side rotated tickers, top clock strip, bottom status) becomes a
      shared layout component rendered identically on ALL channels.

C. NEW CHANNEL: L2 / ONCHAIN
  13. Add CH6 — LAYERS: dedicated L2 + onchain activity page. Content
      from existing growthepie data (per-chain daily actives, tx counts,
      TVS, fees) plus blob-posting chains: a ranked live board of
      chains (name, activity bar with hatched fill, share of total),
      an L1-vs-L2 split gauge, and a combined-activity chart. Same
      full-bleed instrument grammar, its own motif (stacked layers).
      Nav becomes 1-6; renumber OSD, chips, shortcuts, manual overlay.

D. CHANNEL FIXES
  14. NODES: remove the rule lines from the top stats grid; the four
      numbers set in the big display font at 3-4x current size, labels
      micro underneath. Map and client bars unchanged.
  15. BLOBS: contrast rescue. The cell grid and gauges must be plainly
      legible in both themes: stronger cell borders, filled vs empty
      cells at minimum 3:1 against each other, key numbers in display
      type, hatched fills coarser. Re-run the pass-8 contrast audit on
      this page specifically.
  16. FLOW: split layout: LEFT column = the stats as stacked BIG
      numbers (txs/sec, base fee, fullness, session count) in display
      type; RIGHT = the waterfall log. Remove all grid/table lines;
      use only thin connector lines (elbow leaders) linking stats to
      the stream. Two-column waterfall drops to one.
  17. FINALITY: contrast rescue (same standard as BLOBS) and true
      full-screen: the ladder + circles + track must scale to fill
      100dvh at every size from 1280x700 to 4K with no dead bottom
      space and no scroll; use container-relative sizing, test at
      1280x700, 1440x900, 1920x1080, 2560x1440.
  18. ABOUT: rebuild as a HORIZONTAL experience: full-height panels
      scrolling left-to-right (wheel + arrows + drag), one idea per
      panel, radically less text (a line or two per panel; details
      into modals like everywhere else). Panels: the idea / the beat
      / CROPS / sources / colophon. Mobile: falls back to vertical.

E. GUARDRAILS
   Reduced motion (no 3D carousel, no horizontal hijack), both themes
   re-audited after the red increase, mobile pass on every channel,
   one rAF loop, suspend on hidden, DECISIONS.md updated.

## 17. Pass 10 — contrast truth

This pass is about legibility and finish, not features.

1. PIXEL-TRUTH AUDIT TOOLING (build first, then fix until green)
   scripts/audit-contrast.mjs using Playwright (devDependency):
   - loads every route (/, /nodes, /blobs, /flow, /finality, /layers,
     /about) in BOTH themes at 5 viewports: 1280x700, 1440x900,
     1536x960, 1920x1080, 390x844
   - for every visible text node: sample the ACTUAL RENDERED PIXELS
     (screenshot crop) for glyph colour vs surrounding background —
     not computed styles, which lie under layering
   - report WCAG failures (4.5:1 body, 3:1 for >= 24px) to
     audit-report.md with route/theme/viewport/element
   - a decorative allowlist (ambient glyph layers, background numerals)
     is permitted but every entry must be justified in a comment
   Run it, fix EVERY failure, re-run until zero, commit script + final
   green report. The script stays as the permanent QA gate.

2. KNOWN BUGS (fix regardless of what the audit says)
   - command bar: active chip renders white-on-white in the light
     theme. Fix all chip states in both themes.
   - the red bar background must be a solid tokenised colour ON the
     nav element itself (no transparent chips resolving to page bg).
     If white-on-red fails AA, darken the red for the bar variant or
     switch bar text to ink — measured, not eyeballed.

3. PALETTE HARDENING: STRONG BLACK AND WHITE
   - INK theme: near-pure white paper, true near-black ink (#0A0A0A
     class); BONE theme: true near-black field, bone-white text
   - eliminate every mid-grey text role: secondary text becomes either
     full-strength ink at smaller size, or a grey that still passes
     4.5:1 — nothing softer exists anywhere
   - hatched fills, cell borders, gauge tracks: minimum 3:1 against
     their field in both themes
   The site should read like sharp print, never like a soft dashboard.

4. RED DETAILS ON EVERY PAGE
   Deliberate red accents across all channels, not just BEAT: leader
   lines to key values, the single most important number per module,
   active/selected states, live indicators, sealed-block rows. Working
   rule: every module has exactly one red element; red never exceeds
   ~10% of any screen. Applied per channel and listed in DECISIONS.md.

5. HOMEPAGE ARC TEXT: PIXEL FONT
   Arc values switch from Martian Mono to Departure Mono (pixel),
   slightly larger to compensate for pixel rendering on a curve; keep
   matte red; verify legibility at all 5 viewports (if textPath glyph
   rotation breaks the pixel font, use per-character placement).

6. FULL-SIZE INTERFACE REVIEW (the detailed pass)
   Manual QA matrix: 7 routes x 2 themes x 5 viewports. Per cell verify
   and fix: no clipped/overlapping elements, no dead bottom space,
   command bar visible without scroll, margin frame never collides with
   content, modals fit and scroll internally, FINALITY and BLOBS fill
   the viewport, the 3D carousel doesn't clip at narrow widths, arc
   text stays on the disc. Log the completed matrix with per-cell notes
   in DECISIONS.md — "checked, fixed X" per cell, not a blanket "done".

## 18. Pass 10b dial alignment + Pass 11 metadata

PART 1 — DIAL ALIGNMENT + MOTION
1. The mini-stats cluster (STAKE / PARTICIP / BLOBS / GAS) currently
   floats as a left-aligned text block inside the disc. Rehome it to
   the circular grammar: place each stat on its own short arc segment
   (or radially anchored with leader lines to its ring), evenly
   distributed, never overlapping the glyph or numeral. No floating
   rectangles of text inside the disc.
2. FINAL -2 EPOCHS label clips at the right viewport edge; keep all
   dial labels inside the safe area at every viewport (re-run the QA
   matrix cells for /).
3. ROTATING ARC TEXT: the red arc texts (_01 · HEARTBEAT ring and the
   0.0% VS YESTERDAY ring) rotate slowly and continuously around the
   disc: one full revolution ~90-120s, top and bottom arcs in opposite
   directions, text stays on its circular path (rotate the textPath
   group, not the letters). Pauses on hover; static under reduced
   motion. The systole may add a tiny 2-3 degree kick that eases back.

PART 2 — SEO + AI METADATA (canonical: https://ethereumbeat.org)
4. HEAD, PER ROUTE: unique title + meta description for all 7 routes
   (pattern: "Ethereum Beat — <channel> · <one-line>"), canonical URLs
   on ethereumbeat.org, theme-color per theme, full favicon set in the
   pixel aesthetic (SVG favicon + PNG sizes + apple-touch-icon).
   A CANONICAL_HOST env/config: when deployed on workers.dev it must
   still emit ethereumbeat.org canonicals; add a 301 redirect
   workers.dev -> ethereumbeat.org behind a flag, enabled once DNS is
   live.
5. SOCIAL CARDS: OG + Twitter meta on every route. Generate the
   1200x630 card images at BUILD TIME by reusing the share-template
   renderer per channel (static, committed or emitted to /og/*.png);
   og:image:alt included. Cards must be in the site's visual language.
6. STRUCTURED DATA (JSON-LD):
   - site-wide: WebSite + SoftwareApplication (free, browser)
   - each /pulse/[metric]: Dataset with name, description,
     temporalCoverage, license of the underlying source, and
     distribution pointing at the public /api/metric endpoint
   - /about: the sources list as citations
7. AI-AGENT METADATA: /llms.txt describing the project, channels, the
   open JSON API (endpoints, shapes, update cadence) and data licences;
   /llms-full.txt with the expanded version including per-metric
   definitions from metric_meta. Keep both generated from the metric
   registry so they never drift.
8. CRAWL PLUMBING: sitemap.xml (all routes + /pulse/* + /digest/*
   when it exists), robots.txt referencing the sitemap, RSS
   autodiscovery <link> ready for the future /feed.xml.
9. PWA/ASO GROUNDWORK: complete webmanifest (name, short_name,
   description, categories, icons incl. maskable, screenshots field
   with one desktop + one mobile capture) so the future PWA pass
   inherits finished install metadata.
10. VERIFY: every route passes a metadata self-check script
    (scripts/audit-meta.mjs: asserts title/description/canonical/OG/
    JSON-LD validity per route); commit the script alongside the
    contrast auditor as the second permanent QA gate.

## 19. Pass 12 — detail overlay

1. OVERLAY ARCHITECTURE (URL-preserving)
   /pulse/[metric] stops being a document page and becomes a full-screen
   overlay at 95% opacity over the live BEAT channel:
   - opened from BEAT (Enter / click): overlay slides over the running
     dial; the dial keeps beating underneath, faintly visible through
     the 5% transparency; the margin frame stays
   - direct URL: renders BEAT underneath + overlay open on load, so
     deep links, SEO canonicals, OG cards and the Dataset JSON-LD all
     keep working unchanged
   - Esc / close returns to the dial (history-aware: pushState from
     BEAT, real navigation on direct entry)
   - if View Transitions allow it, the dial's KPI numeral morphs into
     the overlay's numeral on open (shared transition:name)

2. REDESIGN TO THE CURRENT LANGUAGE
   Rebuild the overlay content in the instrument grammar, zero
   document styling:
   - the metric value in giant pixel numerals (Departure), unit and
     per-metric caption (metric_meta caption field) beside/below it
   - the principle line stays but restyled: inverted panel or red pixel
     type, with its CROPS badge; clicking the badge opens the values modal
   - the long description paragraph leaves the screen: one line max
     visible, full text behind the [?] EXPLAIN modal like every module
   - chart restyled: hatched area fill instead of the soft gradient,
     hairline grid at 3:1 minimum, scrub readout as a callout box with
     elbow leader line, red only for the scrub cursor + latest point,
     range control as command-bar-style chips
   - corner brackets, plus-field texture, barcode separator above the
     source line; SOURCE micro-line stays (licence intact)
   - circular share button, same as the dial's

3. OVERLAY NAVIGATION
   While open: Left/Right cycles through featured metrics WITHOUT
   closing (URL updates via replaceState, content crossfades with a
   scramble frame); D/W/M/Q/Y keys switch chart ranges; X shares;
   Esc closes. All listed in the [?] manual overlay.

4. QA
   Both themes, 5 viewports, reduced motion (no morph, no underlying
   animation: the dial beneath pauses), mobile (overlay is simply
   full-screen there), audit scripts re-run green. DECISIONS.md updated.

## 22. Pass 13c — CR-O-P-S grouping

AUTHORITATIVE MAPPING (final): CROPS keeps all five letters, grouped into
FOUR properties, with Censorship Resistance owning the CR pair:
  CR — Censorship Resistance
  O  — Open Source and Free, as in Freedom
  P  — Privacy
  S  — Security
No standalone R. No fifth property. No "Resilience" category anywhere.

1. FOUR BADGES, CR IS A DIGRAPH
   Category badges are: [CR] · [O] · [P] · [S] — four interactive
   badges, where CR renders as a single two-letter unit (one box, the
   pair kept together, never split across a line or into two badges).
   The [CR] badge is one target, one modal (Censorship Resistance).

2. WORDMARK KEEPS FIVE GLYPHS
   Where CROPS appears as the name, all five letters show, but the
   grouping is legible: subtly bind C+R (tighter tracking / a hairline
   bracket / shared underline) so the eye reads CR · O · P · S, four
   groups. One-line gloss on first appearance: "CROPS — four properties:
   Censorship Resistance, Open source, Privacy, Security."

3. RE-HOME METRICS TO THE FOUR
   Every metric tagged to the old invented R/Resilience moves to its
   best-fit property (CR/O/P/S) with a one-line rationale in
   metric_meta: node distribution + client diversity → Censorship
   Resistance and/or Security; the O keeps its client-diversity /
   open-client evidencing from pass 13. Uptime stays HEARTBEAT framing,
   explicitly not a CROPS property.

4. SWEEP EVERYTHING
   Badges, filters, category indices, CH1 values beats, manual overlay,
   /about CROPS section, llms.txt, JSON-LD keywords, share/OG copy:
   all reflect CR·O·P·S = four properties. Grep and kill any five-
   property or standalone-R or "resilience"-as-category remnants.

5. QA
   Both themes, 5 viewports, audit-contrast + audit-meta green.
   DECISIONS.md records the CR·O·P·S mapping and where each former R
   metric landed.

## 23. Pass 14 — section headers

SCOPE: a GLOBAL change to a shared pattern. Every uppercase tracked-out
section/eyebrow header (the "_A3 FOUR PROPERTIES" style) converts to one
shared header component: CH1 BEAT + the pulse overlay, CH2 NODES, CH3
BLOBS, CH4 FLOW, CH5 FINALITY, CH6 LAYERS, all modals (EXPLAIN, values/
CROPS, share, ticker "beat of the number"), /about section headers, and
the channel identity.

1. NEW HEADER COMPOSITION (the shared component)
   Left-aligned two-part lockup replacing the centred uppercase eyebrow:
   - LARGE INDEX NUMERAL on the left: big (≈2-3x body display size),
     NON-pixel grotesk (self-hosted woff2, OFL), heavy, tabular. The
     anchor.
   - TEXT BLOCK to the right, TWO LINES, LOWERCASE grotesk:
       line 1: section/category name (e.g. "censorship resistance")
       line 2: short lowercase descriptor (e.g. "the four properties")
   Numeral vertically centred to the two-line block.

2. NEW TYPE RULE
   Pixel font (Departure) = LIVE DATA only (KPI numerals, big background
   channel glyph). Grotesk lowercase = human labels and section headers.
   Retire tracked-out uppercase and the _NN underscore-eyebrow style for
   headers. This voice-split is the point.

3. APPLY ONCE, EVERYWHERE
   One shared component, so every location updates from the single change.
   Verify each listed location actually renders the new lockup.

4. QA
   Both themes, 5 viewports (numeral + two-line block stack gracefully on
   mobile, no bad wraps, CR digraph and other labels unaffected), contrast
   + meta audits green, DECISIONS.md lists every converted location.

## 24. Pass 16 — project contact surfaces

Add the project's public contact + security-reporting surfaces. Mail is live via
Cloudflare Email Routing on ethereumbeat.org: one routing rule (beat@) plus
subaddressing enabled. (Numbering: this is Pass 16 — Pass 15, "personality",
was executed and recorded in DECISIONS §24 without its own SPEC section — and it
takes the next SPEC section number, 24.)

ADDRESSES — a deliberate single-mailbox split; do NOT normalise to one address:
- SECURITY.md + security.txt use  beat+security@ethereumbeat.org
- footer + /about use plain        beat@ethereumbeat.org
No other address exists or routes. Never publish or reference any other
local-part, or any address on a zone that is not onboarded — they bounce.

1. SECURITY.md (repo root). Scope: this site and its collector, not the Ethereum
   protocol. Report to beat+security@ethereumbeat.org; 72h acknowledgement
   target; no bounty. Explicitly out of scope: findings in the upstream data
   sources (growthepie, ethernodes, beaconcha.in, PublicNode, Blobscan,
   DefiLlama) — those go upstream. Note the site handles no user accounts, no
   PII, and no per-node coordinates.

2. RFC 9116 security.txt at /.well-known/security.txt, Content-Type text/plain.
   Fields: Contact (beat+security@ethereumbeat.org), Expires, Preferred-Languages,
   Canonical, Policy (SECURITY.md blob URL on GitHub). Expires must be a real
   ISO-8601 timestamp under one year out — generated at build time from the build
   date + 350 days, never hardcoded. Verify the emitted route is exactly
   /.well-known/security.txt.

3. Footer: a contact line next to the existing source-registry attribution.
   Lowercase grotesk label, the pixel display face (Departure) for the address,
   a 1px rule above matching the existing footer divider treatment. No mailto
   icon, no button — a plain underlined link.

4. /about: a short CONTACT block in the existing section rhythm — plain beat@,
   plus one line noting mail is forwarded via Cloudflare Email Routing and is
   therefore not end-to-end encrypted.

Constraints: no new dependencies; do not touch metric_meta or the source
registry. Run audit-contrast, audit-meta and audit-csp locally before pushing —
the small footer text is the first thing to fail contrast on Linux Chromium; fix
by bolding or lifting size, never by loosening the threshold. Clean build. Commit
and push per completed item. Log decisions in DECISIONS.md.

## 25. Broadcast — daily digest to Nostr, Farcaster + X draft

From the daily cron (after the collector), publish a compact, non-financial
protocol-health digest. Everything degrades like `send_email`: an absent key
skips that channel, never throws.

1. DIGEST (the shared body). Built from the same snapshot the site renders,
   in the project voice ("a heartbeat, not a ticker"). Vitals only — no price,
   market-cap or trading framing (the three usd metrics are excluded). One body
   string, ≤280 chars for X and ≤320 bytes for Farcaster; the URL and the
   relevant `/og/*.png` travel alongside (embed/attachment where supported,
   appended to the text where not). Always links to ethereumbeat.org.

2. NOSTR. Sign a kind-1 event with `NOSTR_NSEC` (BIP-340 Schnorr over
   secp256k1; nsec or hex accepted) and publish to a small, configurable relay
   set (`NOSTR_RELAYS`, comma-separated; a free default set otherwise) over the
   Worker's outbound WebSocket. No third-party paid service. Absent nsec → skip.

3. FARCASTER. Publish a cast via the account's signer using the DIRECT HUB
   path: a CastAdd protobuf, Blake3-hashed, Ed25519-signed with
   `FARCASTER_SIGNER` for `FARCASTER_FID`, POSTed to a hub's
   `/v1/submitMessage` (`FARCASTER_HUB`, configurable). No paid API. Absent
   secrets → skip.

4. X. No X API (no free tier as of Feb 2026): write the generated post text
   (and OG image link) to `/broadcast/x-draft.json` for manual posting, with a
   clear TODO to add a `publishX()` if the maintainer later opts into paid
   pay-per-use. The endpoint self-heals from the snapshot like /api/snapshot.

5. SECRETS. All new secrets are optional and injected only into the throwaway
   `wrangler.ci.toml` at deploy time (never the committed public config), under
   the existing `[vars]` table; deploy.yml verifies each set secret survives
   generation. Forks with no secrets deploy an unchanged config and simply skip
   the social channels.

6. GUARD. A once-per-UTC-day KV marker prevents a double run posting twice; the
   X draft is idempotent and always refreshed. Crypto verified against the
   NIP-19 vector + Schnorr/Ed25519/Blake3 round-trips (scripts/test-broadcast.ts)
   and exercised in the workerd runtime before wiring.

## 26. Roadmap channel (CH 07)

A first-class seventh channel (key `7`: BEAT NODES BLOBS FLOW FINALITY LAYERS
ROADMAP) that translates Ethereum's upgrade roadmap into human-readable "what's
coming", with EIP numbers as geeky decoration, in the observatory aesthetic.

NON-FINANCIAL: each upgrade and EIP is framed by its protocol/network-health
significance (censorship resistance, decentralisation, node sustainability,
privacy). All price / trading / "catalyst for ETH" framing from upstream sources
is stripped.

1. DATA SOURCE. Forkcast's structured upgrade data (`ethereum/forkcast`
   `src/data/upgrades.ts`, fetched from raw GitHub) is the wired machine source —
   Forkcast's own llms.txt says its page bodies are client-rendered and directs
   machine consumers to the repo source data. Fallbacks noted: the ethereum/EIPs
   Meta EIPs and the EF blog. Forkcast/EF (+ strawmap.org for the long-range
   view) are added to the source registry with attribution.

2. TABLES. New D1 tables `roadmap_upgrades` + `roadmap_eips` (metric_meta is NOT
   touched). Migration in `db/migrations/006_roadmap.sql`, seed in
   `db/roadmap.sql`. Both are a schema change and must be applied MANUALLY to
   remote D1; no KV bust needed (the page + /api/roadmap self-heal from D1).

3. REFRESH. The daily cron refreshes the machine fields (status, target window,
   meta links) from Forkcast and rebuilds the KV snapshot; best-effort, never
   throws. The one status change it makes is flipping an upgrade to `live` when
   Forkcast marks it Live with a real date (dates SLIP — nothing else is
   auto-locked). Editorial fields (plain-language summaries, CROPS tags) are
   hand-authored and never overwritten. New upstream forks are logged, never
   auto-inserted, so no unvetted blurb renders.

4. UI. A forward-looking, server-rendered timeline in the monochrome-observatory
   language: 1px rail, Departure Mono for EIP/year tokens, lowercase grotesk for
   human summaries, red accent, a procedural scan pip down the rail (gated by
   reduced motion — never fully still). "target, not locked" is stated honestly;
   no fixed mainnet date is asserted. Seed reflects current reality: Fusaka
   (live, Dec 2025), Glamsterdam (Gloas+Amsterdam, devnet, H2 2026 target, no
   locked date; ePBS EIP-7732, BALs EIP-7928), Hegotá (~2027; FOCIL EIP-7805 →
   Censorship Resistance).

5. SWEEP. The audit sweep covers 7 channels (contrast + CSP route arrays, meta
   presence list). Contrast is fixed by weight/size/fill, never thresholds.

## 27. Declutter — GitHub-first contributions + design system

Trim the project to a GitHub-first contribution story and add a single-page
design system. Non-financial framing unchanged; nothing here touches
metric_meta.

A. /support — stripped to one purpose: contributing via GitHub. All donation /
   wallet / ENS / GitHub Sponsors content removed; a short line + a repo link in
   the project voice, in the existing page aesthetic.

B. README — the donation-framed Support line now points at GitHub contribution;
   the email-routing sentence is gone. The tech-stack section STAYS in the README
   (this is where it belongs). A brief "Design system" line links to the live
   /design page and DESIGN.md — the ONLY place /design is linked.

C. Site-wide removals (user-facing pages only; code comments untouched):
   - the verbatim "Mail is forwarded via Cloudflare Email Routing…" sentence;
   - the footer CONTACT entry (label + beat@ mailto) and its ContactCredit
     component + .contact-addr CSS. The width-tight desktop footer row must not
     clip at 1024/1280 after removal (screenshot-checked, as pass 16 did);
   - the general contact email from every user-facing page (footer + /about
     CONTACT panel), replaced by the existing GitHub pointers;
   - tech-stack / infrastructure brand names (Astro, Cloudflare, Workers, D1, KV,
     Wrangler). Functional wording that does not name the stack stays ("updated
     daily", "live values every 12s"). SECURITY.md and /.well-known/security.txt
     are NOT touched — the security contact (beat+security@) is a spec requirement
     and stays.

D. /design — a comprehensive single-page design-system reference that DOGFOODS
   the project's own language, sourced from src/styles/tokens.css (no invented
   values): brand/ethos, CROPS, colour (hex + AA pairs), the seven themes,
   typography, the 1px line system, spacing/grid, motion ("never fully still"),
   the beating glyph and core components, and voice. Every piece of text passes
   the contrast audit across all 7 themes (fixed by weight/size, never
   thresholds); swatches are textless colour blocks with AA labels. It is added
   to the audit ROUTES arrays (contrast + CSP) but is UNLINKED — not in the site
   ROUTES/nav/footer/sitemap/llms; reachable by direct URL only, referenced
   solely from the README.

E. DESIGN.md — repo root, following Google's design.md spec (alpha): the default
   INK theme encoded as the primary palette in YAML frontmatter, the other six
   themes in prose; canonical section order (Overview, Colors, Typography,
   Layout, Elevation, Shapes, Components, Do's/Don'ts). Content mirrors /design.
   `npx @google/design.md lint` is a local validation aid, never a verify gate.

F. SEO/AEO — llms.txt confirmed (correct name), still free of contact email and
   tech-stack; /methodology added to its route list. /design kept out of
   sitemap.xml and llms.txt. Meta/OG/JSON-LD swept: no dangling contact,
   tech-stack or donation references (the only JSON-LD Organization is the data
   source attribution, not a project contact). robots.txt still allows crawlers.

Gates: clean build; audit-contrast green across 7 channels + /design × 7 themes;
audit-meta + audit-csp green. One PR; squash-merge on green.

## 28. Pass 17 — ambient wallpaper system, RSS, corner menu, footer refocus

Add an /ambient desktop-wallpaper system, a public RSS feed, a global corner
menu, and refocus the footer. Non-financial framing unchanged; nothing here
touches metric_meta, adds no channel or metric, and needs no D1 migration or KV
bust. The six channels stay BEAT, NODES, BLOBS, FLOW, FINALITY, LAYERS.

A. /ambient — a chrome-free, full-viewport wallpaper system for desktop tools
   like Plash. LOCKED palette: hard black + white + one signal-red accent ONLY,
   THEME-INDEPENDENT — the +/- theme system is ignored so the contrast matrix
   stays 10 designs, not 10×7. Wires the same live 12-second slot layer and
   snapshot:latest the main site uses (blockfeed + clock + snapshot metrics).
   URL SCHEME:
   - /ambient   — interactive chooser: renders a design, ← → cycle 1..10, and a
     "copy wallpaper link" affordance that yields the /ambient/N URL.
   - /ambient/N — the clean locked single design, no picker, nothing
     interactive (Plash freezes page state, so arrows cannot work in wallpaper
     mode — the URL is how you pick). Gets noindex + canonical to /ambient.
   THE TEN DESIGNS, simple → complex, mono+red, Departure Mono for live
   data/indices, lowercase grotesk (Inter) for human labels, 1px lines,
   procedural slot-synced motion — never completely still:
     1 glyph · 2 slot · 3 beat · 4 ticker · 5 stack · 6 grid ·
     7 dial · 8 strip · 9 console · 10 wall.
   /ambient and a representative /ambient/N are added to the audit-contrast and
   audit-csp ROUTES arrays; both are kept OUT of sitemap.xml (so audit-meta,
   which crawls the sitemap, never runs HTML checks on them).

B. RSS — a public feed at /rss.xml (Astro endpoint, application/rss+xml). Items
   derive from the SAME source the daily social broadcast uses: the daily
   channel digest (worker/broadcast/digest.ts buildDigest) plus roadmap status
   flips (roadmap_upgrades). Protocol-health only — no price, TVL or market
   framing. Title/description carry the network-health framing; data-derived
   items keep the growthepie CC BY 4.0 attribution. Built from snapshot:latest /
   D1 at request time; zero paid services. The existing rss+rss autodiscovery
   <link> in the head is repointed from the never-created /feed.xml to /rss.xml.
   The feed is NOT added to the sitemap.

C. Corner menu — global site chrome on every route. A blinking signal-red arrow
   anchored bottom-right beside the beating glyph (blink via a CSP-compliant CSS
   animation). Click (Esc / click-outside to close) expands a LARGE red panel
   out of that corner — a substantial red field, not a tray. Inside, five big
   square tiles with hand-drawn 1px monochrome SVG icons in the structural-index
   style (no icon font/library): Ambient → /ambient, RSS → /rss.xml, Farcaster,
   X, Badges → /badges. Social targets come from the real project config, never
   invented. Tiles sit on the red field, so icon + label colour clears WCAG AA
   on the exact red token (large-text tier permitted; size/weight up, never
   loosen thresholds). All menu JS is nonced; no inline handlers. The chosen
   panel palette is documented in DESIGN.md.

D. Footer refocus — the footer carries core site navigation only (About,
   Roadmap, the six channels, GitHub); ancillary destinations (ambient, feed,
   social, badges) move to the corner menu. The growthepie / source-registry
   CC BY 4.0 attribution block STAYS in the footer, one-click reachable from the
   homepage — it is NOT moved behind the menu. /design stays README-only (never
   linked from the footer).

E. Docs — /design and DESIGN.md document the ambient system (the ten designs,
   the /ambient vs /ambient/N URL scheme, the locked mono+red palette, Plash
   usage), the corner-menu pattern + its red-panel palette, and the footer
   refocus.

Gates: clean build; audit-contrast green across 7 channels + /design + /ambient
+ /ambient/N (ambient is theme-locked, so 10 designs not 10×7); audit-meta +
audit-csp green; contrast failures fixed by weight/size, never thresholds. All
new JS through the CSP nonce gate. Commit and push per completed item; one PR.

## 29. Pass 18 — menu + ambient iteration

Iterate on the Pass 17 corner menu and /ambient system after review of the
deployed work. Non-financial framing unchanged; nothing here touches
metric_meta, needs no D1 migration or KV bust, and does not mutate wrangler.toml.

A. MENU — reposition to a LEFT-anchored, full viewport-height rail (top to
   bottom), expanding from the left edge, width min(40vw, 460px). The blinking
   trigger arrow moves to the bottom-LEFT, beside the ETHEREUM BEAT wordmark
   ("open by the beats"). Esc and click-outside close; blink + expand are
   nonced CSS.

B. MENU — tile set + the silent-fallback fix. Tiles are a vertical column of
   large square buttons: ambient (/ambient), rss (/rss.xml), farcaster, x,
   badges (/badges). The farcaster + x destinations are resolved from the
   social broadcast config; when a destination is absent (as both are today —
   only a runtime Farcaster FID secret and a manual X-draft exist, no public
   profile URL / handle), the tile renders in a visible DISABLED state and the
   build logs a warning. It is NEVER silently substituted with GitHub or any
   other destination — that substitution was the Pass 17 bug. GitHub is removed
   from the menu; it stays in the footer.

C. MENU — custom icons. Hand-built inline SVG marks in the structural-index
   house style: a single 1px stroke, square (butt) caps, sharp corners only (no
   border-radius), monochrome, grid-aligned, one stroke weight and box size
   across the set. No icon library. ambient = hard-edged screen rectangle with
   a pulse tick; rss = three concentric quarter-arcs + a dot; farcaster = the
   geometric arch mark; x = the geometric X mark; badges = a hard-geometry
   shield/rosette.

D. MENU — wordmark font. The ETHEREUM BEAT wordmark in the menu (and anywhere a
   wordmark used the pixel face) renders in the lowercase grotesk display face,
   per the human-label rule and the roadmap grotesk decision. The pixel face
   stays reserved for live data and indices.

E. /ambient — a persistent "ESC · EXIT" control in the chooser bar returns to /
   (the main site); the Esc key does the same. /ambient/N stays chrome-free (it
   is the locked wallpaper) — the exit lives on the chooser only.

F. /ambient — a "WALLPAPER SETUP" button in the chooser bar opens an on-brand,
   nonced modal (mono + grotesk, 1px borders, red accent, hard corners):
   install Plash (free, Mac App Store, attributed), paste an /ambient/N link,
   use Browsing Mode to configure then lock, set a reload interval, and note the
   12-second live pulse keeps running. Esc and click-outside close it.

G. /ambient — the full-side designs 8 (strip), 9 (console) and 10 (wall)
   re-anchor to the LEFT edge so they clear the macOS desktop-icon column and
   match the intended wallpaper layout.

Gates: clean build; audit-contrast green across all routes/themes/viewports
including the larger left red rail (tile icon + label clears AA on the exact red
token, fixed by weight/size never thresholds); audit-meta + audit-csp green with
every new inline script nonced. The growthepie / source-registry attribution
stays in the footer, one click from home. Commit and push per item; one PR.

## 30. Pass 19 — pulse overflow fix + open-source-first ambient install

Iterate again on the ambient/menu work and fix a pulse-detail layout bug. The
LEFT full-height corner menu, its disabled-tile/no-github behaviour, custom 1px
icons, grotesk wordmark, the /ambient ESC·EXIT control and the left-anchored
full-side designs all landed in Pass 18 (§29) and stand unchanged; this pass
carries the three deltas below. Non-financial throughout; nothing here touches
metric_meta, needs no D1 migration or KV bust, and does not mutate wrangler.toml.

A. PULSE DETAIL — value overflow. On /pulse/[metric] the hero pixel numeral
   overflowed its left column and painted across the divider into the chart /
   y-axis ticks for high-digit-count values (e.g. daily transactions
   "40,772,554" over a "71.8M" axis tick). Fix: the value column reserves its
   grid track (`min-width:0` on `.hud-col-left`, so the `minmax(0,…)` tracks are
   honoured) and clips as a hard safety net (`overflow:hidden`) so text can NEVER
   cross the divider; the value font-size is a `clamp()` whose middle term is
   column-relative (`cqi`, via `container-type:inline-size`) and whose MAX scales
   down with the digit count, so a billion-scale value shrinks to fit rather than
   overflow. Verified with a forced max-width value at every breakpoint.

B. ÜBERSICHT WIDGET — shipped in-repo. A small, open-source Übersicht widget at
   `/desktop/ubersicht/ethereum-beat.jsx` renders /ambient in a transparent,
   left/bottom-anchored iframe on the desktop layer (the inner page keeps its own
   12-second pulse; no shell command). A short README in that folder: drop the
   file in Übersicht's widgets folder, done. Non-financial and self-contained.

C. /ambient INSTALL MODAL — open-source first. The WALLPAPER SETUP modal (nonced;
   mono + grotesk, 1px red border, hard corners; Esc + click-outside close) now
   leads with the CROPS-aligned path:
   - PRIMARY — Übersicht, labelled "free · open source": install Übersicht and
     drop in the shipped ethereum-beat.jsx widget (linked in-repo). Recommended.
   - SECONDARY — Plash, labelled "free · closed source": paste an /ambient/N link,
     use Browsing Mode to configure then lock, set a reload interval. Zero-friction.
   Both are labelled honestly; Plash's closed-source status is not hidden.

Gates: clean build; audit-contrast green across all routes/themes/viewports
(incl. the pulse routes and the larger left red rail); audit-meta + audit-csp
green with every new inline script nonced. The growthepie / source-registry
attribution stays in the footer, one click from home. Commit and push per item.

## 31. Pass 20 — terminal menu + wordmark trigger

Redesign the corner menu (from Pass 18/19) into a terminal-style list opened by
the wordmark itself. Non-financial throughout; nothing here touches metric_meta,
needs no D1 migration or KV bust, and does not mutate wrangler.toml. Respects
prefers-reduced-motion; all new JS goes through the nonce gate.

A. TRIGGER — the wordmark opens the menu. The standalone blinking-arrow box is
   removed. The bottom-left "ethereum beat" wordmark (lowercase grotesk,
   unchanged face) is the clickable + keyboard-focusable trigger. On hover AND
   keyboard focus it shows a small lowercase "more options" tooltip whose border
   DRAWS IN, reusing the existing corner-bracket border-animation primitive
   (.hud-frame / .hud-edge / .hud-tick + the hud-line-draw keyframe) so it is
   identical to the pulse HUD and dive panels. Click / Enter opens the panel; Esc
   and click-outside close.

B. OPEN MENU — a terminal list. All tile icons and per-tile bordered boxes are
   gone. The options are a vertical stack of large lowercase labels in Departure
   Mono (the pixel face) at a very large size: ambient (/ambient), rss
   (/rss.xml), farcaster, x, badges (/badges). farcaster + x keep their disabled
   "soon" state — no destination is wired or substituted. The ESC control stays
   at the bottom; the "ethereum beat" wordmark at the top stays grotesk.

C. BLINKING CARET. The hovered / focused option renders a blinking "_" caret
   after its label (a terminal cursor) via a nonced CSS animation. Up / Down
   arrow keys move focus between options and move the caret; Enter activates.
   Only one caret is visible at a time.

D. REACTIVE PIXEL TEXTURE. The red panel carries a procedural background: a grid
   of small red pixel cells at varying opacity (a subtle dither). The cursor
   drives a spotlight/ripple that raises the opacity of nearby cells; cells
   settle back when the cursor leaves. Driven by a nonced script (canvas). HARD
   CONSTRAINT: the cells only ever DARKEN the field (dark-red over the #c90500
   token), and their opacity is clamped, so white option labels — which sit on
   the solid red token — never drop below WCAG AA in the texture's worst-case
   (max-opacity) state; darkening only raises white-on-red contrast. Under
   prefers-reduced-motion the texture is static (drawn once, no ripple).

Gates: clean build; audit-contrast green across all routes/themes/viewports
(the big pixel labels clear AA on the red token in the texture's worst case,
fixed by weight/size never thresholds); audit-meta + audit-csp green with every
new inline script nonced. The panel palette + texture opacity ceiling are
documented in DESIGN.md. The growthepie attribution stays in the footer. Commit
and push per item; one PR.

## 32. Pass 21 — footer-logo opener + pixel-beat mark

Move the menu trigger onto the footer/command-bar logo and give it a pixel mark.
Non-financial throughout; nothing here touches metric_meta, needs no D1 migration
or KV bust, and does not mutate wrangler.toml. Respects prefers-reduced-motion;
all new JS is nonced.

A. PIXEL-BEAT MARK. A small hard-edged pixel glyph, the 3×2 bitmap
   `1 0 1 / 0 1 0` (filled cells top-left, top-right, bottom-centre), rendered as
   crisp square pixels (no radius, no antialias) in the wordmark's own colour so
   it clears WCAG AA on the red command-bar token (#ffffff on #c90500 = 5.9:1).
   Static this pass. It replaces the "•" live-dot in the footer wordmark lockup,
   site-wide.

B. TRIGGER → FOOTER LOGO. The command-bar logo lockup ([pixel-beat mark] +
   ETHEREUM BEAT) becomes the menu opener; the separate v3 bottom-left grotesk
   trigger is removed. Behaviour is preserved: hover AND keyboard focus show the
   animated-border "more options" tooltip (the shared .hud-frame primitive);
   click / Enter opens; Esc + click-outside close. Because the command bar
   re-renders on soft-nav, the open handler is a delegated document listener
   (the tooltip is pure CSS), so it survives navigation.

C. PANEL WIDTH. The open panel is 50vw on desktop (full viewport height,
   unchanged). Below the tablet breakpoint (768px) it is full-width — the big
   pixel labels need the room; 50vw is not applied on mobile.

D. NO TOP WORDMARK. The "ethereum beat" header at the top of the open panel is
   removed; the panel opens directly to the terminal option list. The ESC control
   stays at the bottom.

Gates: clean build; audit-contrast green across all routes/themes/viewports (the
pixel-beat mark clears AA on the red token; the big pixel labels clear AA at the
new 50vw width in the reactive texture's worst case, fixed by weight/size never
thresholds); audit-meta + audit-csp green with every new script nonced. The
DESIGN.md records the mark bitmap + the width rule. Commit and push per item.
