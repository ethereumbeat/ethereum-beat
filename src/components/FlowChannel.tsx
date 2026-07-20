import { useEffect, useMemo, useRef, useState } from 'react';
import { sharedEngine } from '../lib/beat';
import { slotClock } from '../lib/clock';
import * as blockfeed from '../lib/blockfeed';
import * as mempool from '../lib/mempool';
import { fetchLatestBlockFull } from '../lib/rpc';
import ShareButton from './ShareButton';
import ExplainChip from './ExplainChip';
import CropsBadge from './CropsBadge';

/**
 * Channel 4 — FLOW v2: the waterfall with meaning. Pending lines arrive
 * amber from the persistent mempool stream; when a block seals, this
 * session's hashes flip to a phosphor INCLUDED tick with a type badge and
 * value — the mempool's promise being kept, live. Sealed blocks interrupt
 * as inverted panels with a real barcode. Wide desktops get two columns;
 * seals span both.
 */

const MAX_LINES = 160;
const FILTERS = ['all', 'value', 'blobs', 'contracts'] as const;
type Filter = (typeof FILTERS)[number];

interface Line {
  id: number;
  kind: 'tx' | 'seal';
  hash?: string;
  time?: string;
  status?: 'pending' | 'included';
  cls?: 'TRANSFER' | 'CONTRACT' | 'BLOB';
  valueEth?: number;
  // seal fields
  text?: string;
  pct?: number;
  sealHash?: string;
}

/** decorative barcode from real bytes: bar widths follow the hash nibbles */
function Barcode({ hex, invert = false }: { hex: string; invert?: boolean }) {
  const nibbles = hex.replace(/^0x/, '').slice(0, 36);
  let x = 0;
  const bars: { x: number; w: number }[] = [];
  for (const c of nibbles) {
    const w = (parseInt(c, 16) % 3) + 1;
    bars.push({ x, w });
    x += w + 1;
  }
  return (
    <svg width={x} height="10" viewBox={`0 0 ${x} 10`} className="inline-block flex-none align-middle" aria-hidden="true">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y="0" width={b.w} height="10" fill={invert ? 'var(--paper)' : 'var(--ink)'} opacity="0.85" />
      ))}
    </svg>
  );
}

function badge(cls: Line['cls']): string {
  return cls === 'BLOB' ? 'BLOB' : cls === 'CONTRACT' ? 'CNTRC' : 'TRNSF';
}

