import { todayUtc, type Row, type Source } from './types.ts';

/** Ethereum genesis block: 30 July 2015, 15:26:13 UTC. */
export const GENESIS_MS = Date.UTC(2015, 6, 30, 15, 26, 13);

export function uptimeDaysAt(dateIso: string): number {
  return Math.floor((Date.parse(`${dateIso}T00:00:00Z`) - GENESIS_MS) / 86_400_000);
}

export const uptime: Source = {
  name: 'uptime (computed)',
  async fetchDaily() {
    const date = todayUtc();
    const rows: Row[] = [{ metric_key: 'uptime_days', date, value: uptimeDaysAt(date) }];
    return rows;
  },
};
