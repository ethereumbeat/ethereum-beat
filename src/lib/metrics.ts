/** Shared snapshot types (mirrors worker/snapshot.ts) and category labels. */

export interface SnapshotMetric {
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
  /** which window the caption/detail delta compares over: d|w|m|q|none (PR C) */
  compare_window?: 'd' | 'w' | 'm' | 'q' | 'none' | null;
  latest: { date: string; value: number };
  spark: number[];
  deltas: Record<'d' | 'w' | 'm' | 'q' | 'y', number | null>;
}

export interface Snapshot {
  generated_at: string;
  metrics: SnapshotMetric[];
  /** ISO time of the last successful collector run (added by /api/snapshot) */
  finished_at?: string | null;
  /** true when the last collection is older than the staleness threshold (26h) */
  is_stale?: boolean;
}

// pass 13c: CROPS is four properties — CR · O · P · S. Heartbeat frames the
// beat but is explicitly not a CROPS property.
export const CATEGORY_LABELS: Record<string, string> = {
  heartbeat: 'Heartbeat',
  'censorship-resistance': 'Censorship resistance',
  openness: 'Open source & free',
  privacy: 'Privacy',
  security: 'Security',
};

export const CATEGORY_ORDER = [
  'heartbeat',
  'censorship-resistance',
  'openness',
  'privacy',
  'security',
];

export function categoryIndex(category: string): string {
  const i = CATEGORY_ORDER.indexOf(category);
  return `_${String(i >= 0 ? i + 1 : 0).padStart(2, '0')}`;
}

export function featuredMetrics(snapshot: Snapshot): SnapshotMetric[] {
  return snapshot.metrics.filter((m) => m.featured === 1);
}

export function findMetric(snapshot: Snapshot, key: string): SnapshotMetric | undefined {
  return snapshot.metrics.find((m) => m.metric_key === key);
}
