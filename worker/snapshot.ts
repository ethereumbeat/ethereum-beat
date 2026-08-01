/**
 * Builds the KV snapshot the home page renders from: for every metric with
 * data, the latest value, a 30-point sparkline and percentage deltas for
 * d/w/m/q/y. One KV read serves the whole page.
 */
import { computeDeltas, type CompareWindow, type Deltas } from '../src/lib/deltas.ts';

export { computeDeltas };

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
  /** which window the caption/detail delta compares over (PR C) */
  compare_window?: CompareWindow | null;
}

export interface SnapshotMetric extends MetricMetaRow {
  latest: { date: string; value: number };
  spark: number[];
  deltas: Deltas;
}

export interface Snapshot {
  generated_at: string;
  metrics: SnapshotMetric[];
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
