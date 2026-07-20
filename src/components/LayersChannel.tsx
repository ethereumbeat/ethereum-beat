import { useEffect, useState } from 'react';
import { compact } from '../lib/format';
import ShareButton from './ShareButton';
import ExplainChip from './ExplainChip';
import CropsBadge from './CropsBadge';

/**
 * Channel 6 — LAYERS: the onchain economy by chain. A ranked live board
 * (hatched activity bars, share of total), the L1↔L2 split gauge, and the
 * combined daily-transaction curve. Motif: stacked layers.
 */

interface Chain {
  key: string;
  name: string;
  l1: boolean;
  daa: number;
  txcount: number;
  tvs: number;
  fees: number;
}

interface Board {
  date: string;
  chains: Chain[];
  l1Tx: number;
  l2Tx: number;
}

function CombinedChart() {
  const [points, setPoints] = useState<{ date: string; value: number }[] | null>(null);
  useEffect(() => {
    fetch('/api/metric/txcount_combined?range=m')
      .then((r) => r.json() as Promise<{ points: { date: string; value: number }[] }>)
      .then((d) => setPoints(d.points))
      .catch(() => setPoints([]));
  }, []);
  if (!points || points.length < 2) return null;
  const W = 460;
  const H = 80;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * W).toFixed(1)},${(H - 6 - ((v - min) / span) * (H - 12)).toFixed(1)}`)
    .join('');
  return (
    <div className="brackets p-3">
      <p className="micro mb-1">COMBINED TXS / DAY · MONTHLY</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx={W} cy={H - 6 - ((values[values.length - 1]! - min) / span) * (H - 12)} r="3" fill="var(--accent)" />
      </svg>
    </div>
  );
}

/** the motif: three offset layer plates */
function LayersMotif() {
  return (
    <svg viewBox="0 0 64 44" className="h-8 w-12" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={4 + i * 6} y={26 - i * 10} width="40" height="10" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity={1 - i * 0.28} />
      ))}
    </svg>
  );
}

export default function LayersChannel() {
  const [board, setBoard] = useState<Board | null>(null);
  const [l2Count, setL2Count] = useState<number | null>(null);
  const [medianFee, setMedianFee] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/layers')
      .then((r) => (r.ok ? (r.json() as Promise<Board>) : Promise.reject()))
      .then(setBoard)
      .catch(() => setBoard(null));
    fetch('/api/metric/l2_count?range=d')
      .then((r) => r.json() as Promise<{ points: { value: number }[] }>)
      .then((d) => setL2Count(d.points.at(-1)?.value ?? null))
      .catch(() => setL2Count(null));
    fetch('/api/metric/median_l2_fee?range=d')
      .then((r) => r.json() as Promise<{ points: { value: number }[] }>)
      .then((d) => setMedianFee(d.points.at(-1)?.value ?? null))
      .catch(() => setMedianFee(null));
  }, []);

  const top = board?.chains.slice(0, 14) ?? [];
  const maxTx = top[0]?.txcount ?? 1;
  const totalTx = board ? board.l1Tx + board.l2Tx : 0;
  const l2Share = board && totalTx ? board.l2Tx / totalTx : 0;

  return (
    <div className="plus-field flex h-full min-h-0 flex-col gap-4 pt-2">
      <div className="flex flex-none flex-wrap items-center gap-3">
        <LayersMotif />
        <span className="label-big">{l2Count !== null ? `${Math.round(l2Count)} LAYERS` : '— LAYERS'}</span>
        <span className="micro">
          · MEDIAN L2 FEE {medianFee !== null ? `$${medianFee < 0.01 ? medianFee.toFixed(4) : medianFee.toFixed(2)}` : '—'}
        </span>
        {board && <span className="micro">· AS OF {board.date}</span>}
        <span className="grow" />
        <CropsBadge category="openness" context="Layer 2: Ethereum scaling itself openly" />
        <ExplainChip
          title="Layers"
          text={[
            'Layer 2 networks execute transactions cheaply and post their data back to Ethereum, inheriting its security. The board ranks every tracked chain by yesterday’s transactions.',
            'The gauge shows how much of the whole economy already lives on layer 2. Data: growthepie (CC BY 4.0).',
          ]}
        />
        <ShareButton
          compact
          data={{
            value: `${Math.round(l2Share * 100)}% ON L2`,
            label: 'Layer 2 share',
            index: '_06',
            url: `${typeof location !== 'undefined' ? location.origin : ''}/layers`,
            motif: '6',
          }}
        />
      </div>

      {/* L1 <-> L2 split gauge */}
      <div className="flex-none">
        <div className="mb-1 flex justify-between">
          <span className="micro">L1 · {board ? compact(board.l1Tx, 1) : '—'} TXS</span>
          <span className="micro font-bold text-[color:var(--accent)]">{Math.round(l2Share * 100)}% ON LAYER 2</span>
          <span className="micro">L2 · {board ? compact(board.l2Tx, 1) : '—'} TXS</span>
        </div>
        <div className="flex h-4 w-full border border-[color:var(--ink-soft)]">
          <div className="hatch-heavy h-full border-r-2 border-[color:var(--accent)]" style={{ width: `${(1 - l2Share) * 100}%` }} />
          <div className="hatch h-full flex-1" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_auto]">
        {/* ranked board */}
        <div className="flex min-h-0 flex-col overflow-hidden">
          <p className="micro mb-2">RANKED BY TRANSACTIONS · YESTERDAY</p>
          <div className="min-h-0 flex-1 overflow-y-auto pr-2">
            {top.map((c, i) => (
              <div key={c.key} className="flex items-center gap-3 py-1">
                <span className={`micro w-6 text-right tabular-nums ${i === 0 ? '!text-[color:var(--accent)] font-bold' : 'text-[color:var(--ink-soft)]'}`}>{i + 1}</span>
                <span className={`mono-label w-32 truncate ${c.l1 ? 'font-bold' : ''}`}>
                  {c.name}
                  {c.l1 ? ' · L1' : ''}
                </span>
                <div className="h-3.5 flex-1 border border-[color:var(--hairline)]">
                  <div className={c.l1 ? 'hatch-heavy h-full' : 'hatch h-full'} style={{ width: `${(c.txcount / maxTx) * 100}%` }} />
                </div>
                <span className="mono-label w-16 text-right tabular-nums">{compact(c.txcount, 1)}</span>
                <span className="micro w-12 text-right tabular-nums text-[color:var(--ink-soft)]">
                  {totalTx ? ((c.txcount / totalTx) * 100).toFixed(1) : '—'}%
                </span>
              </div>
            ))}
            {!board && <p className="micro py-8 text-center">RANKING THE LAYERS…</p>}
          </div>
        </div>

        {/* side: combined activity + TVS leaders */}
        <div className="hidden w-72 flex-col gap-4 lg:flex">
          <CombinedChart />
          <div className="brackets p-3">
            <p className="micro mb-2">VALUE SECURED · TOP 5</p>
            {(board?.chains ?? [])
              .slice()
              .sort((a, b) => b.tvs - a.tvs)
              .slice(0, 5)
              .map((c) => (
                <div key={c.key} className="flex justify-between py-0.5">
                  <span className="micro">{c.name}</span>
                  <span className="micro tabular-nums font-bold">${compact(c.tvs, 1)}</span>
                </div>
              ))}
          </div>
          <p className="micro text-[color:var(--ink-faint)]">GROWTHEPIE · CC BY 4.0</p>
        </div>
      </div>
    </div>
  );
}
