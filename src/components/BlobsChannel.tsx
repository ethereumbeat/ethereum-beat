import { useEffect, useMemo, useRef, useState } from 'react';
import { sharedEngine } from '../lib/beat';
import { slotClock } from '../lib/clock';
import * as blockfeed from '../lib/blockfeed';
import { fetchBlobBaseFee } from '../lib/rpc';
import ShareButton from './ShareButton';
import ExplainChip from './ExplainChip';
import CropsBadge from './CropsBadge';

/**
 * Channel 3 — BLOBS as an energy system: the latest block is a vertical
 * battery of hatched cells charging live; recent blocks stand beside it as
 * a bank of smaller batteries; blob base fee reads on a thin gauge with a
 * HUD callout. Monochrome, hatched, never flat.
 */

// current mainnet blob schedule (beacon spec BLOB_SCHEDULE, epoch 419072+)
const MAX_BLOBS = 21;
const TARGET_BLOBS = 14;
const BANK = 18;

function DailyBlobsChart() {
  const [points, setPoints] = useState<{ date: string; value: number }[] | null>(null);
  useEffect(() => {
    fetch('/api/metric/blobs_daily?range=m')
      .then((r) => r.json() as Promise<{ points: { date: string; value: number }[] }>)
      .then((d) => setPoints(d.points))
      .catch(() => setPoints([]));
  }, []);
  if (!points || points.length < 2) return null;
  const W = 460;
  const H = 90;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map(
      (v, i) =>
        `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * W).toFixed(1)},${(H - 6 - ((v - min) / span) * (H - 12)).toFixed(1)}`,
    )
    .join('');
  return (
    <div className="brackets p-3">
      <p className="micro mb-1">BLOBS / DAY · MONTHLY</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx={W} cy={H - 6 - ((values[values.length - 1]! - min) / span) * (H - 12)} r="3" fill="var(--accent)" />
      </svg>
      <p className="micro mt-1 text-[color:var(--ink-faint)]">GROWTHEPIE · CC BY 4.0</p>
    </div>
  );
}

