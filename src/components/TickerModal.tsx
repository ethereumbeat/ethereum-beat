import { useEffect, useRef, useState } from 'react';
import type { BeatEngine } from '../lib/beat';
import type { BlockStats } from '../lib/rpc';
import * as blockfeed from '../lib/blockfeed';
import { compact, pad2 } from '../lib/format';
import SectionHeader from './SectionHeader';

/**
 * Videogame-menu modal behind every ticker: what the number is in plain
 * language, and — for per-block values — the value beating block by block
 * from the in-session buffer. Esc or click-outside closes, focus is
 * trapped, stage navigation keys are swallowed while open.
 */

type Kind = 'block' | 'clock' | 'daily' | 'info';

export interface TickerInfo {
  title: string;
  kind: Kind;
  desc: string;
  accessor?: (b: BlockStats) => number;
  format?: (v: number) => string;
  metricKey?: string; // daily kind: /pulse link + series
}

export const TICKER_INFO: Record<string, TickerInfo> = {
  block: {
    title: 'BLOCK',
    kind: 'block',
    desc: 'The block height: Ethereum’s page count. A new page is added roughly every 12 seconds and has been since 2015.',
    accessor: (b) => b.number,
    format: (v) => String(v),
  },
  basefee: {
    title: 'BASEFEE',
    kind: 'block',
    desc: 'The protocol-set price of one unit of gas, in gwei (billionths of an ETH). It rises when blocks run full and falls when they run light, and it is burned — destroyed, paid to no one.',
    accessor: (b) => b.baseFeeGwei,
    format: (v) => `${v.toFixed(3)} GWEI`,
  },
  gas: {
    title: 'GAS',
    kind: 'block',
    desc: 'How full the last block was: gas used as a share of the gas limit. The fee mechanism steers this towards 50%, so sustained readings above that mean demand is surging.',
    accessor: (b) => (b.gasUsed / b.gasLimit) * 100,
    format: (v) => `${v.toFixed(0)}%`,
  },
  tx: {
    title: 'TX',
    kind: 'block',
    desc: 'Transactions settled in the latest block: transfers, contract calls, deployments, everything.',
    accessor: (b) => b.txCount,
    format: (v) => String(Math.round(v)),
  },
  blobs: {
    title: 'BLOBS',
    kind: 'block',
    desc: 'Blobs carried by the latest block: parcels of data that layer 2 networks post to Ethereum so their history inherits its security.',
    accessor: (b) => b.blobCount,
    format: (v) => String(Math.round(v)),
  },
  burned: {
    title: 'BURNED',
    kind: 'block',
    desc: 'ETH destroyed by the latest block: base fee times gas used. Protocol mechanics, not a payment — using Ethereum permanently removes a little ETH.',
    accessor: (b) => b.burnedEth,
    format: (v) => `${v.toFixed(4)} ETH`,
  },
  hash: {
    title: 'HASH',
    kind: 'info',
    desc: 'The latest block’s fingerprint: a 32-byte hash committing to everything inside it. Change one bit anywhere in the block and this value changes completely.',
  },
  slot: {
    title: 'SLOT',
    kind: 'clock',
    desc: 'Ethereum’s metronome: one slot every 12 seconds, counted since the Beacon Chain genesis in December 2020. Each slot is one chance to add a block — and one revolution of the dial’s sweep hand.',
  },
  epoch: {
    title: 'EPOCH',
    kind: 'clock',
    desc: 'Thirty-two slots make an epoch (6.4 minutes) — the ring of ticks around the disc. Epochs are the unit validators vote in, which is why finality is measured in them.',
  },
  slotpos: {
    title: 'POSITION',
    kind: 'clock',
    desc: 'Where the epoch stands: which of the 32 slots is current, and how many seconds into it we are. Watch the dial fill as this advances.',
  },
  finality: {
    title: 'FINALITY',
    kind: 'clock',
    desc: 'Estimated time until the chain’s current head is final: the rest of this epoch plus two more. Once an epoch is final, rewriting it is economically impossible.',
  },
  local: { title: 'LOCAL', kind: 'clock', desc: 'Your own clock, your timezone — so you can anchor the chain’s UTC rhythm to where you are.' },
  utc: { title: 'UTC', kind: 'clock', desc: 'Coordinated universal time. Ethereum’s clock does not observe time zones, and neither does this page.' },
  unix: { title: 'UNIX', kind: 'clock', desc: 'Seconds since 1 January 1970 — the timestamp format blocks actually carry.' },
  staked: {
    title: 'STAKED',
    kind: 'daily',
    desc: 'ETH locked by validators as collateral for honest behaviour. Attacking the chain means burning your own stake.',
    metricKey: 'staked_eth',
    format: (v) => `${compact(v, 2)} ETH`,
  },
  validators: {
    title: 'VALIDATORS',
    kind: 'daily',
    desc: 'Independent validators currently attesting. The more there are, the harder censorship becomes.',
    metricKey: 'validators_active',
    format: (v) => compact(v, 2),
  },
  tvs: {
    title: 'TVS',
    kind: 'daily',
    desc: 'Total value secured: what applications and layer 2 networks trust Ethereum to protect.',
    metricKey: 'tvs',
    format: (v) => `$${compact(v, 1)}`,
  },
  asof: { title: 'AS OF', kind: 'info', desc: 'The date of the last daily collection. Historical metrics update once a day at 06:00 UTC; everything else on this page is live.' },
};

