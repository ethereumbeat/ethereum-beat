import { fetchJson, todayUtc, type Row, type Source } from './types.ts';

/**
 * Active validators from beaconcha.in. Their v1 API requires an API key
 * (verified 2026-07-18), so this source only runs when BEACONCHAIN_API_KEY
 * is set; without it the metric simply never gains data and stays out of
 * the rotation.
 */

interface EpochResponse {
  data: { validatorscount: number };
}

export const beaconchain: Source = {
  name: 'beaconcha.in',
  async fetchDaily(env) {
    if (!env.BEACONCHAIN_API_KEY) return [];
    const res = await fetchJson<EpochResponse>(
      `https://beaconcha.in/api/v1/epoch/latest?apikey=${env.BEACONCHAIN_API_KEY}`,
    );
    const count = res.data.validatorscount;
    if (!Number.isFinite(count) || count <= 0) throw new Error('bad validatorscount');
    const rows: Row[] = [{ metric_key: 'validators_active', date: todayUtc(), value: count }];
    try {
      const q = await fetchJson<{ data: { beaconchain_entering: number; beaconchain_exiting: number } }>(
        `https://beaconcha.in/api/v1/validators/queue?apikey=${env.BEACONCHAIN_API_KEY}`,
      );
      rows.push({ metric_key: 'validator_queue_entry', date: todayUtc(), value: q.data.beaconchain_entering });
      rows.push({ metric_key: 'validator_queue_exit', date: todayUtc(), value: q.data.beaconchain_exiting });
    } catch {
      // queue endpoint is best-effort; the validator count already landed
    }
    return rows;
  },
};
