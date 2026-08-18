---
version: alpha
name: Ethereum Beat
description: >-
  Technical print brutalism for a non-financial Ethereum instrument: a paper
  field, ink, one hot red accent. Seven themes, all WCAG AA. The primary palette
  below is the default INK theme; the other six are documented in Colors.
colors:
  paper: '#fbfbf9'
  ink: '#0a0a0a'
  ink-soft: '#2f2f2f'
  ink-faint: '#4d4d4d'
  accent: '#c90500'
  ok: '#09702d'
  warn: '#705000'
  line-data: '#7a7a79'
typography:
  data:
    fontFamily: '"Departure Mono", "VT323", monospace'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1
  label:
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.6875rem'
    fontWeight: 600
    letterSpacing: '0.08em'
  micro:
    fontFamily: '"Martian Mono", ui-monospace, monospace'
    fontSize: '0.625rem'
    fontWeight: 650
    letterSpacing: '0.14em'
  body:
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    lineHeight: 1.55
  kpi:
    fontFamily: '"Departure Mono", monospace'
    fontSize: '4rem'
    fontWeight: 400
    lineHeight: 1
rounded:
  none: '0px'
  fluffy: '14px'
spacing:
  hair: '1px'
  gutter: '1.5rem'
  disc: '44rem'
components:
  channel:
    backgroundColor: paper
    textColor: ink
    typography: body
  ticker:
    textColor: ink
    typography: data
  badge:
    backgroundColor: paper
    textColor: ink
    typography: micro
  commandBar:
    backgroundColor: accent
    textColor: paper
    typography: label
---

# Ethereum Beat — Design System

