/**
 * Shields-style embeddable SVG badges for live Ethereum vitals.
 *
 * Values come ONLY from the cached daily snapshot (KV / D1) — a badge request
 * never touches the 12s live RPC layer. Absent or stale data renders a graceful
 * "—". The SVG is fully self-contained (subset Departure Mono inlined as a
 * data-URI @font-face, fixed monochrome-observatory colours, a CSS-animated
 * beating glyph) so it renders standalone in an <img> on any README or site.
 */
import type { Snapshot, SnapshotMetric } from './metrics';
import { kpiValue } from './format';
import { BADGE_FONT_WOFF2_B64, BADGE_CHAR_RATIO } from './badge-font';

/** slug (URL) → { label shown on the badge, snapshot metric it reads } */
export const BADGES: Record<string, { label: string; metric_key: string }> = {
  // the four requested vitals — all backed by cached snapshot metrics
  nodes: { label: 'NODES', metric_key: 'node_countries' },
  // gas throughput (Mgas/s): the live L1 base fee is a per-block RPC value the
  // no-RPC constraint forbids, so the gas badge shows the cached gas throughput
  gas: { label: 'GAS/S', metric_key: 'throughput' },
  participation: { label: 'PARTICIP', metric_key: 'participation_rate' },
  finality: { label: 'FINAL EPOCH', metric_key: 'finality_ok' },
  // extra vitals for the gallery
  staked: { label: 'STAKED', metric_key: 'staked_pct' },
  uptime: { label: 'UPTIME', metric_key: 'uptime_days' },
  tvs: { label: 'TVS', metric_key: 'tvs' },
};

/** Data older than this (snapshot build time) renders "—" rather than a stale value. */
export const BADGE_STALE_MS = 48 * 3_600_000; // 48h — two missed daily crons

const H = 20; // fixed badge height (shields-compatible; auto width)
const FS = 11; // numeral / label font size
const CHAR_W = FS * BADGE_CHAR_RATIO; // Departure Mono is monospaced → exact width
const PAD = 8;
const GLYPH = 11; // beating octahedron box
const GAP = 6;

const INK = '#111111';
const PAPER = '#f6f6f3';
const RED = '#e10600';
const HAIR = '#c9c9c4';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Format a snapshot metric for a badge, or "—" when absent. */
export function badgeValue(m: SnapshotMetric | undefined): string {
  if (!m) return '—';
  const { value, suffix } = kpiValue(m.latest.value, m.unit);
  if (!suffix) return value;
  return suffix === '%' ? `${value}%` : `${value} ${suffix}`;
}

/** Look up the badge metric in a snapshot; null if the snapshot is stale/absent. */
export function badgeMetric(snapshot: Snapshot | null, metric_key: string): SnapshotMetric | undefined {
  if (!snapshot) return undefined;
  const age = Date.now() - Date.parse(snapshot.generated_at);
  if (!(age >= 0) || age > BADGE_STALE_MS) return undefined; // stale → "—"
  return snapshot.metrics.find((m) => m.metric_key === metric_key);
}

/** Build the standalone badge SVG. `value` already formatted (or "—"). */
export function renderBadge(label: string, value: string): string {
  const glyphX = PAD;
  const labelX = glyphX + GLYPH + GAP;
  const labelW = label.length * CHAR_W;
  const divX = labelX + labelW + GAP;
  const valueX = divX + GAP + 1;
  const valueW = value.length * CHAR_W;
  const W = Math.ceil(valueX + valueW + PAD);
  const cy = H / 2;
  const gcx = glyphX + GLYPH / 2;
  const r = 4; // octahedron half-height/width

  const title = `${label} · ${value} — Ethereum Beat`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>
@font-face{font-family:'DepBadge';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${BADGE_FONT_WOFF2_B64}) format('woff2');}
.t{font-family:'DepBadge',ui-monospace,'SFMono-Regular',monospace;font-size:${FS}px;fill:${INK};}
.beat{transform-box:fill-box;transform-origin:center;animation:beat 1.15s ease-in-out infinite;}
@keyframes beat{0%,55%,100%{transform:scale(1)}18%{transform:scale(1.22)}30%{transform:scale(1.05)}42%{transform:scale(1.14)}}
@media (prefers-reduced-motion:reduce){.beat{animation:none}}
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="1.5" fill="${PAPER}" stroke="${INK}" stroke-width="1"/>
<g class="beat"><path d="M ${gcx} ${cy - r} L ${gcx + r} ${cy} L ${gcx} ${cy + r} L ${gcx - r} ${cy} Z M ${gcx - r} ${cy} L ${gcx + r} ${cy}" fill="none" stroke="${RED}" stroke-width="1" stroke-linejoin="round"/></g>
<text class="t" x="${labelX}" y="${cy}" dominant-baseline="central">${esc(label)}</text>
<line x1="${divX}" y1="4" x2="${divX}" y2="${H - 4}" stroke="${HAIR}" stroke-width="1"/>
<text class="t" x="${valueX}" y="${cy}" dominant-baseline="central" font-weight="700">${esc(value)}</text>
</svg>
`;
}