export default function BlobsChannel() {
  const reducedMotion = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const engine = useMemo(() => sharedEngine(reducedMotion), [reducedMotion]);
  const [blocks, setBlocks] = useState<{ number: number; blobs: number; hash: string }[]>([]);
  const [blobFee, setBlobFee] = useState<number | null>(null);
  const [chains, setChains] = useState<number | null>(null);
  const lastRef = useRef('');

  useEffect(() => {
    void blockfeed.poll(slotClock(Date.now()).slot).then(() => blockfeed.seedHistory());
    void fetchBlobBaseFee().then(setBlobFee);
    const off = engine.onBeat((slot) => {
      void blockfeed.poll(slot);
      void fetchBlobBaseFee().then((v) => v !== null && setBlobFee(v));
    });
    return () => {
      off();
    };
  }, [engine]);

  useEffect(() => {
    return blockfeed.subscribe(() => {
      const all = blockfeed.getBlocks();
      if (!all.length) return;
      // key on newest + length so the backfill (older inserts) refreshes too
      const key = `${all[all.length - 1]!.number}:${all.length}`;
      if (key === lastRef.current) return;
      lastRef.current = key;
      setBlocks(all.slice(-BANK).map((b) => ({ number: b.number, blobs: b.blobCount, hash: b.hash })));
    });
  }, []);

  useEffect(() => {
    fetch('/api/metric/blob_chains?range=d')
      .then((r) => (r.ok ? (r.json() as Promise<{ points: { value: number }[] }>) : Promise.reject()))
      .then((d) => {
        const last = d.points[d.points.length - 1];
        if (last) setChains(last.value);
      })
      .catch(() => setChains(null));
  }, []);

  const latest = blocks[blocks.length - 1];
  const lastEpoch = blockfeed.getBlocks().slice(-32);
  const targetPct =
    lastEpoch.length > 2
      ? (lastEpoch.reduce((a, b) => a + b.blobCount, 0) / (lastEpoch.length * TARGET_BLOBS)) * 100
      : null;

  // gauge position: log scale between the fee floor (~1e-9 gwei) and 100 gwei
  const gaugeFrac = blobFee !== null ? Math.min(1, Math.max(0, (Math.log10(blobFee) + 9) / 11)) : 0;

  return (
    <div className="plus-field flex h-full min-h-0 flex-col gap-4 pt-2">
      {/* headline strip */}
      <div className="flex flex-none flex-wrap items-center gap-2">
        <span className="label-big">
          {/* the headline strip's one red element: the live blob count */}
          <span className="text-[color:var(--accent)]">{latest ? `${latest.blobs}/${MAX_BLOBS}` : '—'}</span>{' '}
          <span className="micro">THIS BLOCK</span>
        </span>
        <span className="mx-1 h-4 w-px bg-[color:var(--hairline)]" />
        <span className="micro">TARGET {TARGET_BLOBS}</span>
        <span className="micro">· LAST EPOCH {targetPct !== null ? `${Math.round(targetPct)}% OF TARGET` : '—'}</span>
        {chains !== null && <span className="micro">· {Math.round(chains)} CHAINS POSTING</span>}
        <span className="grow" />
        <CropsBadge category="openness" context="Blobs: layer 2 data landing on Ethereum" />
        <ExplainChip
          title="Blobs"
          text={[
            'Layer 2 networks bundle thousands of transactions, then post the data to Ethereum as blobs — 128 KB parcels — so anyone can reconstruct and verify them.',
            'Each cell is one blob. The notch marks the protocol target of 14 per block; the blob fee market steers blocks towards it, charging and discharging like a battery.',
          ]}
        />
        <ShareButton
          compact
          data={{
            value: latest ? `${latest.blobs}/${MAX_BLOBS} BLOBS` : '…',
            label: 'Blobs this block',
            index: '_03',
            url: `${typeof location !== 'undefined' ? location.origin : ''}/blobs`,
          }}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr] gap-6 lg:grid-cols-[auto_1fr_auto]" style={{ viewTransitionName: 'stage-core' }}>
        {/* THE BATTERY: latest block, cells charging bottom-up */}
        <div
          className="brackets brackets-ink flex h-full min-h-0 flex-col justify-end gap-[3px] p-3"
          aria-label="Latest block blob battery"
        >
          {Array.from({ length: MAX_BLOBS }, (_, i) => {
            const idx = MAX_BLOBS - 1 - i; // draw top-down, fill bottom-up
            const filled = latest ? idx < latest.blobs : false;
            const newest = latest ? idx === latest.blobs - 1 : false;
            return (
              <div key={i} className="relative h-[3.2%] min-h-[8px] w-14 border border-[color:var(--ink-soft)] bg-[color:var(--hairline-faint)] sm:w-20">
                {filled && <div className={`absolute inset-0.5 ${newest ? 'hatch-coarse' : 'hatch-heavy'}`} />}
                {idx === TARGET_BLOBS - 1 && <div className="absolute -right-2 top-0 h-px w-2 bg-[color:var(--ink)]" />}
              </div>
            );
          })}
          <p className="mt-1 text-center font-display text-sm tabular-nums">{latest?.number ?? '—'}</p>
        </div>

        {/* THE BANK: recent blocks as small batteries */}
        <div className="flex min-h-0 flex-col">
          <p className="micro mb-2">LAST {blocks.length} BLOCKS · ONE BATTERY EACH</p>
          <div className="flex min-h-0 flex-1 items-end gap-[6px] overflow-hidden">
            {blocks.map((b, bi) => (
              <div key={b.number} className="flex h-full flex-1 flex-col justify-end gap-[2px]" title={`${b.number}: ${b.blobs} blobs`}>
                {Array.from({ length: MAX_BLOBS }, (_, i) => {
                  const idx = MAX_BLOBS - 1 - i;
                  const filled = idx < b.blobs;
                  return (
                    <div
                      key={i}
                      className={`h-[3%] min-h-[5px] w-full border border-[color:var(--hairline)] ${
                        filled ? (bi === blocks.length - 1 ? 'hatch-coarse' : 'hatch-heavy') : 'bg-[color:var(--hairline-faint)]'
                      }`}
                      style={{ opacity: filled ? Math.max(0.6, 0.65 + (bi / blocks.length) * 0.35) : 0.55 }}
                    />
                  );
                })}
                <span className="micro hidden text-center tabular-nums lg:block" style={{ fontSize: 10 }}>
                  {b.blobs}
                </span>
              </div>
            ))}
            {blocks.length === 0 && <p className="micro w-full py-8 text-center">CHARGING…</p>}
          </div>
          {latest && (
            <p className="micro mt-2 text-[color:var(--ink-faint)]">
              {latest.hash.slice(0, 18)}… · ONE CELL = ONE BLOB · NOTCH = TARGET
            </p>
          )}
        </div>

        {/* THE GAUGE + daily chart */}
        <div className="hidden w-56 flex-col gap-4 lg:flex">
          <div className="relative flex h-40 items-stretch gap-3">
            <div className="relative w-3 border border-[color:var(--ink-soft)]">
              <div className="hatch-coarse absolute inset-x-0 bottom-0" style={{ height: `${gaugeFrac * 100}%` }} />
            </div>
            {/* elbow leader to the callout */}
            <svg className="absolute left-3 top-2 h-10 w-16" viewBox="0 0 64 40" aria-hidden="true">
              <path d="M2,30 L26,30 L26,8 L62,8" fill="none" stroke="var(--hairline)" strokeWidth="1" />
            </svg>
            <div className="callout brackets ml-14 self-start">
              <p className="micro">BLOB BASE FEE</p>
              <p className="label-big tabular-nums">
                {blobFee !== null ? (blobFee < 0.01 ? blobFee.toExponential(1) : blobFee.toFixed(3)) : '—'}
              </p>
              <p className="micro text-[color:var(--ink-faint)]">GWEI · LOG GAUGE</p>
            </div>
          </div>
          <DailyBlobsChart />
        </div>
      </div>
    </div>
  );
}
