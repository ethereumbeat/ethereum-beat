/**
 * Builds the KV snapshot the home page renders from: for every metric with
 * data, the latest value, a 30-point sparkline and percentage deltas for
 * d/w/m/q/y. One KV read serves the whole page.
 */

export interface MetricMetaRow {
  metric_key: string;
  label: string;
  category: string;
  unit: string;
  description: string;
  source_name: string;
  source_url: string;
  featured: number;
  sort: number;
  agg_mode: 'mean' | 'sum' | 'last';
  /** optional arc caption; overrides the delta line (dp10c) */
  caption?: string | null;
}

export interface SnapshotMetric extends MetricMetaRow {
  latest: { date: string; value: number };
  spark: number[];
  deltas: Record<'d' | 'w' | 'm' | 'q' | 'y', number | null>;
}

export interface Snapshot {
  generated_at: string;
  metrics: SnapshotMetric[];
}

const WINDOWS = { d: 1, w: 7, m: 30, q: 90, y: 365 } as const;

function aggregate(values: number[], mode: MetricMetaRow['agg_mode']): number | null {
  if (values.length === 0) return null;
  if (mode === 'sum') return values.reduce((a, b) => a + b, 0);
  if (mode === 'last') return values[values.length - 1]!;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** rows must be ascending by date. */
export function computeDeltas(
  rows: { date: string; value: number }[],
  mode: MetricMetaRow['agg_mode'],
): SnapshotMetric['deltas'] {
  const deltas: SnapshotMetric['deltas'] = { d: null, w: null, m: null, q: null, y: null };
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

export async function buildSnapshot(db: D1Database): Promise<Snapshot> {
  const meta = await db
    .prepare('SELECT * FROM metric_meta ORDER BY sort')
    .all<MetricMetaRow>();

  const metrics: SnapshotMetric[] = [];
  for (const m of meta.results) {
    const series = await db
      .prepare(
        'SELECT date, value FROM metrics WHERE metric_key = ?1 ORDER BY date DESC LIMIT 731',
      )
      .bind(m.metric_key)
      .all<{ date: string; value: number }>();
    if (series.results.length === 0) continue; // no data -> not in snapshot, never a broken card

    const rows = [...series.results].reverse();
    const latest = rows[rows.length - 1]!;
    metrics.push({
      ...m,
      latest,
      spark: rows.slice(-30).map((r) => r.value),
      deltas: computeDeltas(rows, m.agg_mode),
    });
  }

  return { generated_at: new Date().toISOString(), metrics };
}

export const SNAPSHOT_KEY = 'snapshot:latest';