This document mirrors the live, dogfooded reference at
[ethereumbeat.org/design](https://ethereumbeat.org/design). Both are sourced
from `src/styles/tokens.css` — do not invent values; change the tokens.

## Overview

Ethereum Beat turns the chain's rhythm into something you can watch: a centre
glyph beats in time with real 12-second slots, and each beat surfaces one
measure of **protocol health**. The aesthetic is *technical print brutalism* —
a paper field, ink, and one hot accent; a screen reads roughly 95% monochrome.

It is **non-financial by design**: no prices, no market cap, no trading framing,
anywhere. Every number demonstrates one of Ethereum's four indivisible **CROPS**
properties from the EF mandate:

- **CR** — Censorship resistance
- **O** — Open source & free
- **P** — Privacy
- **S** — Security

Uptime is not a CROPS property; it is the mission the properties protect, shown
as the heartbeat.

## Colors

Colour is **semantic only**: red is live/active/alert, green is confirmed, amber
is pending. The primary palette (frontmatter) is the default **INK** theme; all
values clear WCAG AA on their field.

| Token | Hex | On paper | Use |
|---|---|---|---|
| `ink` | `#0a0a0a` | ~20:1 | primary text, numerals |
| `ink-soft` | `#2f2f2f` | ~11:1 | secondary copy |
| `ink-faint` | `#4d4d4d` | ~7:1 | the faintest labels (still AA) |
| `accent` | `#c90500` | 5.9:1 | the one red signal |
| `ok` | `#09702d` | AA | confirmed / healthy |
| `warn` | `#705000` | ~7:1 | pending / queued |
| `paper` | `#fbfbf9` | — | the field |

### The seven themes

Only palette, fonts, textures and micro-motion change across themes — the layout
and information are identical everywhere, and **every theme passes AA** (pastel
is not an excuse). Values are `paper` / `ink` / `accent`:

1. **INK** (default) — `#fbfbf9` / `#0a0a0a` / `#c90500` — paper, true near-black, deep red.
2. **BONE** (dark) — `#0a0a0a` / `#f4f2ec` / `#ff4136` — near-black field, bone white.
3. **SWISS** — `#ffffff` / `#0a0a0a` / `#cc0000` — international style; all grotesk, pixel retired.
4. **TERMINAL** — `#050805` / `#5cf088` / `#ff5545` — phosphor green, everything mono.
5. **FLUFFY** — `#f7f1ff` / `#2a1a3a` / `#a8005f` — pastel, rounded, candy magenta (still AA).
6. **SKETCH** — `#f4f1e8` / `#171714` / `#972a20` — handwritten; typewriter numerals, red pencil.
7. **SPLIT-FLAP** — `#14140f` / `#f4ecd8` / `#e85c46` — departure board; condensed, amber lettering.

## Typography

Three voices, split by who is speaking:

- **Data — Departure Mono** (`typography.data`): the pixel face, reserved for
  live data — KPI numerals, tickers, structural indices. The pixel grid at size
  is the point.
- **Human — Inter** (`typography.label` / `typography.body`): lowercase grotesk
  for section headers and human labels.
- **Terminal — Martian Mono** (`typography.micro`): micro labels, tickers and
  table cells.

Type scale (from `tokens.css`): `--text-micro` 10px (printers' marks, full ink,
weight 650) · `--text-tick` / `--text-label` 11px · `--text-body` 14px ·
`--text-kpi-sm` clamp(24–44px) · `--text-kpi` clamp(36–128px), the big beat
numeral. Small text never uses a grey below AA — at 10px the glyph cores dilute,
so micro type is full `ink` at weight 650.

## Layout

A fluid gutter — `spacing.gutter` = `clamp(0.875rem, 3vw, 2.5rem)`. The dial
sizes to the viewport: `spacing.disc` = `min(78vmin, 44rem, 100dvh − 13rem)`.
Information is laid out identically in every theme.

**Reserved tracks — a value never paints into a neighbour.** Two-column HUDs
(the /pulse detail: big numeral left, chart right) use `minmax(0, …)` grid tracks
with `min-width: 0` on each column, so a long token cannot force a track wider.
The numeral column also sets `overflow: hidden` (a hard clip) and scales its
pixel font by digit count via `clamp(…, cqi, max)` (`container-type: inline-size`),
so a billion-scale value shrinks to fit rather than crossing the divider.

**The 1px line system.** Every rule is exactly one pixel (`spacing.hair`):

- `--hairline` — ink @ 0.2 — dividers, section rules.
- `--hairline-faint` — ink @ 0.1 — the faintest separation.
- `--line-data` — ink @ 0.52 (`#7a7a79` on paper) — cell borders, gauge tracks (≥3:1).

## Elevation & Depth

Deliberately flat — print, not dashboard. No drop shadows and no z-layering of
surfaces in the default themes (`--shadow-soft: none`); depth is implied by 1px
lines and inversion (bone-on-ink panels), never by blur. The one exception is
**FLUFFY**, which adds a single soft shadow (`0 6px 18px`) to match its rounded,
candy character.

## Shapes

Square by default: `rounded.none` = `0` in every theme except **FLUFFY**, which
rounds corners to `rounded.fluffy` = `14px`. Bracket marks (four 10px corner
ticks) frame panels instead of borders. The brand mark is the Ethereum
octahedron glyph `⬡`, which does a lub-dub pulse on every slot.

## Components

- **Channel** — a full-screen view: a giant watermark numeral + a docked section
  header, on `paper` with `ink` text. Seven of them (beat · nodes · blobs · flow
  · finality · layers · roadmap), switched by number keys or the command bar.
- **Ticker** — a fixed-width live readout in the margins; values change through
  one frame of scrambled hex, never with layout shift. `data` face for the
  value, a grotesk label beside it.
- **Badge** — a shields-style embeddable SVG served from the cached snapshot: a
  `micro` mono label, a value, and the red accent, self-contained for any README.
- **Command bar** — the persistent nav strip: `accent` background, `paper` text
  (5.9:1), one-key channel switching.
- **Pixel-beat mark** — the wordmark lockup's glyph is a **3×2 bitmap**, `1 0 1 /
  0 1 0` (1 = filled), rendered as hard-edged square pixels (inline SVG `<rect>`s,
  `shape-rendering: crispEdges` — no radius, no antialias). It is drawn in
  `currentColor`, so it inherits the wordmark's text colour and clears AA wherever
  the wordmark does. Static — no animation. It replaces the `•` dot in the
  `[mark] ETHEREUM BEAT` lockup, site-wide.
- **Corner menu** — global chrome, a **terminal-style list opened by the
  command-bar logo**. The logo lockup in the red command bar (`[pixel-beat mark]
  ETHEREUM BEAT`, a `<button>`) is the trigger — there is no arrow; on hover/focus
  a **"more options" tooltip** draws its corner-bracket border in (the shared
  `.hud-frame`/`.hud-edge`/`.hud-tick` + `hud-line-draw` primitive). Because the
  command bar re-renders on soft-nav, opening is a **delegated** document click;
  the tooltip is `position:fixed` (pinned by a nonced script) so it escapes the
  bar's overflow clip. Click/Enter opens a **full viewport-height red rail** down
  the left edge — **50vw on desktop, full-width below the 768px tablet breakpoint**
  (the big pixel labels need room on phones). The panel **opens directly to the
  option list** — no top wordmark. Options are a vertical stack of **large
  lowercase Departure Mono (pixel) labels** — ambient · rss · farcaster · x ·
  badges — no icons, no boxes. The hovered/focused option shows a blinking `_`
  caret; ↑/↓ move it, Enter activates, one caret at a time. **Panel palette:** a
  fixed `#c90500` signal-red field with pure-white ink — white on `#c90500` is
  **6.07:1**, clearing AA (the big pixel labels are large-text). **Reactive
  texture:** a nonced canvas paints a dark-red pixel dither whose cells brighten
  under the cursor and settle back; cells only ever **DARKEN** the field
  (`rgba(58,0,0,α)`, **opacity ceiling α ≤ 0.34**), so white labels never drop
  below AA — darkening only raises white-on-red contrast — and the labels sit on
  the solid token in the negative space. Widening the panel to 50vw doesn't touch
  per-pixel contrast (labels stay white on the same token). Static under
  `prefers-reduced-motion`. farcaster + x have no configured destination, so they
  stay **DISABLED** ("soon") — never substituted. GitHub is **not** in the menu;
  it stays in the footer. Esc / click-outside close; all JS nonced.
- **Ambient wallpapers** — a chrome-free, full-viewport system for desktop tools
  like Plash. It **ignores the seven-theme system** and runs on a LOCKED mono+red
  palette so its contrast matrix is ten designs, not ten×seven:
  - field `#0a0a0a` · ink `#f4f2ec` (~17:1) · dim `rgba(244,242,236,0.66)` (~11:1,
    small labels) · signal red `#ff4136` (5.6:1, small red text).
  - `data` face for live values and indices, lowercase grotesk for labels, 1px
    lines, procedural slot-synced motion — never fully still.
  - Ten designs, simple→complex: glyph · slot · beat · ticker · stack · grid ·
    dial · strip · console · wall.
  - **/ambient** is the interactive chooser (← → cycle, copy-wallpaper-link, an
    `esc · exit` back to the main site, and a WALLPAPER SETUP modal — mono +
    grotesk, 1px red border, hard corners — that leads with the **open-source
    path**: Übersicht (free · open source) + the shipped
    `desktop/ubersicht/ethereum-beat.jsx` widget, then Plash (free · closed
    source), each labelled honestly);
    **/ambient/N** is the clean locked single design (nothing interactive — Plash
    freezes the page, so the URL is how you pick), with noindex + canonical to
    /ambient. Neither is in the sitemap.
  - The full-side designs (strip, console, wall) anchor to the **LEFT** edge so
    they clear the macOS desktop-icon column.
- **Footer** — the command bar carries the channels + about + roadmap; the credit
  strip keeps the growthepie / source-registry attribution **one click from the
  homepage**; ancillary destinations (ambient · rss · farcaster · x · badges) live
  in the corner menu, while **GitHub stays in the footer** (not the menu).
  `/design` is never linked from the footer.

## Do's and Don'ts

- **Do** keep it non-financial — protocol health, never price, market cap or
  "number go up".
- **Do** maintain WCAG AA contrast (4.5:1 for normal text) in all seven themes;
  fix a failure by lifting weight or size, never by loosening the threshold
  (Linux Chromium renders thinner than macOS).
- **Do** keep something moving — the glyph beats, tickers flicker, scan lines
  drift — but gate every animation behind `prefers-reduced-motion`; never put
  essential information only in movement.
- **Do** speak in two voices: the pixel face for data, lowercase grotesk for
  humans. British spelling.
- **Don't** use colour decoratively — red, green and amber are semantic only.
- **Don't** add a second accent, a gradient (except FLUFFY's candy sparkle), or
  a drop shadow to the default themes.
- **Don't** name the tech stack in the product UI; it lives in the README.
