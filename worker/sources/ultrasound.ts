import { fetchJson, todayUtc, type Row, type Source } from './types.ts';

/**
 * Staked ETH and share of supply from ultrasound.money supply-parts.
 * Supply = execution balances + beacon balances - beacon deposits
 * (deposits are counted inside execution balances history, so subtracting
 * them avoids double-counting; this matches ultrasound.money's own formula).
 */

interface SupplyParts {
  beaconBalancesSum: string; // gwei
  beaconDepositsSum: string; // gwei
  executionBalancesSum: string; // wei
}

export const ultrasound: Source = {
  name: 'ultrasound.money',
  async fetchDaily() {
    const p = await fetchJson<SupplyParts>('https://ultrasound.money/api/v2/fees/supply-parts');
    const beaconEth = Number(p.beaconBalancesSum) / 1e9;
    const depositsEth = Number(p.beaconDepositsSum) / 1e9;
    const executionEth = Number(p.executionBalancesSum) / 1e18;
    const supply = executionEth + beaconEth - depositsEth;
    if (!(beaconEth > 1e6) || !(supply > 1e7)) throw new Error('implausible supply-parts values');
    const date = todayUtc();
    const rows: Row[] = [
      { metric_key: 'staked_eth', date, value: beaconEth },
      { metric_key: 'staked_pct', date, value: (beaconEth / supply) * 100 },
    ];
    return rows;
  },
};
