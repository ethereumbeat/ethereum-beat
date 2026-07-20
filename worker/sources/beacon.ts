import { fetchJson, todayUtc, type Row, type Source } from './types.ts';

/**
 * Finality via the standard Beacon API. beaconcha.in's v1 API now requires a
 * key (verified 2026-07-18), so the keyless path uses public beacon nodes.
 */

const BEACON_ENDPOINTS = [
  'https://ethereum-beacon-api.publicnode.com',
  'https://eth-beacon-chain.drpc.org/rest',
];

interface FinalityCheckpoints {
  data: { finalized: { epoch: string } };
}

export const beacon: Source = {
  name: 'beacon-api',
  async fetchDaily() {
    let lastError: unknown;
    for (const base of BEACON_ENDPOINTS) {
      try {
        const res = await fetchJson<FinalityCheckpoints>(
          `${base}/eth/v1/beacon/states/head/finality_checkpoints`,
        );
        const epoch = Number(res.data.finalized.epoch);
        if (!Number.isFinite(epoch) || epoch <= 0) throw new Error('bad epoch');
        const rows: Row[] = [{ metric_key: 'finality_ok', date: todayUtc(), value: epoch }];
        // sync-committee participation: a keyless liveness proxy
        try {
          const head = await fetchJson<{
            data: { message: { body: { sync_aggregate: { sync_committee_bits: string } } } };
          }>(`${base}/eth/v2/beacon/blocks/head`);
          const bits = head.data.message.body.sync_aggregate.sync_committee_bits.slice(2);
          let n = 0;
          for (const c of bits) n += (parseInt(c, 16).toString(2).match(/1/g) ?? []).length;
          rows.push({ metric_key: 'participation_rate', date: todayUtc(), value: (n / 512) * 100 });
        } catch {
          // participation is optional; finality already succeeded
        }
        return rows;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('all beacon endpoints failed');
  },
};
