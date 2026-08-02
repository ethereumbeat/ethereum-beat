/**
 * Number formatting. British English, no financial framing: deltas use
 * neutral up/down triangles, never green/red.
 */

const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

export function compact(v: number, digits = 1): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(digits)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(digits)}M`;
  if (abs >= 1e4) return `${(v / 1e3).toFixed(digits)}K`;
  return nf0.format(v);
}

/** The big KPI numeral. Unit-aware; returns { value, suffix }. */
export function kpiValue(value: number, unit: string): { value: string; suffix: string } {
  switch (unit) {
    case 'days':
      return { value: nf0.format(value), suffix: 'days' };
    case 'epoch':
      return { value: nf0.format(value), suffix: '' };
    case 'eth':
      return { value: compact(value, 2), suffix: 'ETH' };
    case 'usd':
      return { value: `$${compact(value, 1)}`, suffix: '' };
    case 'usd_small':
      return { value: `$${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}`, suffix: '' };
    case 'pct':
      return { value: nf1.format(value), suffix: '%' };
    case 'mgas_s':
      return { value: nf1.format(value), suffix: 'Mgas/s' };
    default: // count
      return value >= 1e8
        ? { value: compact(value, 1), suffix: '' }
        : { value: nf0.format(value), suffix: '' };
  }
}

/** Axis / readout value: shorter than the KPI numeral. */
export function axisValue(value: number, unit: string): string {
  switch (unit) {
    case 'usd':
      return `$${compact(value, 1)}`;
    case 'usd_small':
      return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3)}`;
    case 'pct':
      return `${nf1.format(value)}%`;
    case 'eth':
      return compact(value, 1);
    case 'mgas_s':
      return nf1.format(value);
    default:
      return compact(value, 1);
  }
}

export const DELTA_LABELS: Record<string, string> = {
  d: 'vs yesterday',
  w: 'vs last week',
  m: 'vs last month',
  q: 'vs last quarter',
  y: 'vs last year',
};

export function formatDelta(pct: number | null): string | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  const glyph = pct > 0.05 ? '▴' : pct < -0.05 ? '▾' : '▪';
  return `${glyph} ${Math.abs(pct).toFixed(1)}%`;
}

/**
 * The numeral's caption line (dp10c): a metric_meta caption override wins,
 * else the delta over the metric's own comparison window (PR C) in
 * "▾ 5.7% VS LAST MONTH" form. A daily "vs yesterday" is meaningless on slow
 * metrics, so each metric declares `compare_window` (d|w|m|q|none); `none`
 * (and any window whose delta is null) shows nothing — never a 0.0% delta.
 * Returns '' when there is nothing to show. Shared by the home arc, the detail
 * page and share images so all three always agree.
 */
export function metricCaption(m: {
  caption?: string | null;
  compare_window?: 'd' | 'w' | 'm' | 'q' | 'none' | null;
  deltas: Record<'d' | 'w' | 'm' | 'q' | 'y', number | null>;
}): string {
  if (m.caption && m.caption.trim()) return m.caption.trim().toUpperCase();
  // default to daily for pre-PR-C snapshots that carry no window
  const win = m.compare_window ?? 'd';
  if (win === 'none') return '';
  const d = formatDelta(m.deltas[win]);
  return d ? `${d} ${DELTA_LABELS[win]!.toUpperCase()}` : '';
}

export function gwei(wei: bigint): string {
  return nf2.format(Number(wei) / 1e9);
}

/**
 * Base fee in gwei as a peripheral headline — the legible "what it costs now"
 * number (PR C). Scales precision to magnitude so both a busy 120 gwei and a
 * quiet 0.08 gwei read cleanly, and sub-0.01 keeps a couple of significant
 * figures rather than collapsing to "0.00".
 */
export function fmtGwei(g: number): string {
  if (!Number.isFinite(g) || g <= 0) return '0 GWEI';
  if (g >= 100) return `${Math.round(g)} GWEI`;
  if (g >= 1) return `${g.toFixed(1)} GWEI`;
  if (g >= 0.01) return `${g.toFixed(2)} GWEI`;
  return `${Number(g.toPrecision(1))} GWEI`;
}

export function eth(wei: bigint, digits = 4): string {
  return (Number(wei) / 1e18).toFixed(digits);
}

/** fixed-width monospace bar, e.g. gas used as % of limit over 20 chars */
export function monoBar(fraction: number, width = 20): string {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function truncHex(hex: string, head = 10, tail = 6): string {
  return hex.length <= head + tail + 1 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** print-style stamp: 2026 - 07 - 18 */
export function dateStamp(d: Date): string {
  return `${d.getUTCFullYear()} - ${pad2(d.getUTCMonth() + 1)} - ${pad2(d.getUTCDate())}`;
}