export default function FlowChannel() {
  const reducedMotion = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const engine = useMemo(() => sharedEngine(reducedMotion), [reducedMotion]);
  const [lines, setLines] = useState<Line[]>([]);
  const [seen, setSeen] = useState(0);
  const [included, setIncluded] = useState(0);
  const [wsState, setWsState] = useState<'connecting' | 'live' | 'down'>('connecting');
  const [header, setHeader] = useState({ baseFee: '—', fullness: '—' });
  const [filter, setFilter] = useState<Filter>('all');
  const [rate, setRate] = useState({ current: 0, spark: [] as number[] });
  const idRef = useRef(0);
  const holdRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const batchRef = useRef<Line[]>([]);
  const rateBuckets = useRef<number[]>(Array.from({ length: 60 }, () => 0));
  const lastSecond = useRef(Math.floor(Date.now() / 1000));

  const push = (line: Omit<Line, 'id'>) => {
    batchRef.current.push({ ...line, id: idRef.current++ });
  };

  // one rAF loop: batch log flushes + per-second rate buckets
  useEffect(() => {
    void blockfeed.poll(slotClock(Date.now()).slot);
    const offBeat = engine.onBeat((slot) => void blockfeed.poll(slot));
    const offFrame = engine.onFrame(() => {
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== lastSecond.current) {
        for (let s = lastSecond.current + 1; s <= sec; s++) rateBuckets.current[s % 60] = 0;
        lastSecond.current = sec;
        const b = rateBuckets.current;
        const last5 = [1, 2, 3, 4, 5].reduce((a, i) => a + (b[(sec - i + 60) % 60] ?? 0), 0) / 5;
        setRate({ current: last5, spark: Array.from({ length: 60 }, (_, i) => b[(sec - 59 + i + 120) % 60] ?? 0) });
      }
      if (!batchRef.current.length) return;
      const add = batchRef.current;
      batchRef.current = [];
      setSeen((n) => n + add.filter((l) => l.kind === 'tx').length);
      setLines((cur) => [...cur, ...add].slice(-MAX_LINES));
    });
    return () => {
      offBeat();
      offFrame();
    };
  }, [engine]);

  // pending stream (persistent singleton)
  useEffect(() => {
    mempool.start();
    const offState = mempool.onState((st) => setWsState(st === 'idle' ? 'connecting' : st));
    const offPending = mempool.onPending((h, at) => {
      const bucket = Math.floor(at / 1000) % 60;
      rateBuckets.current[bucket] = (rateBuckets.current[bucket] ?? 0) + 1;
      pendingSetRef.current.add(h);
      push({ kind: 'tx', hash: h, time: new Date(at).toISOString().slice(11, 23), status: 'pending' });
    });
    return () => {
      offState();
      offPending();
    };
  }, []);

  // seal: fetch the full block, mark this session's inclusions, interrupt
  const lastBlockRef = useRef(0);
  const pendingSetRef = useRef(new Set<string>());
  useEffect(() => {
    return blockfeed.subscribe(({ latest }) => {
      if (!latest || latest.number === lastBlockRef.current) return;
      lastBlockRef.current = latest.number;
      const pct = Math.round((latest.gasUsed / latest.gasLimit) * 100);
      setHeader({ baseFee: `${latest.baseFeeGwei.toFixed(2)} GWEI`, fullness: `${pct}%` });
      void fetchLatestBlockFull().then((full) => {
        if (!full) return;
        const byHash = new Map(full.txs.map((t) => [t.hash, t]));
        // count against the session's pending set BEFORE the lazy state
        // updater runs (counting inside it reads back as zero)
        const matched = [...pendingSetRef.current].filter((h) => byHash.has(h));
        if (!matched.length) return;
        for (const h of matched) pendingSetRef.current.delete(h);
        setIncluded((n) => n + matched.length);
        setLines((cur) =>
          cur.map((l) => {
            if (l.kind !== 'tx' || !l.hash || l.status === 'included') return l;
            const t = byHash.get(l.hash);
            if (!t) return l;
            return { ...l, status: 'included' as const, cls: t.cls, valueEth: t.valueEth };
          }),
        );
      });
      push({
        kind: 'seal',
        text: `BLOCK ${latest.number} · ${latest.txCount} TXS · ${pct}% FULL · ${latest.blobCount} BLOBS`,
        pct: pct / 100,
        sealHash: latest.hash,
      });
    });
  }, []);

  // auto-scroll unless held
  useEffect(() => {
    if (holdRef.current) return;
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // F cycles the filters
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'f') setFilter((f) => FILTERS[(FILTERS.indexOf(f) + 1) % FILTERS.length]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visible = lines.filter((l) => {
    if (l.kind === 'seal' || filter === 'all') return true;
    if (filter === 'value') return (l.valueEth ?? 0) > 0;
    if (filter === 'blobs') return l.cls === 'BLOB';
    return l.cls === 'CONTRACT';
  });

  const stats = [
    { label: 'PENDING SEEN', value: String(seen) },
    { label: 'INCLUDED · SESSION', value: String(included), ok: included > 0 },
    { label: 'BASE FEE', value: header.baseFee },
    { label: 'LAST BLOCK', value: header.fullness },
    { label: 'STREAM', value: wsState === 'live' ? 'MEMPOOL · LIVE' : wsState.toUpperCase() },
  ];

  const maxSpark = Math.max(1, ...rate.spark);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-3 lg:grid-cols-[240px_1fr] lg:grid-rows-1">
      {/* LEFT: the stats as stacked big numbers, leaders pointing at the stream */}
      <div className="flex flex-row flex-wrap items-start gap-x-8 gap-y-4 lg:flex-col lg:gap-7 lg:pt-2">
        {[
          { label: 'TX/S · MEMPOOL', value: `${rate.current.toFixed(1)}`, extra: 'spark', hot: true },
          { label: 'BASE FEE · GWEI', value: header.baseFee.replace(' GWEI', '') },
          { label: 'LAST BLOCK FULL', value: header.fullness },
          { label: 'INCLUDED · SESSION', value: String(included), ok: included > 0 },
          { label: 'PENDING SEEN', value: String(seen) },
        ].map((st) => (
          <div key={st.label} className="relative">
            <p className={`font-display leading-none tabular-nums ${st.ok ? 'text-[color:var(--ok)]' : st.hot ? 'text-[color:var(--accent)]' : ''}`} style={{ fontSize: 'clamp(1.6rem, 2.6vw, 2.6rem)' }}>
              {st.value}
            </p>
            <p className="micro mt-1">{st.label}</p>
            {st.extra === 'spark' && (
              <svg viewBox="0 0 120 16" className="mt-1 block h-4 w-32" aria-hidden="true">
                {rate.spark.map((v, i) => (
                  <rect key={i} x={i * 2} y={16 - (v / maxSpark) * 14 - 1} width="1.4" height={(v / maxSpark) * 14 + 1} fill="var(--ink)" opacity="0.6" />
                ))}
              </svg>
            )}
            {/* elbow leader toward the stream */}
            <svg className="absolute -right-7 top-2 hidden h-4 w-6 lg:block" viewBox="0 0 24 16" aria-hidden="true">
              <path d="M0,8 L14,8 L14,2 L24,2" fill="none" stroke="var(--hairline)" strokeWidth="1" />
            </svg>
          </div>
        ))}
        <p className={`micro ${wsState === 'live' ? 'font-bold !text-[color:var(--ok)]' : ''}`}>
          {wsState === 'live' ? '● MEMPOOL LIVE' : wsState.toUpperCase()}
        </p>
      </div>

      {/* RIGHT: filters + the waterfall (single column, no table lines) */}
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-none flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`cmd-chip ${filter === f ? 'cmd-active' : ''}`}>
              <span>{f.toUpperCase()}</span>
            </button>
          ))}
          <span className="micro text-[color:var(--ink-faint)]">F CYCLES</span>
          <span className="grow" />
          <CropsBadge category="openness" context="The mempool: anyone's transaction, no gatekeeper" />
          <ExplainChip
            title="The flow"
            text={[
              'Every amber line is a real transaction waiting to be included, streamed the moment a node hears about it. When one of them lands in a block, it flips to a green INCLUDED tick with its type and value: the mempool’s promise being kept, live.',
              'Roughly every 12 seconds a block seals a batch — the inverted interrupts. TRNSF moves ETH, CNTRC calls a contract, BLOB carries layer 2 data.',
            ]}
          />
          <ShareButton
            compact
            data={{
              value: header.baseFee,
              label: 'Base fee now',
              index: '_04',
              url: `${typeof location !== 'undefined' ? location.origin : ''}/flow`,
              motif: '4',
            }}
          />
        </div>

        <div
          ref={logRef}
          className="mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1"
          style={{ viewTransitionName: 'stage-core' }}
          onMouseEnter={() => (holdRef.current = true)}
          onMouseLeave={() => {
            holdRef.current = false;
            const el = logRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          aria-live="off"
        >
          {visible.length === 0 && <p className="micro py-8 text-center">OPENING THE STREAM…</p>}
          {visible.map((l) =>
            l.kind === 'seal' ? (
              <div key={l.id} className="invert my-1.5 flex items-center gap-3 px-2 py-1.5">
                {l.sealHash && <Barcode hex={l.sealHash} invert />}
                <span aria-hidden="true" className="whitespace-nowrap font-mono text-[11px] font-bold tabular-nums text-[color:var(--accent)]">■</span>
                <span className="whitespace-nowrap font-mono text-[11px] font-bold tabular-nums">{l.text}</span>
                {l.pct !== undefined && (
                  <span className="ml-auto hidden h-2 w-32 border border-[color:var(--paper)] sm:block">
                    <span className="block h-full bg-[color:var(--paper)] opacity-80" style={{ width: `${Math.round(l.pct * 100)}%` }} />
                  </span>
                )}
              </div>
            ) : (
              <p
                key={l.id}
                className="whitespace-nowrap font-mono text-[11px] leading-relaxed tabular-nums"
                style={{
                  opacity: l.status === 'included' ? Math.min(1, 0.82 + Math.log10(1 + (l.valueEth ?? 0)) * 0.3) : 0.85,
                }}
              >
                <span className="text-[color:var(--ink-soft)]">{l.time}</span>{' '}
                <span className="text-[color:var(--ink-soft)]">{l.hash?.slice(0, 34)}…</span>{' '}
                {l.status === 'included' ? (
                  <>
                    <span className="font-bold text-[color:var(--ok)]">✓ INCLUDED</span>{' '}
                    <span className={l.cls === 'BLOB' ? 'font-bold text-[color:var(--warn)]' : 'text-[color:var(--ink)]'}>
                      {badge(l.cls)}
                    </span>
                    {(l.valueEth ?? 0) > 0 && (
                      <span className="font-bold text-[color:var(--ink)]"> {l.valueEth!.toFixed(l.valueEth! < 0.01 ? 5 : 3)} ETH</span>
                    )}
                  </>
                ) : (
                  <span className="font-bold text-[color:var(--warn)]">PENDING</span>
                )}
              </p>
            ),
          )}
        </div>
        <p className="micro mt-1.5 flex-none text-[color:var(--ink-faint)]">
          AMBER = WAITING · GREEN = KEPT PROMISE · INVERTED = SEALED BLOCK
        </p>
      </div>
    </div>
  );
}
