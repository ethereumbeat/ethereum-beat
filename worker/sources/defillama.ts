import { fetchJson, todayUtc, type Row, type Source } from './types.ts';

/**
 * Real-world assets tokenised on Ethereum L1: sum of Ethereum TVL across
 * protocols in DefiLlama's RWA category. Their historical category endpoint
 * is paid-only (HTTP 402, verified 2026-07-18), so this series accumulates
 * one point per day from the cron; the seed inserts the first point.
 */

interface Protocol {
  category?: string;
  chainTvls?: Record<string, number>;
}

export const defillama: Source = {
  name: 'DefiLlama',
  async fetchDaily() {
    const protocols = await fetchJson<Protocol[]>('https://api.llama.fi/protocols', undefined, 20_000);
    const sum = protocols
      .filter((p) => p.category === 'RWA')
      .reduce((acc, p) => acc + (p.chainTvls?.['Ethereum'] ?? 0), 0);
    if (!(sum > 0)) throw new Error('RWA sum is zero; response shape changed?');
    const rows: Row[] = [{ metric_key: 'rwa_value', date: todayUtc(), value: sum }];
    return rows;
  },
};
