# DECISIONS

Running log of choices made where the spec left options open, plus anything
punted and why. Newest entries at the bottom of each section.

## Build decisions

- **Spec file name**: the spec landed as `spec.md` (lowercase). Kept as-is and
  treated as authoritative.
- **Fonts**: Inter (grotesk with tabular figures) + JetBrains Mono, both SIL
  OFL, variable woff2 committed with licence files. Spec offered Inter or
  Space Grotesk; Inter chosen for its proper `tnum` support in huge numerals.
- **stables_supply and tvs from growthepie, not DefiLlama**: one call covers
  L1 + all tracked L2s with full history; the spec's DefiLlama endpoints were
  verified working and remain noted as fallback. growthepie's `tvl` metric is
  literally named "Total Value Secured", matching the spec's `tvs` intent.
- **blobs_daily from growthepie `da_fundamentals`** (`da_blob_count` for
  `da_ethereum_blobs`): Blobscan's daily-stats route 404s and growthepie
  offers full history in one call.
- **rwa_value counts Ethereum L1 only** (sum of DefiLlama RWA-category
  protocol TVL on Ethereum). Historical category data is paid-only, so the
  series accumulates one point per day from the cron; the detail chart shows
  an honest "accumulates daily" note until it has history.
- **BEATS_PER_KPI = 1** with a smaller mid-slot half-pulse, as the spec
  suggests for keeping the rhythm alive at one KPI per 12s beat.
- **Cron wrapper**: `@astrojs/cloudflare` does not expose a `scheduled`
  handler, so `worker/index.ts` wraps the Astro-built worker and adds one;
  `wrangler.toml` points at the wrapper. `astro build` must run before
  wrangler dev/deploy (the npm scripts do this).
- **Big-file fetch timeouts**: the spec says 10s per source; growthepie's
  fundamentals/DA exports are 3–8 MB and get 30s. All other sources keep 10s.
- **Snapshot self-heal**: /api/snapshot recomputes from D1 and rewrites KV if
  the key is missing, so a fresh deploy needs no manual snapshot step.
- **Aggregation correctness**: w/m/q/y buckets exclude the current incomplete
  bucket for sum/mean metrics (a partial month summed against full months
  would plunge at the chart edge); `last`-mode metrics keep it.
- **Edge caching**: API responses go through the Workers Cache API
  (`caches.default`) because an `s-maxage` header alone does not populate
  Cloudflare's edge cache from a Worker.
- **Node geography baked via a real browser**: ethernodes.org blocks
  automated fetches (Cloudflare challenge) but renders fine in a browser, so
  country and client aggregates for both layers were captured on 2026-07-18
  and baked to `src/data/nodes-geo.json` with a visible "as of" stamp in the
  UI. Refresh path: rerun the capture, update the JSON. The map dot grid is
  baked from public-domain Natural Earth polygons by
  `scripts/build-land-dots.ts` (committed output, reproducible).

## Endpoint verification results (curl, 2026-07-18)

| Endpoint | Result | Decision |
|---|---|---|
| `api.growthepie.com/v1/master.json` | 200, chains + metrics metadata | Use for L2 count and metric metadata |
| `api.growthepie.com/v1/fundamentals.json` | 200 but only ~90 days of history | Use for daily collector top-ups only |
| `api.growthepie.com/v1/export/{metric}.json` | 200, full daily history per metric | Use for seeding/backfill |
| `api.growthepie.com/v1/da_fundamentals.json` | 200, `da_blob_count` for `da_ethereum_blobs`, full history | Use for `blobs_daily` |
| `stablecoins.llama.fi/stablecoincharts/Ethereum` | 200, full history | Kept as reference; `stables_supply` uses growthepie `stables_mcap` (covers L1 + L2s in one call) |
| `api.llama.fi/v2/historicalChainTvl/Ethereum` | 200, full history | Available for DeFi TVL if wanted later |
| `beaconcha.in/api/v1/*` | 401 "a valid API key is required" (spec assumed keyless free tier) | `validators_active` feature-flagged behind `BEACONCHAIN_API_KEY`; finality moved to standard Beacon API |
| `ethereum-beacon-api.publicnode.com/eth/v1/beacon/states/head/finality_checkpoints` | 200 | Use for `finality_ok`, keyless |
| `ultrasound.money/api/v2/fees/supply-parts` | 200 (beacon balances, execution balances, deposits) | Use for `staked_eth` and % of supply (supply = execution + beacon - deposits) |
| `ethernodes.org` (all paths, with and without browser UA) | 403 Cloudflare challenge | `client_diversity_el` and live `node_countries` OFF; node map geography baked at build time (see below) |
| `api.nodewatch.io` | TLS certificate expired | Dead, dropped |
| `migalabs.es` / `monitoreth` | DNS/timeout/cert failures | Dead, dropped |
| `api.blockprint.sigp.io` | Alive but data ends at slot ~11.65M (~19 months stale) | `client_diversity_cl` OFF as a live metric |
| `relayscan.io/overview/md` | Empty response | `builder_share` OFF (optional metric) |
| `api.blobscan.com` | Alive but no discoverable daily-stats route (`/stats/*` all 404) | Superseded by growthepie `da_blob_count` |
| `cloudflare-eth.com` | JSON-RPC internal error | Dropped from RPC fallback list |
| `eth.llamarpc.com` | 521 | Dropped |
| `ethereum-rpc.publicnode.com`, `eth.drpc.org`, `1rpc.io/eth` | 200, correct block shape | Tier-2 RPC fallback order: publicnode, drpc, 1rpc |

## Design pass 2 trade-offs (spec §9)

- **65 bpm, not a free choice**: 13 beats per 12s slot means the strong
  systole lands exactly on the slot boundary with no drift correction —
  the "resting heart" and the chain clock share one timebase.
- **Connector arc timing via negative animation-delay**: the arcs are CSS
  animations phase-locked to the slot at mount. CSS clocks can drift from
  the slot clock by a few ms over hours; accepted to keep the guarantee of
  transform/opacity-only compositor animations instead of per-frame JS.
- **One rAF loop**: the beat engine is the only rAF; glyph, ECG, tier-1
  tickers and readouts all subscribe to it, and it suspends on
  `visibilitychange`. Scanline/CRT/arc/tick-rotation are pure CSS (browsers
  pause compositing for hidden tabs). The ticker hex-flicker uses two
  short one-shot timeouts per value change — event-driven, not periodic.
- **QRS amplitude data**: gas-used share is only known for slots where the
  RPC poll succeeded; unknown slots reuse the last known share so the trace
  stays honest in shape without inventing per-slot values.
- **Unbounded numerals**: Unbounded's digits are effectively uniform-width
  at the weights used and `font-variant-numeric: tabular-nums` is set, but
  the face has no true `tnum` axis; the 460ms count-up can wobble a pixel
  on some glyph pairs. Accepted for the display presence it buys. Inter and
  JetBrains Mono remain declared as fallbacks.
- **Reduced motion**: heartbeat/glow/ECG animation, arcs, scanline, CRT
  overlay, dither is static so it stays; glitch, pixel-sort and dimension
  lines are gated off; ticker values swap instantly; KPI swaps instantly.

## Design pass 3 trade-offs (spec §10)

- **Departure Mono ships only a 400 weight**; the terminal presence comes
  from scale, not weight. Being monospaced, its digits are inherently
  tabular, which actually fixes pass 2's count-up wobble caveat. VT323 is
  the declared pixel fallback; Inter/JetBrains remain as last resorts.
- **FINAL marker geometry**: finality trails the head by 2 epochs, which
  on a one-revolution-per-epoch dial is exactly two full turns — the same
  angle. The notch therefore sits on an inner track at the head's angle
  with the label carrying the lag ("FINAL −2 EPOCHS"), outside the ring so
  it never collides with the numeral. The dial svg has overflow visible
  for the same reason.
