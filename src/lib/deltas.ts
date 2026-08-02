/**
 * Windowed percentage deltas — the single source of truth shared by the KV
 * snapshot builder (worker/snapshot.ts) and the server-rendered detail page
 * (pulse/[metric].astro), so both compute "vs last week/month/…" identically.
 *
 * The delta genuinely aggregates over each window (mean/sum) rather than
 * relabelling a daily number: PR C lets each metric pick which window is
 * meaningful (metric_meta.compare_window) instead of hardcoding daily.
 */

export type AggMode = 'mean' | 'sum' | 'last';

/** which comparison window a metric's caption/detail delta uses */
export type CompareWindow = 'd' | 'w' | 'm' | 'q' | 'none';

export type Deltas = Record<'d' | 'w' | 'm' | 'q' | 'y', number | null>;

/** window spans in days */
export const WINDOWS = { d: 1, w: 7, m: 30, q: 90, y: 365 } as const;

function aggregate(values: number[], mode: AggMode): number | null {
  if (values.length === 0) return null;
  if (mode === 'sum') return values.reduce((a, b) => a + b, 0);
  if (mode === 'last') return values[values.length - 1]!;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** rows must be ascending by date. */
export function computeDeltas(rows: { date: string; value: number }[], mode: AggMode): Deltas {
  const deltas: Deltas = { d: null, w: null, m: null, q: null, y: null };
  if (rows.length < 2) return deltas;
  const latestMs = Date.parse(`${rows[rows.length - 1]!.date}T00:00:00Z`);
  const daysAgo = (r: { date: string }) => (latestMs - Date.parse(`${r.date}T00:00:00Z`)) / 86_400_000;

  for (const [key, span] of Object.entries(WINDOWS) as ['d' | 'w' | 'm' | 'q' | 'y', number][]) {
    const current = rows.filter((r) => daysAgo(r) < span);
    const previous = rows.filter((r) => daysAgo(r) >= span && daysAgo(r) < span * 2);
    if (mode === 'last') {
      // compare the latest value with the newest value at least `span` days old
      const base = [...rows].reverse().find((r) => daysAgo(r) >= span);
      deltas[key] = pctChange(rows[rows.length - 1]!.value, base?.value ?? null);
    } else {
      deltas[key] = pctChange(aggregate(current.map((r) => r.value), mode), aggregate(previous.map((r) => r.value), mode));
    }
  }
  return deltas;
}
