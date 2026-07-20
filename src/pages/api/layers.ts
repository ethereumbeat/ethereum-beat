import type { APIRoute } from 'astro';
import { edgeCached } from '../../lib/edge-cache';

export const prerender = false;

/**
 * Channel 6's board: a compact per-chain activity summary built from
 * growthepie fundamentals (fetched server-side, edge-cached 1h so the
 * 4MB source is never shipped to a browser). CC BY 4.0, credited in-UI.
 */

const HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'public, s-maxage=3600, max-age=600',
  'access-control-allow-origin': '*',
};

interface GtpRow {
  metric_key: string;
  origin_key: string;
  date: string;
  value: number;
}

export const GET: APIRoute = (ctx) =>
  edgeCached(ctx, async () => {
    const ua = { 'user-agent': 'ethereum-beat/0.1 (+https://github.com/nloureiro/ethereum-beat)' };
    const [fundamentals, master] = await Promise.all([
      fetch('https://api.growthepie.com/v1/fundamentals.json', { headers: ua }).then(
        (r) => r.json() as Promise<GtpRow[]>,
      ),
      fetch('https://api.growthepie.com/v1/master.json', { headers: ua }).then(
        (r) => r.json() as Promise<{ chains: Record<string, { name: string; chain_type: string; deployment: string }> }>,
      ),
    ]);

    // newest complete date per metric
    const latestByChain = new Map<string, { daa?: number; txcount?: number; tvl?: number; fees?: number }>();
    const dates = fundamentals.filter((r) => r.metric_key === 'txcount').map((r) => r.date);
    const lastDate = dates.sort().at(-1) ?? '';
    for (const r of fundamentals) {
      if (r.date !== lastDate) continue;
      const slot = latestByChain.get(r.origin_key) ?? {};
      if (r.metric_key === 'daa') slot.daa = r.value;
      else if (r.metric_key === 'txcount') slot.txcount = r.value;
      else if (r.metric_key === 'tvl') slot.tvl = r.value;
      else if (r.metric_key === 'fees_paid_usd') slot.fees = r.value;
      latestByChain.set(r.origin_key, slot);
    }

    const chains = [...latestByChain.entries()]
      .filter(([key]) => !['all_l2s', 'multiple'].includes(key) && master.chains[key])
      .map(([key, v]) => ({
        key,
        name: master.chains[key]!.name,
        l1: master.chains[key]!.chain_type === 'l1',
        daa: v.daa ?? 0,
        txcount: v.txcount ?? 0,
        tvs: v.tvl ?? 0,
        fees: v.fees ?? 0,
      }))
      .filter((c) => c.txcount > 0)
      .sort((a, b) => b.txcount - a.txcount);

    const l1Tx = chains.filter((c) => c.l1).reduce((a, c) => a + c.txcount, 0);
    const l2Tx = chains.filter((c) => !c.l1).reduce((a, c) => a + c.txcount, 0);

    return new Response(JSON.stringify({ date: lastDate, chains, l1Tx, l2Tx }), { headers: HEADERS });
  });