function BlockChart({ info }: { info: TickerInfo }) {
  const [, force] = useState(0);
  useEffect(() => blockfeed.subscribe(() => force((n) => n + 1)), []);
  const blocks = blockfeed.getBlocks();
  const values = blocks.map((b) => info.accessor!(b));
  if (values.length < 2) {
    return <p className="micro py-8 text-center">BUFFERING — ONE POINT LANDS PER BLOCK, STAY A MOMENT</p>;
  }
  const W = 420;
  const H = 96;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const bw = W / Math.max(32, values.length);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        {values.map((v, i) => {
          const h = 4 + ((v - min) / span) * (H - 12);
          return (
            <rect
              key={i}
              x={i * bw + 0.5}
              y={H - h}
              width={Math.max(1, bw - 1.5)}
              height={h}
              fill={'var(--ink)'}
              opacity={i === values.length - 1 ? 1 : 0.35}
            />
          );
        })}
      </svg>
      <p className="micro mt-2 flex justify-between text-[color:var(--ink-soft)]">
        <span>LAST {values.length} BLOCKS</span>
        <span className="font-bold text-[color:var(--ink)]">{info.format!(values[values.length - 1]!)}</span>
      </p>
    </div>
  );
}

function DailyChart({ info }: { info: TickerInfo }) {
  const [points, setPoints] = useState<{ date: string; value: number }[] | null>(null);
  useEffect(() => {
    fetch(`/api/metric/${info.metricKey}?range=m`)
      .then((r) => r.json() as Promise<{ points: { date: string; value: number }[] }>)
      .then((d) => setPoints(d.points))
      .catch(() => setPoints([]));
  }, [info.metricKey]);
  if (!points) return <p className="micro py-8 text-center">LOADING…</p>;
  if (points.length < 2)
    return <p className="micro py-8 text-center">THIS SERIES IS STILL ACCUMULATING HISTORY</p>;
  const W = 420;
  const H = 96;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * W).toFixed(1)},${(H - 6 - ((v - min) / span) * (H - 12)).toFixed(1)}`)
    .join('');
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
        <circle
          cx={W}
          cy={H - 6 - ((values[values.length - 1]! - min) / span) * (H - 12)}
          r="3"
          fill="var(--ink)"
        />
      </svg>
      <p className="micro mt-2 flex justify-between text-[color:var(--ink-soft)]">
        <span>MONTHLY · {points[0]!.date} … {points[points.length - 1]!.date}</span>
        {info.format && <span className="font-bold text-[color:var(--ink)]">{info.format(values[values.length - 1]!)}</span>}
      </p>
    </div>
  );
}

function ClockReadout({ engine }: { engine: BeatEngine }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    return engine.onFrame(({ clock }) => {
      if (!ref.current) return;
      const fin = Math.max(0, clock.secondsToFinality);
      ref.current.textContent = `SLOT ${clock.slot} · EPOCH ${clock.epoch} · ${pad2(clock.slotInEpoch + 1)}/32 T+${clock.secondsIntoSlot.toFixed(1)} · FINAL ~${pad2(Math.floor(fin / 60))}:${pad2(Math.floor(fin % 60))}`;
    });
  }, [engine]);
  return (
    <div className="border border-[color:var(--hairline)] px-3 py-3">
      <p ref={ref} className="tick-label tabular-nums text-[color:var(--ink)]" />
      {/* explanatory legend: prose (sentence case), matching the modal body and
          the ExplainChip helper style — the live readout above stays uppercase
          because it is data, not prose */}
      <p className="mt-2 text-xs leading-relaxed text-[color:var(--ink-faint)]">
        The dial: 32 ticks make one epoch, the sweep hand is one slot, and the red tick is now.
      </p>
    </div>
  );
}

interface Props {
  id: string;
  engine: BeatEngine;
  onClose: () => void;
}

export default function TickerModal({ id, engine, onClose }: Props) {
  const info = TICKER_INFO[id.replace(/-(m|c)$/, '')];
  const panelRef = useRef<HTMLDivElement>(null);

  // focus trap + key swallowing while open
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      } else if (['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) {
        e.stopImmediatePropagation(); // the stage must not react while the menu is up
        if (e.key === ' ') e.preventDefault();
      } else if (e.key === 'Tab') {
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>('a, button, [tabindex]');
        if (!focusables?.length) return;
        const list = [...focusables];
        const idx = list.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        list[(idx + (e.shiftKey ? -1 : 1) + list.length) % list.length]!.focus();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      prev?.focus();
    };
  }, [onClose]);

  if (!info) return null;

  const bracket = 'pointer-events-none absolute h-3 w-3 border-[color:var(--ink)]';
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[color:var(--paper)]/85 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${info.title} explained`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto border border-[color:var(--hairline)] bg-[color:var(--paper)] px-6 py-5 outline-none"
      >
        <span className={`${bracket} left-[-1px] top-[-1px] border-l border-t`} />
        <span className={`${bracket} right-[-1px] top-[-1px] border-r border-t`} />
        <span className={`${bracket} bottom-[-1px] left-[-1px] border-b border-l`} />
        <span className={`${bracket} bottom-[-1px] right-[-1px] border-b border-r`} />

        <SectionHeader index="~" title={info.title} subtitle="beat of the number" accent className="mb-4" />

        <p className="mb-4 text-sm leading-relaxed text-[color:var(--ink-soft)]">{info.desc}</p>

        {info.kind === 'block' && <BlockChart info={info} />}
        {info.kind === 'daily' && <DailyChart info={info} />}
        {info.kind === 'clock' && <ClockReadout engine={engine} />}

        <div className="mt-4 flex items-center justify-between">
          {info.kind === 'daily' && info.metricKey ? (
            <a href={`/pulse/${info.metricKey}`} className="micro underline hover:font-bold text-[color:var(--ink)]">
              FULL HISTORY → /PULSE
            </a>
          ) : (
            <span />
          )}
          <button onClick={onClose} className="cmd-chip">
            <kbd>ESC</kbd>
            <span>CLOSE</span>
          </button>
        </div>
      </div>
    </div>
  );
}
