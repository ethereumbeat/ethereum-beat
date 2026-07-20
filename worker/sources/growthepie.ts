import { fetchJson, todayUtc, type Row, type Source } from './types.ts';

/**
 * growthepie is the backbone: one fundamentals call covers five combined
 * metrics, master.json gives the L2 count and da_fundamentals the blob count.
 * Three requests per day, well inside their max 10/min guidance.
 * Data: growthepie.com, CC BY 4.0 — attribution kept in metric_meta and /about.
 */

interface GtpRow {
  metric_key: string;
  origin_key: string;
  date: string;
  value: number;
}

/** origin keys that are aggregates, not chains — never sum these in. */
const NON_CHAIN_ORIGINS = new Set(['all_l2s', 'multiple']);

/** fundamentals metric_key -> our metric_key (each summed across chains per date) */
export const COMBINED_METRICS: Record<string, string> = {
  daa: 'daa_combined',
  txcount: 'txcount_combined',
  gas_per_second: 'throughput',
  stables_mcap: 'stables_supply',
  tvl: 'tvs',
};

/** Sum fundamentals-shaped rows across chains into combined daily rows. */
export function combineRows(raw: GtpRow[], cutoffDate: string): Row[] {
  const acc = new Map<string, number>(); // "ours|date" -> sum
  for (const r of raw) {
    const ours = COMBINED_METRICS[r.metric_key];
    if (!ours || NON_CHAIN_ORIGINS.has(r.origin_key)) continue;
    if (!r.date || r.date >= cutoffDate || !Number.isFinite(r.value)) continue;
    const k = `${ours}|${r.date}`;
    acc.set(k, (acc.get(k) ?? 0) + r.value);
  }
  return [...acc].map(([k, value]) => {
    const [metric_key, date] = k.split('|');
    return { metric_key: metric_key!, date: date!, value };
  });
}

export function blobRows(raw: { metric_key: string; origin_key: string; date: string; value: number }[], cutoffDate: string): Row[] {
  const out: Row[] = [];
  for (const r of raw) {
    if (r.origin_key !== 'da_ethereum_blobs' || r.date >= cutoffDate) continue;
    if (r.metric_key === 'da_blob_count') {
      out.push({ metric_key: 'blobs_daily', date: r.date, value: r.value });
      out.push({ metric_key: 'blobs_per_block_avg', date: r.date, value: r.value / 7200 });
    } else if (r.metric_key === 'da_unique_blob_producers') {
      out.push({ metric_key: 'blob_chains', date: r.date, value: r.value });
    }
  }
  return out;
}

/** median L2 transaction fee: mean of each L2's median cost (USD) per date */
export function medianFeeRows(raw: GtpRow[], cutoffDate: string): Row[] {
  const byDate = new Map<string, number[]>();
  for (const r of raw) {
    if (r.metric_key !== 'txcosts_median_usd' || r.origin_key === 'ethereum') continue;
    if (NON_CHAIN_ORIGINS.has(r.origin_key) || r.date >= cutoffDate || !Number.isFinite(r.value)) continue;
    const arr = byDate.get(r.date) ?? [];
    arr.push(r.value);
    byDate.set(r.date, arr);
  }
  return [...byDate].map(([date, vals]) => ({
    metric_key: 'median_l2_fee',
    date,
    value: vals.reduce((a, b) => a + b, 0) / vals.length,
  }));
}

export function countL2s(master: { chains: Record<string, { chain_type: string; deployment: string }> }): number {
  return Object.entries(master.chains).filter(
    ([key, c]) => c.chain_type !== 'l1' && c.deployment === 'PROD' && !NON_CHAIN_ORIGINS.has(key),
  ).length;
}

export const growthepie: Source = {
  name: 'growthepie',
  async fetchDaily() {
    const today = todayUtc();
    const [fundamentals, master, da] = await Promise.all([
      fetchJson<GtpRow[]>('https://api.growthepie.com/v1/fundamentals.json', undefined, 30_000),
      fetchJson<{ chains: Record<string, { chain_type: string; deployment: string }> }>(
        'https://api.growthepie.com/v1/master.json',
      ),
      fetchJson<GtpRow[]>('https://api.growthepie.com/v1/da_fundamentals.json', undefined, 30_000),
    ]);
    const rows = combineRows(fundamentals, today);
    rows.push(...medianFeeRows(fundamentals, today));
    rows.push(...blobRows(da, today));
    rows.push({ metric_key: 'l2_count', date: today, value: countL2s(master) });
    return rows;
  },
};