- **`position: fixed` inside the ECG layer silently degraded to absolute**
  (the wrapper's translate creates a containing block), which misplaced the
  corner readout; it moved into the ticker system, which already owns
  viewport-docked fixed elements and value mirroring.
- **Command bar chips dispatch real KeyboardEvents** so pointer and key
  input share one code path; the bar lists home-only actions (dimmed) on
  other pages to keep the move-list stable. An [A] ABOUT chip and key were
  added because removing the top nav would otherwise strand /about.
- **Gas arc / epoch ring redraw work**: ring restyles 32 line elements once
  per slot and the sweep hand is one transform per frame — still within
  the single-rAF budget; no timers were added.

## Design pass 4 trade-offs (spec §11)

- **The background line is real data**: each featured metric's monthly
  series is resampled to 240 points and normalised 0..1, so any two curves
  interpolate point-for-point during the 600ms morph. Metrics with under
  two points (fresh series like rwa_value) fall back to a flat baseline
  rather than faking a curve.
- **"Roughly 2x" tickers literally overflowed** 700-800px-tall viewports
  (the vertical columns are length-constrained). Settled at ~1.5x plus a
  weight jump to semibold, moved BLOCK into the corner readout and BURNED
  into the bottom bar, and viewports under 760px tall shed the POS item.
- **No timers for the noise**: block-noise tiles and the stage displacement
  are scheduled inside the existing rAF loop (a next-fire timestamp), so
  hidden tabs stay perfectly still and the one-loop guarantee holds. The
  hex-dump crawl derives its bytes from the latest block hash — real data
  even in the set dressing.
- **Modal key handling**: the ticker modal registers a capture-phase
  keydown listener and stops propagation for Esc/arrows/Enter/Space, which
  cleanly freezes the stage and the layout shortcuts while open without
  any shared state.
- **Dither field uses mid-grey cells** (#808080) so one asset reads as ink
  on paper and bone on near-black without theme-specific variants.

## Design pass 5 trade-offs (spec §12)

- **Buffer seeding is sequential with concurrency 4**, not batched JSON-RPC:
  public gateways rate-limit and sometimes reject batch payloads; 64 single
  calls at 4-wide finish in a couple of seconds and reuse the existing
  fallback logic per call.
- **Viewport lock is a scale, not a clip**: the disc gained a height term
  (100dvh − 13rem) and the numeral a 13vh cap, so short windows shrink the
  instrument instead of cutting it. Verified zero document scroll at
  1280x700 and 1024x640; at 1024 wide the duplicate top-centre clock and
  bottom HASH yield to the corner readout.
- **Hash semantics**: manual navigation writes `#metric_key` via
  replaceState (no history spam); auto-rotation never touches the URL, so
  a shared link always shows what the sharer chose. Arriving via hash (or
  in-page hashchange) selects the KPI and engages HOLD.
- **Pulse ownership moved to the morph**: it fires once at morph
  completion; a held rotation (no morphs) falls back to pulsing on the
  systole so the line never reads dead.
- **Audio preference re-arms on the first gesture**: a remembered "on"
  cannot construct a running AudioContext at load (autoplay policy), so a
  one-time pointer/key listener enables it silently. Synthesis failure
  (no audio device) is swallowed — UI state keeps working.

## Pass 6 trade-offs (spec §13)

- **The rotated-ticker drift had a one-line root cause**: `min-width` is a
  physical property, so in vertical-rl columns every value slot became a
  variable horizontal thickness. `min-inline-size` (logical) fixes it by
  construction; both ticker voices also share one font size/line-height.
- **Blob limits come from the chain, not constants**: a live 10-blob block
  exposed a stale max-9 assumption; the beacon spec's BLOB_SCHEDULE puts
  mainnet at max 21 / target 14 since epoch 419072, and the UI now states
  those numbers.
- **FLOW is the real mempool**: newPendingTransactions subscriptions were
  verified working on PublicNode and dRPC (77 events/13s), so the
  block-replay fallback the brief anticipated was not needed. Pending
  lines carry hash only (values/types would need one eth_getTransaction
  per hash — too heavy); sealed-block dividers carry the full stats.
- **participation_rate is sync-committee participation** (512 validators,
  keyless, per block), not full attestation participation, which no free
  endpoint exposes; labelled "Sync participation" accordingly.
- **Punted after verification** (from the end of the list, per the brief):
  userops_daily (api.bundlebear.com DNS does not resolve) and
  censoring_relay_share (censorship.pics is a Plotly Dash app with no
  stable data endpoint; neutralitywatch.com 403s).
- **Blobscan attribution**: the public /blocks endpoint carries no rollup
  attribution per transaction, so channel 3's chains-posting stat uses
  growthepie's daily unique-blob-producers count instead.
- **Share images honour the active theme** at render time (canvas reads
  the CSS variables), so ink/bone shares both exist by construction.
- **Lighthouse performance is 88 after pass 6** (was 97). The miss is
  entirely simulated slow-4G LCP (3.9s modelled); observed field-style
  numbers are healthy: TTFB 23ms, element render delay 534ms, TBT 0ms,
  CLS 0.005. Share/ticker modals are lazy-loaded and the block backfill
  and series prefetch defer past first paint; the remaining weight is the
  observatory island itself. Accepted: the pass-1 target predates five
  channels, four rings and a share pipeline. Accessibility holds at 96.

## Pass 7 trade-offs (spec §14)

- **Red demoted by construction**: every accent usage was swept to ink and
  the survivors are an explicit allow-list — the live dot, FLOW's sealed
  blocks, the NO SIGNAL stamp, the >50% client supermajority alert, and
  one dot in share images. The KPI glitch keeps its RGB split (chromatic
  aberration is a glitch artifact, not an accent).
- **The channel strip hides on BEAT desktop**: both margins there ARE the
  ticker instrument; the strip is persistent everywhere else and on
  mobile BEAT. The command bar carries channels on BEAT desktop.
- **CROPS letters**: heartbeat maps to R (resilience/liveness) and
  privacy-security shows S; five letters, five properties, the combined
  category explained in its modal text.
- **A silent-miss lesson**: one scripted replacement failed without
  erroring and shipped a use-before-definition (CircleConstruction) that
  only surfaced at runtime; the check pipeline now greps the full astro
  check output rather than its tail.
- **Blob buffer refresh guard** keyed on newest block number ignored the
  backfill's older inserts; keys now include buffer length.

## Pass 8 trade-offs (spec §15)

- **The room stays**: ClientRouter makes channel switches same-document
  navigations, so module singletons (block buffer, mempool WSS, audio,
  series cache) persist for free. Verified: 10 channel flips (5 re-entering
  FLOW) constructed ZERO new WebSockets and the stream stayed live.
- **Persistent controller over persistent DOM**: the command bar and strip
  re-render per page (active states stay server-truthful) and hold
  visually via transition:name; all interaction is event delegation in one
  module script, so nothing needs re-binding after swaps.
- **Classification happens at seal time**: the pending stream carries only
  hashes, and classifying each pending tx would cost one RPC call per
  hash (~6/s). One full-block fetch per slot classifies everything that
  matters and powers the INCLUDED flip.
- **Two real bugs found by verification**: counting inside a lazy setState
  updater reads back as zero (the INCLUDED counter), and stale soft-nav
  sessions can mask fresh builds during testing (hard-reload before
  verifying).
- **--ink-faint is now a readable tier** (4.5:1) with --ink-ghost for pure
  decoration; light --accent/-ok deepened for contrast. The audit runs
  in-browser against composited backgrounds with aria-hidden exempt.

## Pass 9 trade-offs (spec §16)

- **The bar gets its own red**: turning the accent up in dark mode
  (#ff2a1f) took white bar text to 3.75:1. Rather than dim the accent
  everywhere, the command bar carries a dedicated `--bar-bg` (deep
  #c90500 light / #d81510 dark, 5.2–5.9:1 with white) so the page can
  glow while the bar stays legible. Post-fix audit: 7 routes x 2 themes,
  zero failures.
- **Arc text is SVG textPath, not CSS**: the supporting values ride the
  disc's actual radius (R=402 of the 1000-unit viewBox), top sweep 1 /
  bottom sweep 0 so glyphs stay upright on both arcs. It sizes with the
  disc for free and needs no per-breakpoint tuning.
- **FINALITY fills by construction, not by testing**: every row is
  clamp()-sized and the root is flex space-between, so "no dead bottom
  space" is a layout property. Verified exact fill (deepest content edge
  == viewport minus the reserved bar) at 1280x700, 1920x1080, 2560x1440.
- **CH6 LAYERS is server-assembled**: growthepie fundamentals is a ~4MB
  feed; a Worker route reduces it to a ~3KB board and edge-caches it for
  an hour, so browsers never touch the raw feed. L1 vs L2 typing comes
  from master.json rather than a hand-kept list.
- **Reduced-motion exposed a hydration branch**: BeatStage computed
  `prefers-reduced-motion` during first render, so SSR (always false) and
  a reduce-preferring client disagreed and React #418 fired — only under
  reduced motion, which is exactly the setting least likely to be tested.
  The flag now starts false (matching SSR) and lands in a post-mount
  effect. Rule recorded: media queries are effect state, not render input.
- **ABOUT scrolls sideways only where it can**: the horizontal rail
  (wheel→scrollLeft, arrows, drag) is desktop-only; mobile keeps native
  vertical snap panels, and reduced-motion skips the wheel hijack.
- **Home lost its L2 metrics** (blobs_daily, l2_count, median_l2_fee
  featured=0): they rotate on CH6 instead, so the home carousel stays a
  protocol-vitals instrument. Needs the remote meta re-apply + snapshot
  KV delete on deploy.

## Pass 9b hotfix trade-offs (homepage composition + carousel)

- **The glyph is a backdrop now, not a sibling**: pass 9 kept the glyph
  above the numeral (translate 500 300, scale 0.6); 9b centres it on the
  disc (translate 500 500, scale 1.3 — 57% of disc diameter) with the
  numeral layered on top. Legibility comes from dimming the strokes into
  a 0.36–0.43 opacity band rather than a knockout mask: a mask would have
  to track the numeral's width per metric, while a uniform dim is one
  constant and reads fine in both themes. Acceptance: glyph/disc centre
  delta ≤1.1px at 1280x700, 1536x960, 1920x1080 (0.1px in production).
- **The pass-9 carousel had never been built**: `.kpi-carousel` was a
  class with no CSS behind it — the numeral just swapped. Lesson logged:
  a named class in JSX is not evidence the effect exists; verify the
  computed style. The 9b acceptance criterion (matrix3d on the track
  mid-transition) is now the regression check.
- **A continuous virtual index, not a wrapped one**: the cylinder track
  rotates by `virtual * 42deg` where `virtual` never wraps; the visible
  slot is derived modulo count. Wrapping the index would spin the track
  backwards through a full revolution at rotation end. Deep links, dots
  and hashchange jump within the current revolution instead of resetting.
- **Only three faces render**: prev/current/next, keyed by virtual index
  so React reuses the DOM as faces change roles mid-sweep. The full
  rotation is 10+ numerals; rendering them all would mean a dozen live
  sparkline/count-up cards for two visible ghosts.
- **The apex glitch reuses the pass-4 keyframes**: one RGB-split slice
  fired by a timer at ~310ms into the 700ms sweep, applied to the
  perspective container (clip-path there doesn't disturb the children's
  3D). KpiCard's internal change-glitch no longer fires — each face keeps
  a constant metric — so the apex frame replaces it rather than stacking.
- **Reduced motion renders flat**: no perspective element exists at all
  under reduce (verified zero elements with computed perspective), not a
  frozen 3D scene — swaps are instant, per the pass-9 guardrail.

## Pass 10 trade-offs (spec §17 — contrast truth)

- **Pixel truth beats computed styles**: the new audit (scripts/
  audit-contrast.mjs, the permanent QA gate) samples rendered pixels and
  immediately found what three passes of computed-style audits could
  not: `.plus-field { opacity: 0.35 }` was dimming every element that
  used the ornament — all of BLOBS, LAYERS, FINALITY and the node map
  ran at 35% opacity. The pass-9 "contrast rescues" were fighting that
  one line. Dimness now lives in the texture's stroke-opacity.
- **Weight is half of legibility at small sizes**: full-ink 10px text
  still sampled ~3:1 because 400-weight stems never reach nominal
  colour. Micro/label/chip text now carries weight 600-650 and sizes
  moved 9->10px / 10->11px. Grey "secondary" text no longer exists:
  ink-soft is 0.82 alpha (~11:1), ink-faint 0.7 (~7:1), nothing softer.
- **Audit exemptions are argued, not assumed**: aria-hidden ornaments,
  aria-disabled inert chips (WCAG 1.4.3), punctuation-only separators,
  text occluded by overlays (hit-tested), rows >30% clipped by a scroll
  edge, and failures must reproduce on a second frame (the live mempool
  waterfall races screenshots). Two decorative selectors are allowlisted
  with justification comments.
- **Tailwind v4 `translate` composes with `transform`**: the left margin
  rail had `-translate-y-1/2` (CSS translate property) AND an inline
  `transform: translateY(-50%)` — applied twice, it shifted the rail
  267px up and clipped it off-screen. Found by the matrix sweep.
- **/nodes now fits 100dvh**: the map scales with the viewport
  (clamp 36vh) and client tables scroll internally; previously content
  silently clipped top and bottom under `overflow-hidden`.

### Red, per channel (item 4 — one per module, ≤10% of any screen)

- BEAT: arc values, current slot tick, sweep hand, debris (pre-existing)
- NODES: headline node count; the largest-country callout on the map;
  supermajority client rows (pre-existing, conditional)
- BLOBS: live blob count in the headline; monthly chart end-dot
- FLOW: TX/S number in the stat rail; block-seal marker in the stream
  (MEMPOOL LIVE moved to phosphor green — health, not alert)
- FINALITY: HEAD's live slot-progress arc (FINAL stays green: certainty)
- LAYERS: rank-1 board index; the L1/L2 split gauge marker (pre-existing)
- ABOUT: panel indices (_A1.._A5) (pre-existing)

### QA matrix (item 6): 7 routes x 2 themes x 5 viewports

Structural checks per cell (automated, then eyeballed): h-overflow,
v-scroll, dead bottom space, bar visibility, rail/bar and rail/top
collisions, carousel clip, arc-on-disc, modal fit. Themes share layout;
both were run for every cell — theme-specific notes called out.

| route | 1280x700 | 1440x900 | 1536x960 | 1920x1080 | 390x844 |
|---|---|---|---|---|---|
| / | checked; right rail cleared the bar by 2px → rail gap now scales with vh | checked, clean | checked; left rail was 267px off-centre (double translate) → fixed | checked, clean (arc text on disc, carousel numeral unclipped) | checked, clean (arc legible at pixel size) |
| /nodes | checked; client tables ran under the bar → tables scroll internally | checked; same fix applies | checked; same fix applies | checked; headline numerals clipped at top → map clamps to 36vh, stats sized by vh | checked; content was clipped by overflow-hidden → now fits with internal scroll |
| /blobs | checked; right rail touched the bar → rail gap fix | checked, clean | checked, clean | checked, clean | checked, clean |
| /flow | checked; rail touched bar → rail gap fix; pending rows were 0.62 opacity → 0.85 | checked, clean | checked; a half-clipped log row flagged → audit clip rule + verified visually | checked, clean | checked, clean (red TX/S, single-column log) |
| /finality | checked; rail touched bar → rail gap fix; exact fill re-verified | checked, clean | checked, clean | checked, clean | checked, clean (circles/ladder/track all above bar) |
| /layers | checked, clean (was 35% dim before plus-field fix) | checked, clean | checked, clean | checked, clean | checked, clean |
| /about | checked, clean (horizontal rail) | checked; rail-top false positive traced to heuristic, visually clean | checked, clean | checked, clean | checked, clean (vertical fallback) |

Modals (EXPLAIN/ticker/share): verified fit at 390x844 and 1280x700;
none had an internal-scroll guard (content just happened to fit), all
three now cap at 85-88dvh with overflow-y auto. The DE map annotation
clipped at the svg edge at every size — labels now clamp into the
viewBox. Final state: 70/70 cells structurally clean AND the pixel
audit green (0 failures) on the same build.

## Punted / degraded

- `builder_share`, `client_diversity_cl`, `client_diversity_el`: feature-flagged
  off because every named source is dead, blocked, or stale (see table).
  The meta rows exist, so re-enabling is a source module + `featured=1` away.
- `validators_active`: collected only when `BEACONCHAIN_API_KEY` is set; the
  snapshot builder skips metrics with no rows, so the keyless site simply
  does not rotate it.
- `contracts_deployed`: punted entirely rather than key-gated. A Dune
  integration needs a curated query id and cannot be tested without a key;
  shipping untested parsing code contradicts "write parsers against reality".
  The meta row exists; wiring it up is a normal add-a-metric contribution.
- Node map geography: no reachable live crawler. Country distribution baked
  to a static JSON at build time with a visible "as of" stamp on the page.

## Pass 10b + 11 trade-offs (spec §18)

- **Ring readouts live on arcs now, not in a fan**: the GAS/BLOBS/PARTICIP/
  STAKE cluster was a left-aligned text block fanned at the upper-left of
  the disc. Each readout now rides its own short arc segment at one of the
  four diagonals (45°/135°/225°/315°), radially anchored to the ring it
  describes by a hairline leader ending in a dot ON that ring. Upper labels
  sit on clockwise arcs (glyphs extend outward), lower ones on
  counterclockwise arcs (glyphs extend inward), so all four share one
  306–322 radius band — inside the innermost ring, clear of the glyph
  (widest ±166 units), the numeral band (±~150) and the red arc text
  (radius ≥ ~370). Refs moved from <text> to <textPath>: setting
  textContent on the text element would have destroyed the textPath child.
- **FINAL −2 EPOCHS stays in the safe area by measurement, not geometry**:
  after positioning, the label's rendered box is measured
  (getBoundingClientRect + getScreenCTM) and pulled back inside the
  viewport with an 8px pad — once per slot, so the layout read is free.
  In the top strip (label y < 40 viewBox units) the epoch readout owns the
  line, so the label lifts to y −6, just above it; anchor-juggling there
  was tried first and still collided at slotInEpoch 1. Verified with a
  Date.now-shifted probe: 5 viewports × 6 dial angles (slots 0/2/8/16/24/
  31), every dial text inside the viewport, no readout overlap — a
  boundary-race rule (failures must reproduce on a second frame) matching
  the contrast auditor's.
- **Arc text revolves by group, not by glyph**: the two red arc texts each
  sit in a nested pair of groups — the outer carries a 105s linear CSS
  rotation about the viewBox centre (reusing the ticks-rotate keyframes,
  reversed for the bottom arc), the inner takes the systole's 2.6° inline
  kick (130ms out, 900ms settle back). Split because a CSS animation and
  an inline transform on one element fight; nested they compose. The
  glyphs never leave their textPath radius: the top text rides 402..430,
  the bottom 372..402, so the two counter-rotating lines pass each other
  in adjacent radial bands without collision. Hover pause rides the
  existing disc-hover (animation-play-state via .disc-core:hover); reduced
  motion gets no animation and no kick.
- **One route registry feeds every metadata surface**: src/lib/site.ts
  holds the canonical host, the seven channels' titles ("Ethereum Beat —
  <CHANNEL> · <one-line>"), descriptions and OG basenames. Head tags, OG
  cards, sitemap.xml, llms.txt and audit-meta all import it, so titles
  cannot drift between surfaces. Canonicals always emit the canonical
  host (CANONICAL_HOST var, default ethereumbeat.org) even on workers.dev;
  the 301 redirect is a REDIRECT_TO_CANONICAL="true" flip once DNS lands.
- **theme-color is one meta, scripted**: the theme is a manual toggle, so
  media-scoped theme-color pairs would lie whenever the user overrides the
  OS. The pre-paint theme script also stamps the meta; toggle and
  after-swap keep it in sync.
- **Favicon PNGs are rasterised from the SVG by Playwright**
  (scripts/build-icons.mjs) — no image dependencies added; committed under
  public/icons/ (96/192/512 transparent, apple-touch 180 and maskable 512
  on opaque paper with safe-zone padding).
- **OG cards really do reuse the share renderer**: renderShare moved from
  ShareModal.tsx to src/lib/share-render.ts (framework-free; theme becomes
  a parameter, the timestamp line becomes overridable so build-time cards
  carry the tagline instead of a stale date). scripts/build-og.mjs
  esbuild-bundles the renderer + route registry into a Playwright page
  with the site fonts as data: @font-faces and emits /og/<channel>.png at
  1200x630, committed. Cards render on the paper theme — the print look,
  and the one that survives both light and dark chat chrome. /pulse/*
  shares a generic PULSE card rather than per-metric renders (dozens of
  build artifacts for marginal preview value; a per-metric endpoint can
  come later without changing the head shape).
- **JSON-LD**: WebSite + SoftwareApplication (free, in-browser) emit on
  every route from the layout; /pulse/[metric] adds a Dataset whose
  temporalCoverage is read from D1 (MIN/MAX date), whose licence comes from
  a SOURCE_LICENSES map (growthepie → CC BY 4.0; sources without a
  published data licence fall back to their own URL, i.e. "under the
  source's terms"), and whose distribution points at the open
  /api/metric/[key] endpoint. /about emits its sources as WebPage.citation
  built from the same creditSources registry as the footer, so a new
  source appears in the structured data automatically.
- **llms.txt is an endpoint, not a file**: /llms.txt and /llms-full.txt are
  Astro routes that read metric_meta and the route registry at request
  time (edge-cached 1h like the API), so a new metric or channel appears
  in both automatically — the no-drift requirement implemented as
  generation, not discipline. The full variant lists every stored metric
  with unit, aggregation mode, plain-language definition, source and its
  API URL, grouped by CROPS category.
- **Crawl plumbing**: sitemap.xml is a route (channels from the route
  registry + every /pulse page from metric_meta; /digest/* joins when it
  exists); robots.txt is static and points at the canonical sitemap; the
  RSS autodiscovery link already advertises /feed.xml so feed readers
  find it the day the digest ships.
- **Webmanifest ships complete before any PWA work exists**: name,
  short_name, description, categories (utilities/news/education), the
  icon set including a maskable 512 (20% safe zone), and two committed
  screenshots (1280x720 wide + 390x844 narrow, captured from the live
  build). The future PWA pass only needs a service worker; the install
  metadata is done.
- **audit-meta.mjs is sitemap-driven**: the second permanent QA gate
  discovers its route list from /sitemap.xml rather than a hardcoded
  array, so a new channel or metric page is audited the moment it is
  crawlable. It asserts title uniqueness + pattern, description bounds,
  canonical equality, the full OG/Twitter set (and that the og:image PNG
  actually serves), JSON-LD parse + required types per route, theme-color,
  manifest completeness (maskable icon, two screenshots, assets serve),
  robots→sitemap, and both llms files. First green run: 23 routes.
- **Two local-dev lessons**: miniflare persists the Workers Cache API in
  .wrangler/state across restarts, so an edge-cached sitemap survives a
  dev-server bounce (delete .wrangler/state/v3/cache while the server is
  DOWN to flush); and metrics whose sources are feature-flagged off keep
  their meta rows but hold zero data rows — the sitemap now only lists
  /pulse pages whose dataset is non-empty, which is also what makes the
  audit's temporalCoverage assertion universally valid.
- **The pixel gate caught a pass-10b regression before it shipped**: the
  green PARTICIP readout, moved onto a curved textPath, sampled 3.14:1 at
  390x844 in light — curved micro glyphs dilute harder than the straight
  fan text ever did. Weight 700 recovered only to 4.21. Resolution: the
  readout text is always ink; the >=99% "healthy" state colours the
  participation RING stroke green instead. Both permanent gates
  (audit-contrast: 6,654 nodes, audit-meta: 23 routes) are green on the
  final build of this pass.

## Pass 10c hotfix trade-offs (spec — dial caption)

- **The bottom line is now the numeral's caption, not a ring**: it moved
  off the outer tick ring (R=402) onto a small concentric arc (CAP_R=235,
  inside the 306 mini-stat band) whose apex cups just under the numeral.
  It no longer revolves — pinned centred with a slow ±8° oscillation
  (`.arc-osc`, 16s), paused on hover, static under reduced motion. The top
  category arc keeps its full 105s revolution.
- **The caption is a single concise line**: the staked_eth companion
  ("% of all ETH") is no longer appended — a two-part string overflowed
  the small arc into the numeral and the lower mini-stats. The staked
  share of supply keeps its home on the ever-present STAKE mini-ring, so
  no information is lost. Font dropped to 20 and the arc window to ±46° so
  the longest single line stays within a ~±36° span centred at 6 o'clock,
  clear of BLOBS/PARTICIP (±45°).
- **Caption QA (scratch, 5 viewports)**: bbox overlap between two
  concentric curved arcs is a false positive by construction (their
  axis-aligned rectangles intersect while the glyphs are 71 viewBox units
  apart radially). The meaningful checks are: caption on-screen, clear of
  the axis-aligned numeral, and its computed text length within the arc's
  path length (no clipping). Green for daa/staked/tvs/txcount/throughput
  at 1280x700, 1440x900, 1536x960, 1920x1080, 390x844 (309–326 / 377).
- **Caption is per-metric via metric_meta.caption**: a new nullable column
  overrides the delta line; uptime is the first user
  ("100% UPTIME SINCE 2015", since its daily delta is meaningless).
  `metricCaption()` in lib/format.ts is the single resolver (override →
  else daily/weekly delta → else ''), shared by the home arc, the detail
  page and the share images so all three always agree. buildSnapshot's
  `SELECT *` carries the column into KV for free; a fresh column needs the
  KV snapshot rebuilt on deploy.
- **Migration, not a rewrite**: db/schema.sql's CREATE gains the column for
  fresh installs; existing DBs get db/migrations/001_caption.sql (ALTER +
  the uptime UPDATE), since `CREATE TABLE IF NOT EXISTS` won't add a column
  to an existing table. meta.sql sets the caption with a trailing UPDATE so
  the big INSERT tuples stay untouched.
- **Another edge-cache lesson (local)**: after the schema/caption change the
  home still showed the delta because /api/snapshot was served from the
  persisted Workers Cache (generated_at a day old) AND a hash-only
  navigation never reloads the bundle. Clearing .wrangler/state/v3/cache
  with the server down + deleting the KV key + a full reload fixed it — the
  same miniflare-cache gotcha noted in pass 11.

## Pass 12 trade-offs (spec §19 — detail overlay)

- **The overlay is part of the BEAT island, not a page**: `/pulse/[metric]`
  now renders `<BeatStage initialOverlay=…>` — the same dial as home, with
  the detail opened over it. So the dial genuinely keeps beating underneath
  (through the 95%-paper `color-mix` backdrop) and the margin frame /
  command bar (z-20 / z-30) stay above the overlay (z-16). The Astro head
  (title, description, canonical, OG, Dataset JSON-LD) is untouched and
  fully server-rendered, so deep links, SEO and social cards keep working;
  only the visible body moved into the client island.
- **Open is pushState + an optional morph; close is history-aware**: opening
  from BEAT pushes `/pulse/<key>` and (when View Transitions exist and
  motion is allowed) morphs the dial's active numeral into the overlay's
  via a shared `view-transition-name: kpi-morph`. The source name is set
  imperatively, then removed inside the transition callback with
  `flushSync(doOpen)` so the new snapshot has exactly one named element —
  duplicate names would throw. `popstate` is the source of truth: browser
  back/forward drives the overlay. Close pops history when we pushed, else
  (direct entry) does a real `navigate('/')`.
- **The overlay owns the keyboard, with modal precedence**: a capture-phase
  handler runs ←/→ (cycle featured metrics via replaceState + a scramble
  crossfade), D/W/M/Q/Y (chart range), X (share) and Esc (close), and
  `stopImmediatePropagation`s so the dial's own handlers stay quiet; the
  dial's keydown early-returns while the overlay is open. When a nested
  modal (CROPS / EXPLAIN / share / the manual) is up, the overlay stands
  down (a visible-dialog count check) so Esc closes the innermost thing
  first. Note for future QA: dispatching a synthetic key on `window`
  bypasses capture-phase precedence (all window listeners fire in
  registration order) — tests must dispatch on `document.body` to mirror
  real propagation.
- **Rotation pauses while the overlay is open** so the dial underneath does
  not change behind the detail; an effect also holds the dial on the
  overlay's metric so the morph source is correct and closing reveals the
  same number.
- **PulseChart became controlled + seedable**: range is a prop (the overlay
  drives it), the cache resets per metric on cycle, and the direct-load
  metric seeds its month series so the chart never flashes. Restyled to the
  instrument grammar: hatched `<pattern>` area fill, dashed grid on
  `--line-data` (>=3:1), an in-SVG readout callout with a red elbow leader
  from the scrub cursor, command-bar chip ranges, and red reserved for the
  scrub cursor + the single latest-point dot.
- **The inline node map left the detail**: resilience metrics no longer
  embed NodeMap in the overlay (the NODES channel is its home); keeps the
  overlay a single-focus instrument.
- **`client:load` also SSRs the island**, so `PulseOverlay` guarded its one
  render-time `location` read (`typeof window`) — otherwise the pulse route
  threw during SSR and returned an empty body.
- **QA**: contrast audit green (0/6774) and meta audit green (23 routes) on
  the final build; the contrast matrix still covers the seven channels (the
  overlay only exists on `/pulse`, so it is verified manually instead) —
  overlay checked in both themes at 1280x700/1440x900/1536x960/1920x1080/
  390x844, mobile full-screen, and reduced motion (no view transition,
  instant open, no swap animation, dial rotation held).

## Pass 13c trade-offs (spec §22 — CR·O·P·S grouping)

- **CROPS is four properties, CR is a digraph**: the authoritative mapping
  is CR (Censorship Resistance) · O (Open source & free) · P (Privacy) ·
  S (Security), wording from the EF mandate section III. There is no
  standalone R and no "resilience" category anywhere. CropsBadge renders
  [CR] as one two-letter box (whitespace-nowrap, `min-w` + padding, tight
  tracking) — one target, one modal. Heartbeat is explicitly NOT a CROPS
  property, so heartbeat metrics (uptime, finality, sync participation)
  carry no badge; they keep the HEARTBEAT framing and the
  "100% UPTIME SINCE 2015" values beat.
- **The wordmark keeps five glyphs**: CropsWordmark shows C R O P S but
  binds C+R with tighter tracking and a hairline red underline, so the eye
  reads CR · O · P · S — four groups. First appearance (/about) carries the
  gloss "CROPS — four properties: Censorship Resistance, Open source,
  Privacy, Security."
- **Where each former R/Resilience metric landed** (rationale in meta.sql +
  db/migrations/002_crops.sql):
  - `client_diversity_cl`, `client_diversity_el` → **O (openness)** — a
    diverse set of independent, open-source clients is open-source evidence.
  - `node_countries` → **CR (censorship-resistance)** — geographic node
    distribution means no single jurisdiction can censor or switch it off.
  - The old combined `privacy-security` bucket (`stables_supply`,
    `rwa_value`, `tvs`) → **S (security)** — value held safely, things
    doing what they claim. No metric today measures **P (Privacy)**; the
    property still exists as a badge and on /about.
- **Category keys**: `resilience` retired; `privacy-security` → `security`;
  `openness` kept as the O bucket (relabelled "Open source & free"). Order
  is heartbeat · censorship-resistance · openness · privacy · security, so
  categoryIndex reads _01.._05 with the four CROPS after the heartbeat.
- **Rationale lives in meta.sql, not a new column**: "one-line rationale in
  metric_meta" is honoured as inline comments in the seed + this log rather
  than a `rationale` column nothing reads — no schema churn.
- **Swept**: badges, /about panel + wordmark, CH1 values beats, llms.txt
  (new Properties section + label-mapped metric groups), JSON-LD keywords,
  and the BEAT/app meta descriptions all say CR·O·P·S = four. Grep for
  "resilience", "privacy-security", "five/fifth propert" across shipping
  code returns nothing. Existing DBs migrate via 002_crops.sql (+ KV
  snapshot delete on deploy).
- **QA**: audit-meta green (23 routes), audit-contrast green; verified the
  /about wordmark + four badges and the CR badge / no-heartbeat-badge in
  the overlay, both themes.

## Pass 14 trade-offs (spec §23 — section headers)

- **One shared component**: SectionHeader.tsx (large grotesk index numeral +
  two-line lowercase grotesk block) replaces every tracked-out uppercase
  "_NN NAME" eyebrow and every "TITLE // TYPE" modal header. It renders
  server-side in Astro pages and inside React islands alike, so all
  locations restyle from the one change.
- **Grotesk = Inter (vendored OFL), not Archivo/Space Grotesk**: the spec
  named those two, but adding an unvetted binary was avoided — Inter is an
  OFL grotesk already committed with its licence and wired as a @font-face.
  `--font-grotesk` now points at Inter (was aliased to the pixel font) and
  Inter is preloaded. Swapping to a different face is a one-line token
  change. Pixel (Departure) is now reserved for live data (KPI numerals,
  the big background channel glyph); the human voice is grotesk lowercase.
- **Every converted location** (verified rendering the new lockup):
  - /about — five section headers (01 the idea … 05 colophon) + the docked
    channel identity (A about).
  - Pulse overlay (reached from CH1 BEAT) — header lockup (index = category
    number, title = category, subtitle "pulse detail").
  - CH1 BEAT values beat — the "∞ values" card eyebrow.
  - Modals: EXPLAIN (index "?"), values/CROPS (index = the CROPS letter,
    so CR/O/P/S anchor their own modal), share (index "↗"), ticker (index
    "~"). Each subtitle names the modal kind.
  - CH2 NODES / CH3 BLOBS / CH4 FLOW / CH5 FINALITY / CH6 LAYERS — the
    docked channel identity (`.channel-dock`, small variant) replaces the
    old pixel `.channel-id` watermark.
- **Deliberately NOT converted** (out of scope for a *section-header* pass;
  noted to avoid confusion): the disc's circular ArcText category label (a
  bespoke pass-9/10c signature on a curve, not an eyebrow), the KPI numeral
  and its metric label on the dial (live-data instrument readouts), and the
  pervasive `.micro` module captions/stat-labels inside channels. The type
  rule is documented in SPEC as the governing direction; this pass migrates
  the section/eyebrow headers, which is its stated scope.
- **Channel dock clears the margin rail**: `.channel-dock` sits bottom-left
  above the command bar; at lg+ (where the vertical left ticker rail
  appears) it shifts to left 2.75rem so the numeral never collides with the
  rail. Kept `pointer-events:none` + aria-hidden (the channel name is also
  in the <title> and command bar), so it neither blocks clicks nor doubles
  up for screen readers.
- **CR digraph unaffected**: the values/CROPS badge still renders CR as one
  two-letter unit; the header lockup uses that same letter as its index, so
  the CR pair stays intact.
- **QA**: audit-contrast green (0/6672) and audit-meta green (23 routes);
  header lockup verified in both themes at the five viewports, stacking
  cleanly on mobile with no bad wraps.

## Community + metadata files pass (2026-07-20)

Precondition confirmed before starting: CROPS is CR·O·P·S = four properties,
uptime framed as mission not property (pass 13c) — no five-property or
`resilience`-as-category model anywhere in shipping code.

### File placement

- **Community health (repo root)**: `CONTRIBUTING.md` (provided; replaces the
  older stub), `CODE_OF_CONDUCT.md` (provided), `SECURITY.md` (provided).
  `LICENSE` already present and correct (MIT, 2026, "Ethereum Beat
  contributors") — not regenerated.
- **`.github/`**: `ISSUE_TEMPLATE/bug_report.md` (route/theme/viewport/reduced-
  motion fields), `ISSUE_TEMPLATE/metric_request.md` (CROPS category picker +
  source/licence), `ISSUE_TEMPLATE/config.yml` (blank issues off; security →
  `mailto:security@ethereumbeat.org` per SECURITY.md, not a public issue),
  `pull_request_template.md` (checklist mirrors the CONTRIBUTING quality
  gates: build, both audits, both themes, reduced motion, type rule),
  `profile/avatar.svg` (for later org use).
- **Avatar**: `public/avatar.svg` (the dark-disc variant — self-contained, so
  it reads on both GitHub themes) plus `public/avatar-dark.svg` and
  `public/avatar-light.svg`. README references `./public/avatar.svg`.
- **Icons** (regenerated by `scripts/build-icons.mjs` from the simplified
  favicon mark, not the avatar): `public/favicon.svg`, `public/favicon-64.png`,
  `public/apple-touch-icon.png` (180, root), `public/icons/icon-192.png`,
  `icon-512.png`, `icon-maskable-512.png` (20% safe-zone). Old names
  (`favicon-96`, `/icons/apple-touch-icon`, `icon-512-maskable`) removed;
  Layout + manifest rewired.
- **Screenshots**: `public/screenshots/desktop.png` (1280×800) +
  `mobile.png` (390×844), recaptured from live.

### Head / metadata / JSON-LD / PWA — already implemented, verified

The route-metadata registry (`src/lib/site.ts`), generated per-route and
`/pulse/{metric}` titles/descriptions, canonical-host config (`CANONICAL_HOST`
emitting org even on workers.dev), OG + Twitter tags, site-wide WebSite +
SoftwareApplication JSON-LD, per-metric Dataset JSON-LD (licence URL +
`temporalCoverage` + distribution → `/api/metric`), `manifest`, `sitemap.xml`,
`robots.txt` (allow-all, sitemap referenced, no AI-crawler blocks), and
generated `/llms.txt` + `/llms-full.txt` were all built in passes 11–13c and
re-verified here. This pass added: `color-scheme: light dark` meta; per-metric
CROPS category + source licence in `/llms-full.txt`.

### Deliberate deviations from the brief (flagged)

- **`README.md`, `metadata-reference.md`, and a static `llms.txt` were NOT in
  the working dir and not pasted.** Rather than fabricate "provided" content,
  the existing repo README was kept (and corrected: dropped the stale
  "resilience", added the four-property CROPS line, avatar, badges, community
  links, fixed a stale font mention), and the already-generated `/llms.txt` +
  `/llms-full.txt` (CROPS-correct, from `metric_meta`) were kept as the source
  of truth. If different provided versions exist, paste them and they'll drop in.
- **theme-color stays a single scripted meta**, not two media-scoped entries.
  The site has a manual INK/BONE toggle; static media pairs lie when a user
  overrides system preference (documented decision, pass 11). The pre-paint
  script sets theme-color to the actually-resolved theme, which is more correct.
  `color-scheme: light dark` was added alongside.
- **Icons use the simplified favicon mark at every size**, not the avatar, to
  avoid the circular-clip/transparent-corner problem on maskable and keep one
  reproducible generator. The richer avatar is available at `/public/avatar.svg`
  if a future pass wants it as the app icon.
- **`.github` contact/URLs**: security uses the stable `mailto:`; no guessed
  org repo URL is hardcoded (the final GitHub home is not set yet).

Not pushed; clean local commits on `main`. No GitHub repo/remote created.

## CI first-run robustness (2026-07-20)

The two QA gates need a running worker + a browser, so CI can't just lint.
Choices, so it passes reliably on a fresh PR:

- **gitleaks via the binary, not `gitleaks-action`.** The Action requires a
  paid licence key for *organisation* repos (this repo lives under the
  `ethereumbeat` org), which would fail CI with no way around it on a fork.
  The workflow downloads the pinned gitleaks binary and runs
  `gitleaks dir . --exit-code 1` (blocking).
- **Preview server = `wrangler dev`, not `astro preview`.** The Cloudflare
  adapter builds a Worker, so `astro preview` is unsupported and a static
  serve of `dist/` wouldn't run the API routes the audits check
  (`/api/snapshot`, `/api/metric`, sitemap, llms). `wrangler dev` runs the
  built worker with a local D1/KV.
- **Hermetic data via `db/ci-seed.sql`.** Seeding real data (`npm run seed`)
  would make CI depend on external APIs (growthepie et al.) — slow and flaky,
  red for reasons unrelated to the PR. Instead CI applies `schema.sql` +
  `meta.sql` + a synthetic recursive-CTE seed (~420 daily points per metric),
  so every channel and every `/pulse/*` route renders like production with no
  network. audit-meta then covers all 31 routes; audit-contrast covers all
  channels/themes/viewports.
- **Readiness poll, not a fixed sleep.** The workflow polls
  `/api/snapshot` (200 ⇒ worker up *and* D1 seeded) for up to 90s, and tears
  the server down in an `if: always()` step.
- **`--ci` flag on audit-contrast** launches Chromium with
  `--no-sandbox --disable-dev-shm-usage` for restricted runners; Playwright's
  bundled Chromium (installed with `--with-deps`) is used either way. Headless
  in CI is practical, so no separate build-output path was needed.

Validated locally by replaying the exact CI sequence against an isolated
`--persist-to` D1: audit-meta green (31 routes), audit-contrast `--ci` zero
failures.

## Type rule restated (2026-07-21 — CROPS letters + sweep)

**Pixel (Departure Mono) = LIVE DATA only.** KPI numerals, per-block / stat
numbers, countdowns, and the giant background channel-glyph watermark.

**Grotesk (Inter) = every human label and header.** Section headers,
eyebrows, category names, the **CROPS letters**, and all /about copy and
headlines.

Changes this pass:
- The CR·O·P·S letters (the `CropsWordmark` row and the four /about badge
  boxes) moved from Departure to grotesk heavy — they are labels, not data.
  The CR digraph stays bound as one unit (tighter tracking + a red underline
  under CR only) so the eye still reads four groups: CR · O · P · S.
- /about panel headlines ("A HEARTBEAT, NOT A TICKER", etc.) moved from
  Departure to grotesk heavy, so the docs page carries no pixel type.
- Added a `.font-grotesk` utility so labels can opt into the grotesk voice
  without inline font-family.

**Documented pixel exceptions on the live BEAT dial** (the instrument's own
display voice — deliberately NOT converted here):
- The disc **ArcText** (category + caption on the ring) stays Departure:
  pass 10 §17.5 switched it to the pixel face specifically for legibility on
  the curve, and it is audited that way.
- The **KPI metric label** and the **values-beat / pulse-overlay principle
  statements** stay Departure as the dial's terminal display type (pass 14).

Extending "pixel = numbers only" to the live dial itself would reverse those
audited/documented decisions and is a larger change than this type pass —
flagged for a follow-up if wanted, not done here. Both QA gates green after
the change (audit-contrast 0 failures; audit-meta 31 routes).

## Two pre-launch bug fixes (2026-07-21)

### Unknown-metric 404 (was: bare white page)
Direct navigation to `/pulse/{unknown-key}` previously returned
`new Response('Unknown metric', { status: 404 })` — a correct status but an
unstyled text page outside the site's grammar. Now `src/pages/pulse/[metric].astro`
sets `Astro.response.status = 404` on an unmatched key and renders the 404 in
the instrument's own language: the layout's margin frame + command bar, a
`404 / metric not found / no such series in the registry` SectionHeader lockup,
a message naming the bad `/pulse/{key}` path, and ESC · back-to-beat / about
affordances (ESC key wired to navigate home). Title + canonical stay sensible
on the 404. All metric-dependent DB work is guarded behind the `metric_meta`
lookup, so a valid key still renders 200. `sitemap.xml` already emits registry
keys only, so the site never links to its own 404. Verified: `/pulse/txcount`
→ 404 (styled), `/pulse/txcount_combined` → 200.

### Docked section-header collision (all channels)
The `.channel-dock` "NN name / descriptor" lockup is `position: fixed`
bottom-left. `overflow-hidden` on a channel `main` clips at the *viewport*
edge, not at the padding edge, so tall channel content (worst: the /nodes
consensus-/execution-client tables) rendered underneath the dock. Fix:
- a shared `.channel-body` reserve — `padding-bottom: calc(8rem +
  env(safe-area-inset-bottom, 0px))` — replaces the old fixed `pb-28` on every
  channel `main`, so the reserved band also clears the mobile safe area.
- the clipping/scrolling boundary is now an inner element whose box ends at
  that reserve: /nodes scrolls its map+tables in an `overflow-y-auto` wrapper
  (no data hidden), and /flow + /finality gained `overflow-hidden` to match
  /blobs + /layers.
Measured with `elementFromPoint` sampling across the dock band (respects
clipping + the dock's `pointer-events: none`): zero visible collisions on
nodes / blobs / flow / finality / layers at 1280×700, 1440×900, 1920×1080 and
390×844. Both QA gates green (audit-contrast 0 failures; audit-meta 31 routes).

## Automated deploy: CI/deploy split (2026-07-21)

Merging to `main` now ships to production through a gated pipeline, kept
separate from PR validation so nothing deploys on a red audit.

- **`ci.yml` = validation only, never deploys.** Runs on every PR (and a
  re-check on `main` push): gitleaks + the shared build/audit gate. This is
  what branch protection requires to pass before merge.
- **`deploy.yml` = the only thing that ships, only from `main`.** Trigger:
  push to `main` (i.e. after a merge) plus `workflow_dispatch` for a manual
  re-deploy. Uses a GitHub Environment named `production`, so a reviewer
  approval can be required later with a single repo setting, no workflow
  change.
- **One source of truth for the audits.** The build + both QA gates live in a
  composite action, `.github/actions/build-and-audit`, used by both workflows.
  Copy-pasting the seed/serve/audit dance into two files would let them drift;
  the composite can't. `deploy.yml` re-runs it as a hard pre-deploy check
  (belt & braces) — production never ships if contrast or metadata regressed.
- **Real ids never touch a tracked file.** The committed `wrangler.toml` keeps
  its `REPLACE_WITH_YOUR_*` D1/KV placeholders (this repo is public). At deploy
  time `deploy.yml` `sed`s the real values from `secrets.CF_D1_DATABASE_ID` /
  `secrets.CF_KV_NAMESPACE_ID` into a throwaway `wrangler.ci.toml` (git-ignored
  via `*.ci.toml`) and deploys with `wrangler deploy -c wrangler.ci.toml`. The
  job asserts the tracked `wrangler.toml` was not modified, that
  `wrangler.ci.toml` is untracked, and that no placeholder survived (an empty
  secret fails the run instead of shipping a broken id).
- **Deploy auth via secrets.** `cloudflare/wrangler-action@v3` with
  `secrets.CLOUDFLARE_API_TOKEN` + `secrets.CLOUDFLARE_ACCOUNT_ID`. The four
  secrets (two ids + token + account) live only in GitHub Actions secrets and
  on the maintainer's machine — never in the repo.
- **The daily cron ships with the Worker.** `[triggers] crons = ["0 6 * * *"]`
  is copied verbatim into the generated config, so the collector deploys with
  the Worker; there is no separate scheduler step.
- **Post-deploy smoke test (blocking).** After deploy, `deploy.yml` retries
  `GET /` (200), `/pulse/txcount_combined` (200), `/pulse/txcount` (404 — guards
  the unknown-metric fix from regressing), and `/api/snapshot` (200 + valid
  JSON). A failure fails the run.
- **Concurrency guard.** `concurrency: production-deploy` with
  `cancel-in-progress: false` so two merges can't deploy on top of each other.

## Security hardening pass (2026-08-01, post public review)

### 1. Security headers + CSP (in the Worker, not _headers)

- Every page is server-rendered (`prerender = false`), so `public/_headers`
  (which only applies to static assets) cannot cover HTML. Baseline headers are
  stamped in `worker/index.ts` on every `text/html` response; JSON `/api/*`
  responses keep their intentionally-open CORS untouched.
- Headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a CSP that also
  sets `frame-ancestors 'none'`.
- **Script CSP is a per-request nonce + `'strict-dynamic'`, not hashes and not
  `unsafe-inline`.** Astro's ClientRouter (view transitions) re-executes inline
  scripts on soft navigation *and* injects a runtime `data:application/javascript,`
  script-ordering sentinel. A hash/allowlist policy blocks that sentinel unless
  `data:` is opened up (an XSS hole), and a bare nonce doesn't survive a
  navigation. `strict-dynamic` trusts the nonce'd scripts in each response and
  anything they inject afterwards, with no host/scheme widening. HTMLRewriter
  stamps the nonce onto every `<script>`; HTML carries no `Cache-Control` (not
  edge-cached), so per-request nonces stay fresh. (`'self'` is kept as a legacy
  fallback for engines without `strict-dynamic`.)
- `style-src 'self' 'unsafe-inline'` — inline `style=` attributes (React style
  props, Astro `style=`) and view-transition styles are pervasive and low-risk.
  `img-src 'self' data:` (data: SVG textures + OG). `font-src 'self'`.
- **`connect-src` is exactly the browser's hosts**: the three RPCs
  (publicnode / dRPC / 1RPC), the PublicNode beacon API, and the two mempool
  WSS endpoints. growthepie / DefiLlama / ultrasound / ethernodes are fetched
  *server-side* by the collector and reach the client only via same-origin
  `/api/*`, so they are deliberately absent.
- New permanent gate `scripts/audit-csp.mjs` (wired into the shared
  `build-and-audit` action, so both CI and the deploy gate run it): asserts the
  CSP shape (nonce + strict-dynamic, no `unsafe-*`), the baseline headers, the
  `connect-src` hosts, and that every `<script>` in each route carries the
  response nonce — so a script slipping through un-nonced fails the build
  instead of silently breaking in production. It caught a real gap on the first
  run: the `/pulse` 404 page's inline ESC-handler.
- Verified in-browser (Playwright): **zero CSP violations and zero console
  errors** on a fresh `/flow` load (WSS + RPC + hydration) and across a full
  soft-navigation round trip of all six channels; theme and hydration stayed
  intact. The metadata audit's JSON-LD regex was too strict for the new
  `nonce` attribute and was made attribute-tolerant.

### 2. Seed inserts parameterised (scripts/seed.ts)

- `wrangler d1 execute` has **no parameter binding** (only `--command` / `--file`
  raw SQL), and remote seeding depends on it, so genuine bound statements are
  not reachable through the seed's execution path. The security-equivalent:
  every downloaded field is serialised through strict, type-checked encoders
  (`sqlText` / `sqlNumber`) with shape guards (`metric_key` `^[A-Za-z0-9_]+$`,
  `date` `^\d{4}-\d{2}-\d{2}$`, `value` finite) — no source value can break out
  of its SQL literal. Verified: the seed still runs against real downloaded data
  and is idempotent (26,694 rows, unchanged across two runs).

### 3. CI supply chain

- All external GitHub Actions are pinned to commit SHAs (with `# vN` comments):
  `actions/checkout`, `actions/setup-node`, `cloudflare/wrangler-action`. The
  local composite action needs no pin.
- gitleaks: the version is pinned (8.30.1) and the tarball is **SHA256-verified**
  (`sha256sum -c`) before the binary is extracted or executed.

### 4. Dependency audit

- `npm audit`: 8 advisories, all **transitive via the build/dev toolchain**
  (astro / @astrojs/cloudflare → wrangler / miniflare / undici / ws / esbuild /
  sharp) — none in the deployed Worker runtime bundle.
- **Fixed the one non-breaking advisory**: `fast-uri` 3.1.3 → 3.1.5 (dev-only,
  reached via `@astrojs/check` → ajv). Lockfile-only; `package.json` unchanged.
- **Deferred (need major bumps, not forced)**:
  - `astro` 5 → 7.1.6 — define:vars XSS + server-island replay; also pulls the
    `sharp` (libvips CVEs) and `esbuild` dev-server fixes.
  - `@astrojs/cloudflare` 12 → 14.1.7 — image-binding SSRF; pulls the
    `miniflare` / `undici` / `ws` / `wrangler` fixes.
  Both are breaking framework/adapter upgrades — deliberate, out of scope for a
  hardening pass. Runtime exposure is limited: undici/ws live inside
  wrangler/miniflare (dev + build tooling), which do not ship to the Cloudflare
  Worker runtime.
## 24. Pass 15 — personality

Four independent features, one PR each. Sub-entries added per PR.

### Item 2 — stablecoins off the homepage

- **`stables_supply` unfeatured from the BEAT rotation** (`featured` 1→0 in
  `db/meta.sql`, plus `db/migrations/003_unfeature_stables.sql` for existing
  DBs; KV snapshot rebuild on deploy, same as every prior featured change).
  The metric, the `/api/metric/stables_supply` endpoint and the
  `/pulse/stables_supply` detail page are all untouched — only the home
  feature flag changes, so sitemap/OG/JSON-LD need no edits.
- **Rationale**: stablecoin supply is a financial/economic figure, off-tone
  for a protocol-vitals beat that avoids money-market framing. It belongs in
  the onchain-economy channel, so it moves to CH6 LAYERS as a dedicated panel
  (headline `$` value in red + a small monthly trend line) sitting beside the
  VALUE SECURED block, both part of the "onchain economy" cluster. Follows the
  pass-9 precedent that moved L2 metrics off the home carousel to keep it a
  protocol-vitals instrument.
- **No new endpoint**: the panel reuses `/api/metric/stables_supply?range=m`
  (already edge-cached), so no collector or API change. It lives in the
  `lg:flex` side column with the other economy widgets (desktop parity with
  CombinedChart / VALUE SECURED).
### Item 1 — videogame nav overlay (d-pad)

- **A persistent d-pad in the instrument grammar** (`src/components/DPad.astro`),
  corner-docked bottom-right above the command bar. Four arrow keycaps in a
  cross: up/down cycle CHANNEL, left/right cycle METRIC. It is genuine UI, so
  its behaviour lives in the layout's one persistent controller (no per-page
  re-bind) and it is `transition:persist`ed across channel switches.
- **One input path, keyboard-truthful**: the keycaps are real `<button>`s that
  dispatch the matching `ArrowUp/Down/Left/Right` `KeyboardEvent` on `window` —
  the exact pattern the command-bar chips already use — so pointer, touch and
  keyboard share one code path (BeatStage handles ←/→, the layout handles
  ↑/↓ = channel). Every real arrow key press also lights the matching keycap
  (`flashDpad`), so keys the user presses on the physical keyboard are mirrored
  on the on-screen control.
- **Left/right dim off BEAT** (`.dpad-metric-off`, toggled by `syncDpad` on load
  + `astro:after-swap`): metric cycling only exists on BEAT, so off-channel the
  pair goes dashed + faded + `pointer-events:none`, matching how the command
  bar dims its home-only actions.
- **Teaching pulse**: one scale pulse on `astro:page-load` (fires on the initial
  load and after every soft nav) so the control announces itself each view.
- **Reduced motion keeps the control, drops only motion**: the pulse and press
  keyframes are gated behind `prefers-reduced-motion: no-preference`; the
  pressed state still lands as a static accent highlight, and the dim/active
  states are unaffected — it stays because it is UI, not decoration.
- **Mobile = swipe affordance hint**: under 640px the cross shrinks and the
  METRIC/CHANNEL legend is replaced by a "SWIPE TO NAVIGATE" line (the keycaps
  remain tappable as touch controls).
- **No contrast surface added**: the arrow glyphs and the legend are
  `aria-hidden` (the buttons carry full `aria-label`s and the actions are also
  in the command bar + manual overlay), so the pixel audit skips the d-pad by
  construction — it introduces no new auditable text nodes.
- **Placement**: `right: 0.75rem` on mobile, `right: 3rem` at lg+ to clear the
  vertical right ticker rail; `z-index: 25` (below the command bar's 30) and
  `pointer-events:none` on the container so only the keycaps hit-test.
### Item 4 — draggable command bar

- **Grab the background, not the chips.** A `pointerdown` on `#command-bar`
  starts a drag only when the target is the bar background or the `⠿` handle —
  never a chip or the wordmark link — so all chip clicks keep working. The
  drag lives in the layout's persistent controller (survives channel switches);
  the bar re-applies its dock on `astro:after-swap`.
- **Ghost-preview snap model.** While dragging, a dashed-accent ghost
  (`#cmd-ghost`) previews the target zone; the bar itself doesn't follow the
  pointer (simpler + robust). Release near the LEFT / RIGHT / TOP edge docks it
  there; release in the CENTRE region makes it a floating palette at the drop
  point. Zones are the outer `min(150px, 18vw)` band of each edge, centre
  otherwise.
- **Five dock modes, pure token/class geometry** (`cmd-dock-{top,left,right,
  float}`; bottom is the default, no class): TOP is the same row pinned up;
  LEFT/RIGHT are a scrollable vertical column (chips stack, the action labels
  shorten to their key glyphs, separators become horizontal rules); FLOAT is a
  compact wrapped palette window with a centred drag handle and a
  corner-bracket frame, positioned via `--cmd-x/--cmd-y`.
- **Persistence + reset.** Dock (and float x/y) persist in `localStorage`;
  double-clicking the handle resets to the bottom and clears the float
  position.
- **Content is never covered.** The `.channel-body` reserve adapts to the
  active dock side via `html[data-dock=…]` (top → top padding, left/right → side
  padding; float keeps the bottom reserve since the user placed it); the docked
  channel identity shifts clear of a left bar. Verified at the QA viewports in
  all four dock positions (+ float) on the channel pages.
- **Keyboard unaffected.** Docking only moves the bar; every key handler is
  independent of position, so shortcuts work identically in every dock. The
  handle is a pointer-only affordance with no keyboard equivalent needed (all
  actions are already keyed), so it is `aria-hidden` — which also keeps its
  faint `⠿` glyph out of the contrast audit.
- **Mobile: fixed bottom.** Dragging is gated behind `pointer: coarse`
  (dragging disabled) and `restoreDock` forces `bottom` on coarse pointers, so
  a dock saved on desktop never applies on a phone.
- **Reduced motion.** The dock position transition is gated behind
  `prefers-reduced-motion: no-preference`; under reduce, snapping is instant
  and the ghost has no animation.
### Item 3 — theme system: seven themes, +/- to cycle

- **Seven themes, pure token overrides.** 01 INK (`:root`) and 02 BONE
  (`[data-theme=dark]`) are unchanged. The five new themes (SWISS, TERMINAL,
  FLUFFY, SKETCH, SPLIT-FLAP) are each a `[data-theme=…]` block in tokens.css
  overriding palette, fonts, texture intensities, radii and motion only —
  layout and information are identical across all seven (verified: the audit
  samples the same routes/nodes in every theme).
- **Cycling + persistence.** `THEME_ORDER` drives `+`/`=` (forward) and `-`
  (back); `T` still toggles the first two (INK/BONE). Choice persists in
  `localStorage` and is applied pre-paint (extended the existing inline script
  with a `THEME_COLORS` map so `theme-color` matches each theme's `--paper`).
  On switch the theme name flashes as an OSD ("THEME 04 — TERMINAL", reusing
  the channel-OSD element via a shared `flashOsd`) and the command-bar chip
  updates (`[data-theme-name]`, synced on switch + `astro:page-load`). Keys
  documented in the manual overlay.
- **Fonts (all SIL OFL, self-hosted woff2 + licence files in public/fonts/).**
  SWISS reuses vendored Inter (its numerals become heavy grotesk tabular — the
  pixel face is retired there). TERMINAL reuses vendored JetBrains Mono for
  everything (a legible phosphor mono; the spec named IBM Plex/Fira Mono, but
  a vendored OFL mono avoids an unvetted binary — same precedent as pass 14's
  Inter-for-Archivo). Four new faces were fetched from Google Fonts (latin
  woff2 + OFL.txt): **Fredoka** (FLUFFY labels), **Caveat** (SKETCH
  handwritten labels/headers), **Cutive Mono** (SKETCH typewriter numerals —
  an OFL typewriter face; the spec's "Special Elite" is Apache-licensed, so
  Cutive Mono substitutes to honour the OFL-only rule), **Oswald** (SPLIT-FLAP
  condensed board face).
- **`--font-num` split (new token).** The big KPI numerals read from
  `--font-num` (defaults to `--font-display`) so a theme can give *data* a
  distinct voice from the small dial/arc labels. Only SKETCH uses it: numerals
  are Cutive Mono (typewriter) while the tiny dial readouts, tickers and map
  text stay in legible Martian — a thin typewriter face at 10-12px dilutes
  below AA on pixel sampling, so it is reserved for the large numerals.
- **Textures per theme** (theme-scoped `display:none` on the texture classes,
  which overrides their inline Tailwind opacity): SWISS off entirely (perfect
  grid); FLUFFY/SKETCH/SPLIT-FLAP drop the CRT/dither/hex/scanline grunge
  (SKETCH adds a faint paper-fibre body texture instead); TERMINAL turns the
  CRT scanline up and adds a phosphor text glow + a square cursor-block live
  dot.
- **Signature treatments.** FLUFFY: `--radius` token turned up (rounded chips/
  panels), soft shadow, a candy gradient used *only* on decorative elements
  (the live dot, disc drop-shadow) so AA is never at risk, and sparkle debris
  (tokenised `--debris-color`/`--debris-radius`). SKETCH: a cheap SVG
  displacement filter (`#sketch-wobble`) applied to svg **strokes only** (path/
  polyline/line — never `<text>`, so numerals/labels stay crisp and charts keep
  exact geometry). SPLIT-FLAP: data numerals rendered as departure-board cells
  (dark tile, amber lettering, a horizontal midline) via `[data-kpi-number]`.
- **A `.invert` / Tailwind collision found by the audit.** The project's custom
  `.invert` (swap bg/text tokens) shares its class name with Tailwind's
  `invert` filter utility (`filter: invert(100%)`), which silently inverted
  every inverted panel. Harmless in the other palettes, but on TERMINAL's green
  field it flipped panels to a low-contrast magenta — the audit caught it as
  light-on-magenta failures. Fixed narrowly with `[data-theme=terminal]
  .invert { filter: none }` (the token swap already gives the intended look);
  the pre-existing filter behaviour in the other themes is left untouched.
- **Semantic colours keep meaning in every palette**, re-tuned: `--accent`
  (live/active/alert), `--ok` (confirmed — green, brighter phosphor in
  TERMINAL), `--warn` (pending — amber, doubling as SPLIT-FLAP's board
  lettering). No theme repurposes them.
- **Audit across ALL SEVEN themes.** `audit-contrast.mjs` now iterates the
  seven; INK/BONE keep the full five viewports, the five new themes run a
  trimmed three (1280×700, 1536×960, 390×844) to keep CI time reasonable — the
  spec permits this trim. A `--only <themes>` flag was added for local
  iteration. First 7-theme run surfaced 571 failures (563 SKETCH from the thin
  faces, 8 TERMINAL); after the `--font-num` split, brighter phosphor green,
  the `.invert` fix and a legible-mono suffix rule, the full matrix is green.
- **Contact sheet.** `scripts/build-themes-contact-sheet.mjs` screenshots all
  seven themes on `/` and `/layers` and composes a single labelled PNG for
  review (the output is git-ignored — 4MB — and reproduced on demand).

- **CI-rendering hardening (post first CI run).** The first CI run of the
  7-theme audit failed 21 where the local macOS run was green: CI's Linux
  Chromium renders fonts thinner, so palette values tuned to ~5:1 sampled
  below 4.5 there. A `--strict [margin]` flag was added to audit-contrast to
  surface these locally (raises the threshold as a CI proxy). Fixes: FLUFFY
  `--ok`/`--warn` deepened (the 5:1 green/amber failed) and `--accent` taken to
  ~6.6:1; SKETCH `--ink` dropped to near-black graphite (thin hand/typewriter
  cores dilute hardest) with `--accent` ~6.8:1; SWISS SVG `<text>` set to
  weight 700 (proportional Inter thinned on small/curved dial + map labels).
  TERMINAL and SPLIT-FLAP passed CI unchanged. Re-verified with `--strict 0.4`
  (a CI-safety margin) green on all five new themes.

- **CI hardening, round 2 (macOS renders heavier than CI's Linux).** The first
  hardening pass fixed swiss/terminal/splitflap but CI still failed FLUFFY (9)
  and SKETCH (4) where the local macOS audit was green even at a +1.0 strict
  margin — the platform font-rendering gap is largest for the light themes with
  non-pure-black ink (fluffy plum, sketch graphite), whose thin small text
  dilutes on Linux. A CI diagnostic step (`cat audit-report.md` on failure) gave
  the exact rows: node-map/dial `<text>` labels and the share button's `⇪`
  `<kbd>`. Fixes: bold `<text>` and `<kbd>` in swiss/fluffy/sketch (densifies
  thin glyph cores — the same fix that cleared swiss), plus a size lift on the
  `⇪` share glyph (a symbol has no weight variation, so bolding it does
  nothing; larger renders its cores over AA). Verified fluffy/sketch green at a
  +0.9 CI-safety strict margin (vs the 4.5 gate) across all viewports.

## PR A — dial polish (2026-08-01)

Three small dial/nav finishes. Both QA gates + the CSP gate green on the final
build (audit-contrast 0 failures across all seven themes; audit-meta 31 routes;
audit-csp intact). Rebased clean onto `main` after PR #13 (the CI-diagnostic/
README `chore`) squash-merged the same base commit this branch was cut from —
the duplicate base was dropped so the branch is a 5-file diff, no re-adds.

### Item 1 — section-index numeral → pixel

- **Only the *numeral* index goes pixel; letter/mark indices stay grotesk.**
  The shared `SectionHeader` index can be a number ("02"), a CROPS letter
  ("CR"/"O"/"P"/"S"), or a mark ("?", "~", "↗", "∞", "A"). A `/^\d+$/` test
  adds `section-index--num` on numerals only, which switches that glyph to
  `var(--font-num)` and resets the grotesk's `-0.03em` tracking to 0 (pixel/
  mono faces want no negative tracking). The two-line lowercase name+descriptor
  stay grotesk throughout. This threads the needle between "structural indices
  are pixel" (this pass) and "the CROPS letters are grotesk labels, not data"
  (the 2026-07-21 type-rule entry) — the CR digraph and the O/P/S badges keep
  their grotesk voice; only the channel numbers do the pixel switch.
- **`--font-num`, not `--font-display`, so SWISS follows its own rule for
  free.** SWISS retires the pixel face; `--font-num` inherits SWISS's Inter
  `--font-display`, so the section numeral is heavy grotesk tabular there by
  construction (verified). SKETCH's numeral face (Cutive Mono) applies too, but
  only at the header sizes (≥28px audited locations), well over the ≥24px 3:1
  bar — the audit confirmed no regression.
- **Verified rendering the pixel numeral on**: every channel dock (nodes "02" …
  layers "06" → Departure Mono), the /pulse overlay header ("03" → Departure),
  the /pulse 404 ("404"), and /about panels (01–05); and the grotesk-preserved
  path on the CROPS values modal ("O" → Inter Var), the "A" about dock, and the
  ?/~/↗/∞ modal marks.

### New type rule (restated, supersedes the 2026-07-21 exceptions list)

**Pixel (`--font-num`, default Departure Mono) = LIVE DATA *and* STRUCTURAL
INDICES.** KPI numerals, per-block / stat numbers, countdowns, the giant
background channel-glyph watermark — and now the shared `SectionHeader`'s large
index *numeral* (channel numbers, category numbers, the 404 code).

**Grotesk lowercase (`--font-grotesk`, Inter) = every HUMAN LABEL.** Section
header name+descriptor lines, eyebrows, category names, the **CROPS letters**
(CR·O·P·S, a digraph + three — labels for the four properties, never data),
and all /about copy. Non-numeric `SectionHeader` indices (the CROPS letters and
the ?/~/↗/∞/A marks) are labels and stay grotesk.

**Theme note**: SWISS retires the pixel face — `--font-num` resolves to its
grotesk `--font-display` (Inter), so the "structural indices are pixel" rule
degrades to heavy grotesk there automatically, honouring SWISS's own rule.

### Item 2 — ENTER on the d-pad

- The decorative 5px hub dot becomes a real `dpad-key dpad-enter` control (⏎
  glyph, `data-key="Enter"`, aria-label "Dive into detail"). It reuses the
  d-pad's existing one-input path: a click blurs it and dispatches a synthetic
  `Enter` keydown on `window`, which BeatStage's dive handler picks up (the
  blur returns focus to `<body>`, satisfying that handler's
  `activeElement === document.body` guard). Keyboard behaviour is unchanged —
  pressing Enter still dives; the new code only *lights* the keycap on real
  Enter presses (added `Enter` to the arrow-flash condition in the layout
  controller).
- **Dims off BEAT like the L/R arrows**: dive only exists on BEAT, so
  `dpad-enter` joins the `.dpad-metric-off` dim rule (opacity 0.32, dashed,
  `pointer-events:none`). Verified: dives on `/` (→ `/pulse/staked_eth`),
  dimmed+inert on `/flow`.
- The ⏎ glyph reads slightly larger than the arrows for presence; the word
  "ENTER · DIVE" lives in the desktop legend and the aria-label (matching the
  arrow keycaps' glyph-only convention). Reduced motion keeps the control and
  the press flash; only the pulse/press *animation* is gated, as with the rest
  of the d-pad. Mobile hides the legend line (swipe hint shows instead), keycap
  stays tappable.

### Item 3 — visible dive `+` button on the dial

- **Placement: the disc's lower edge**, centred (the spec's sanctioned
  alternative to "just below the numeral"). Absolute inside `.disc-core`,
  `bottom:-1.35rem`, `z-20` — above the left/right click zones (z-10), below the
  pulse overlay (z-16 at the stage-root level, so the button never pokes through
  an open overlay). Centred at 6 o'clock it clears the diagonal mini-stats
  (45°/135°/225°/315°) and the caption arc (radius 235, ~73% down); it sits over
  the single 6-o'clock epoch tick, which reads as an intentional control on the
  dial edge. Chosen over an in-flow button below the disc because the home route
  is a strict no-scroll 100dvh grid — an absolute overlay adds zero flow height.
- **Instrument grammar, visible at rest**: 1px `--accent` ring, `--accent` +
  glyph, solid `--paper` fill — not ghosted. Hover fills red (`--bar-text`
  glyph for AA on the fill). The `+` rotates 135° on hover/focus (a "quarter-to-
  half turn" that lands on a distinct `×`, eased), gated behind
  `prefers-reduced-motion: no-preference` so reduced motion drops only the spin.
- **Tooltip ABOVE it**: "view details", micro mono (10px, weight 650), corner-
  bracket frame (`.brackets`), solid `--paper` background so ink-on-paper stays
  AA over the busy dial; hidden until `:hover`/`:focus-visible` (kept on hover/
  focus under reduced motion). On mobile the button grows to 3rem and the
  tooltip is always shown (no hover there) — the "larger tap target, always-
  labelled" requirement.
- **Click *and* Enter open the overlay**: native `<button>` semantics give
  Enter/Space activation; an `onKeyDown` `stopPropagation`s Enter/Space so the
  dial's global Space=hold / Enter=dive handlers can't double-fire when the
  button is focused. Keyboard-focusable with the site-wide `:focus-visible`
  accent ring. Verified: visible at rest, rotates to × + tooltip on hover,
  focus ring on Tab, opens the overlay on click.

## PR B — dissolve the values card (2026-08-01)

The values beat rendered as an `invert brackets` block: a solid ink-filled,
corner-bracketed panel dropped over the dial. It read like a stray modal that
had opened over the beat, not like part of the rotation.

- **Dissolved in-dial, no fallback needed.** The filled panel (`.invert`) and
  the bracket frame (`.brackets`, `py-8`) are gone. The values beat now renders
  as one more face in the KPI carousel: the `∞ values / one principle per beat`
  `SectionHeader` where a KPI's label sits, the principle title where the big
  numeral sits (kept in the pixel display voice — the documented values-beat
  exception), and the gloss where the caption goes. The disc keeps beating
  behind it; margins, rings and tickers are untouched. The spec's hairline-
  frame fallback was not needed — the plain in-dial dissolve belongs.
- **Contrast without the panel's guarantee.** The old `.invert` panel forced
  paper-on-ink, so legibility was free. Ink-on-paper over the live disc needs
  care, so both new roles are full `--ink`: the principle is large pixel type
  (3:1 large-text, same treatment as the KPI numeral it replaces), and the
  gloss (`.values-gloss`) is bold (weight 700) mono at the label size — the
  bolding pre-empts the macOS→Linux CI thin-font gap the shared rules call out.
  No threshold was loosened.
- **Audit coverage note**: `audit-contrast` runs under `reducedMotion: reduce`,
  where BeatStage renders only the single active face (a KPI on load) — the 3D
  carousel and its values ghost-face don't exist in the DOM, so the audit never
  samples the values beat in either state. Its legibility is therefore verified
  visually via the seven-theme contact sheet
  (`scripts/build-values-contact-sheet.mjs`, output git-ignored, reproduced on
  demand), not by the pixel gate. Both permanent gates stay green because no
  sampled node changed.
- **Skippable like any KPI**: unchanged — it is still the extra virtual slot in
  the carousel, so arrows/swipe/click cycle past it exactly as before.
- **Seven themes** verified on the contact sheet: ink/bone (ink↔bone on paper/
  black), swiss (heavy grotesk), terminal (phosphor green on near-black),
  fluffy (plum on lavender), sketch (graphite on cream), split-flap (bone on
  near-black). No panel in any; each reads as a beat, not an overlay.
