/**
 * Range aggregation, computed in SQL at request time.
 *   d: last 30 daily points
 *   w: last 26 weeks   m: last 24 months   q: last 12 quarters   y: full history
 * agg_mode from metric_meta decides mean | sum | last within each bucket.
 */

export type Range = 'd' | 'w' | 'm' | 'q' | 'y';
export type AggMode = 'mean' | 'sum' | 'last';

export const RANGES: Range[] = ['d', 'w', 'm', 'q', 'y'];

export interface Point {
  date: string;
  value: number;
}

const LIMITS: Record<Range, number> = { d: 30, w: 26, m: 24, q: 12, y: 100 };

/** SQLite expression labelling each bucket by its first day. */
function bucketExpr(range: Exclude<Range, 'd'>): string {
  switch (range) {
    case 'w':
      return "date(date, 'weekday 1', '-7 days')"; // Monday-anchored weeks
    case 'm':
      return "substr(date, 1, 7) || '-01'";
    case 'q':
      return "substr(date, 1, 4) || '-' || substr('0' || (((cast(substr(date, 6, 2) as integer) - 1) / 3) * 3 + 1), -2) || '-01'";
    case 'y':
      return "substr(date, 1, 4) || '-01-01'";
  }
}

/** First day of the bucket containing today (UTC), per range. */
export function currentBucketStart(range: Exclude<Range, 'd'>, now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (range) {
    case 'w': {
      const d = new Date(Date.UTC(y, m, now.getUTCDate()));
      const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
      d.setUTCDate(d.getUTCDate() - dow);
      return d.toISOString().slice(0, 10);
    }
    case 'm':
      return `${y}-${String(m + 1).padStart(2, '0')}-01`;
    case 'q':
      return `${y}-${String(Math.floor(m / 3) * 3 + 1).padStart(2, '0')}-01`;
    case 'y':
      return `${y}-01-01`;
  }
}

export function seriesQuery(range: Range, mode: AggMode): string {
  if (range === 'd') {
    return `SELECT date, value FROM (
      SELECT date, value FROM metrics WHERE metric_key = ?1 ORDER BY date DESC LIMIT ${LIMITS.d}
    ) ORDER BY date`;
  }
  const bucket = bucketExpr(range);
  // For 'last', SQLite's bare-column-with-max() rule picks the value from the
  // newest row in each bucket (https://sqlite.org/lang_select.html#bareagg).
  const agg = mode === 'sum' ? 'sum(value)' : mode === 'last' ? 'value, max(date)' : 'avg(value)';
  const select = mode === 'last' ? `${bucket} AS date, ${agg}` : `${bucket} AS date, ${agg} AS value`;
  // sum/mean exclude the current, still-incomplete bucket: a partial month
  // summed against full months would plunge misleadingly at the chart's edge
  const complete = mode === 'last' ? '' : ` AND ${bucket} < '${currentBucketStart(range)}'`;
  return `SELECT date, value FROM (
    SELECT ${select} FROM metrics
    WHERE metric_key = ?1${complete} GROUP BY 1 ORDER BY 1 DESC LIMIT ${LIMITS[range]}
  ) ORDER BY date`;
}

export async function fetchSeries(
  db: D1Database,
  metricKey: string,
  range: Range,
  mode: AggMode,
): Promise<Point[]> {
  const res = await db.prepare(seriesQuery(range, mode)).bind(metricKey).all<Point>();
  return res.results;
}
