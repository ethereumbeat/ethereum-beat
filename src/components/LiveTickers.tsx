import { useEffect, useRef, useState } from 'react';
import type { BeatEngine } from '../lib/beat';
import { BPM } from '../lib/beat';
import type { Snapshot } from '../lib/metrics';
import { findMetric } from '../lib/metrics';
import { compact, fmtGwei, pad2, truncHex } from '../lib/format';
import type { BlockStats } from '../lib/rpc';
import * as blockfeed from '../lib/blockfeed';
import { lazy, Suspense } from 'react';
const TickerModal = lazy(() => import('./TickerModal'));
import { creditSources } from '../lib/sources';

/**
 * The live periphery. Tier 1 is pure clock maths updated every frame,
 * Tier 2 is one RPC call per slot, Tier 3 comes from the daily snapshot.
 * All values live in fixed-width slots; changes flicker through one frame
 * of scrambled hex, never with layout shift.
 */

interface Props {
  engine: BeatEngine;
  snapshot: Snapshot | null;
  reducedMotion: boolean;
}

const HEXCHARS = '0123456789abcdef';
function scramble(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += HEXCHARS[(Math.random() * 16) | 0];
  return s;
}

function Item({
  label,
  id,
  width,
  refs,
  accent = false,
  onOpen,
}: {
  label: string;
  id: string;
  width: number;
  refs: React.RefObject<Record<string, HTMLSpanElement | null>>;
  accent?: boolean;
  onOpen?: (id: string) => void;
}) {
  const body = (
    <>
      <span className={accent ? 'red-dot' : 'red-dot opacity-40'} />
      <span className="ticker-label">{label}</span>
      <span
        className="ticker-value inline-block tabular-nums"
        // logical property: the fixed slot follows the writing mode, so
        // vertical columns get fixed length, not a bogus horizontal width
        style={{ minInlineSize: `${width}ch` }}
        ref={(el) => void (refs.current[id] = el)}
      >
        —
      </span>
    </>
  );
  if (!onOpen) return <span className="inline-flex items-center gap-2 whitespace-nowrap">{body}</span>;
  return (
    <button
      className="ticker-btn pointer-events-auto inline-flex cursor-pointer items-center gap-2 whitespace-nowrap"
      onClick={() => onOpen(id)}
      aria-label={`${label}: explain this number`}
    >
      {body}
    </button>
  );
}

/**
 * Dynamic source credit: built from metric_meta's source registry plus the
 * live-layer endpoints, so new sources appear without hand-editing.
 */
function SourceCredit({ snapshot, collapsed = false }: { snapshot: Snapshot | null; collapsed?: boolean }) {
  const sources = creditSources(snapshot);
  if (collapsed)
    return (
      <a href="/about#sources" className="micro pointer-events-auto whitespace-nowrap !no-underline text-[color:var(--ink-faint)] hover:font-bold text-[color:var(--ink)]">
        DATA · {sources.length} OPEN SOURCES
      </a>
    );
  return (
    <span className="micro pointer-events-auto whitespace-nowrap text-[color:var(--ink-faint)]">
      <a href="/about#sources" className="!no-underline hover:font-bold text-[color:var(--ink)]">
        DATA
      </a>
      {sources.map((s) => (
        <span key={s.name}>
          {' · '}
          <a href={s.url} className="!no-underline hover:font-bold text-[color:var(--ink)]">
            {s.name}
          </a>
        </span>
      ))}
      {' + '}
      <a href="/about#sources" className="!no-underline hover:font-bold text-[color:var(--ink)]">
        OPEN ENDPOINTS
      </a>
    </span>
  );
}

/**
 * Contact surface (spec §24 / pass 16): a plain underlined mailto sitting next
 * to the source-registry credit. Label in lowercase grotesk, address in the
 * pixel display face (Departure) per the brief. Departure ships a single weight,
 * so legibility comes from a size lift + full ink (not bolding) — the footer
 * micro text is exactly what dilutes first on Linux Chromium.
 */
function ContactCredit() {
  return (
    <span className="pointer-events-auto inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="micro font-grotesk lowercase font-bold text-[color:var(--ink)]">contact</span>
      <a
        href="mailto:beat@ethereumbeat.org"
        className="contact-addr text-[11px] leading-none text-[color:var(--ink)] hover:text-[color:var(--accent)]"
      >
        beat@ethereumbeat.org
      </a>
    </span>
  );
}

export default function LiveTickers({ engine, snapshot, reducedMotion }: Props) {
  const refs = useRef<Record<string, HTMLSpanElement | null>>({});
  const [rpcDead, setRpcDead] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const blockRef = useRef<BlockStats | null>(null);

  // write only when the string changes; optional two-frame hex flicker
  // (scramble, scramble again, settle at 120ms — fixed width, no shift).
  // '-m' / '-c' twins mirror a value into the mobile strip / corner readout.
  const set = (id: string, text: string, flick = false) => {
    for (const key of [id, `${id}-m`, `${id}-c`]) {
      const el = refs.current[key];
      if (!el || el.dataset['v'] === text) continue;
      el.dataset['v'] = text;
      if (flick && !reducedMotion) {
        const n = Math.min(text.length, 14);
        el.textContent = scramble(n);
        setTimeout(() => {
          if (el.dataset['v'] === text) el.textContent = scramble(n);
        }, 60);
        setTimeout(() => {
          if (el.dataset['v'] === text) el.textContent = text;
        }, 120);
      } else {
        el.textContent = text;
      }
    }
  };

  // Tier 1: every frame
  useEffect(() => {
    return engine.onFrame(({ nowMs, clock }) => {
      set('slot', String(clock.slot));
      set('epoch', String(clock.epoch));
      set('slotpos', `${pad2(clock.slotInEpoch)}/32 T+${clock.secondsIntoSlot.toFixed(1)}`);
      const fin = Math.max(0, clock.secondsToFinality);
      set('finality', `~${pad2(Math.floor(fin / 60))}:${pad2(Math.floor(fin % 60))}`);
      const d = new Date(nowMs);
      set('utc', `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`);
      set('unix', String(Math.floor(nowMs / 1000)));
      set(
        'local',
        `${d.getFullYear()} - ${pad2(d.getMonth() + 1)} - ${pad2(d.getDate())} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
      );
    });
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tier 2: the shared per-slot block feed (one poll for the whole page)
  useEffect(() => {
    return blockfeed.subscribe(({ latest, dead }) => {
      setRpcDead(dead);
      if (!latest) return;
      const prev = blockRef.current;
      blockRef.current = latest;
      const changed = !prev || prev.number !== latest.number;
      set('block', String(latest.number), changed);
      set('hash', truncHex(latest.hash, 8, 4), changed);
      // PR C: base fee in gwei is the primary "what it costs now" number;
      // gas-% is a small secondary readout (the disc GAS ring carries the % bar
      // visually, so the peripheral drops the mono-bar and just states the %).
      set('basefee', fmtGwei(latest.baseFeeGwei), changed);
      const pct = latest.gasUsed / latest.gasLimit;
      set('gas', `${Math.round(pct * 100)}%`, false);
      set('tx', String(latest.txCount).padStart(4, ' '), changed);
      set('blobs', String(latest.blobCount), changed);
      set('burned', `${latest.burnedEth.toFixed(4)} ETH`, changed);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tier 3: once, from the snapshot
  useEffect(() => {
    if (!snapshot) return;
    const staked = findMetric(snapshot, 'staked_eth');
    const pct = findMetric(snapshot, 'staked_pct');
    const tvs = findMetric(snapshot, 'tvs');
    const validators = findMetric(snapshot, 'validators_active');
    if (staked)
      set(
        'staked',
        `${compact(staked.latest.value, 2)} ETH${pct ? ` · ${pct.latest.value.toFixed(1)}%` : ''}`,
      );
    if (tvs) set('tvs', `$${compact(tvs.latest.value, 1)}`);
    if (validators) set('validators', compact(validators.latest.value, 2));
    set('asof', snapshot.generated_at.slice(0, 10).replaceAll('-', ' - '));
  }, [snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  // BLOCK lives in the corner readout, BURNED in the bottom bar
  const tier2 = (
    <>
      <Item label="BASEFEE" id="basefee" width={10} refs={refs} onOpen={setOpenId} accent />
      <Item label="GAS" id="gas" width={4} refs={refs} onOpen={setOpenId} />
      <Item label="TX" id="tx" width={4} refs={refs} onOpen={setOpenId} />
      <Item label="BLOBS" id="blobs" width={2} refs={refs} onOpen={setOpenId} />
    </>
  );

  const tier1Left = (
    <>
      <Item label="SLOT" id="slot" width={8} refs={refs} onOpen={setOpenId} accent />
      <Item label="EPOCH" id="epoch" width={6} refs={refs} onOpen={setOpenId} />
      <span className="tall-only inline-flex">
        <Item label="POS" id="slotpos" width={11} refs={refs} onOpen={setOpenId} />
      </span>
      <Item label="FINALITY" id="finality" width={6} refs={refs} onOpen={setOpenId} />
    </>
  );

  const tier3 = (
    <>
      <Item label="STAKED" id="staked" width={16} refs={refs} onOpen={setOpenId} />
      {snapshot && findMetric(snapshot, 'validators_active') && (
        <Item label="VALIDATORS" id="validators" width={7} refs={refs} onOpen={setOpenId} />
      )}
      <Item label="TVS" id="tvs" width={7} refs={refs} onOpen={setOpenId} />
      <Item label="AS OF" id="asof" width={14} refs={refs} onOpen={setOpenId} />
    </>
  );

  return (
    <>
      {/* left margin, rotated like printers' marks — desktop only */}
      <div
        className="pointer-events-none fixed left-3 top-1/2 z-20 hidden -translate-y-1/2 lg:block"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        <div className="flex items-center" style={{ gap: 'clamp(0.375rem, 1.6vh, 1.25rem)' }}>
          <span className="micro font-bold">CONSENSUS //</span>
          {tier1Left}
        </div>
      </div>

      {/* right margin — desktop only */}
      {!rpcDead && (
        <div
          className="pointer-events-none fixed right-3 top-1/2 z-20 hidden -translate-y-1/2 lg:block"
          style={{ writingMode: 'vertical-rl' }}
        >
          <div className="flex items-center" style={{ gap: 'clamp(0.375rem, 1.6vh, 1.25rem)' }}>
            <span className="micro font-bold">EXECUTION //</span>
            {tier2}
          </div>
        </div>
      )}

      {/* top-centre clock — desktop only */}
      <div className="pointer-events-none fixed left-1/2 top-3 z-20 hidden -translate-x-1/2 items-center gap-5 xl:flex">
        <Item label="UTC" id="utc" width={8} refs={refs} onOpen={setOpenId} accent />
        <Item label="UNIX" id="unix" width={10} refs={refs} onOpen={setOpenId} />
        <span className="hidden 2xl:inline-flex">
          <Item label="LOCAL" id="local" width={23} refs={refs} onOpen={setOpenId} />
        </span>
      </div>

      {/* monitor readout, docked to the viewport's top-right corner */}
      <div className="pointer-events-none fixed right-4 top-3 z-20 flex items-center gap-4 lg:right-14">
        <Item label="SLOT" id="slot-c" width={8} refs={refs} onOpen={setOpenId} accent />
        {!rpcDead && <Item label="BLK" id="block-c" width={9} refs={refs} onOpen={setOpenId} />}
        <span className="micro font-bold">{reducedMotion ? 'MOTION OFF' : `${BPM} BPM`}</span>
        {/* staleness: the daily snapshot hasn't refreshed in >26h (is_stale from
            /api/snapshot). Red alert dot + label, the site's existing alert voice. */}
        {snapshot?.is_stale && (
          <span
            className="micro inline-flex items-center gap-1.5 font-bold text-[color:var(--ink)]"
            title="Live data is current; the daily snapshot has not refreshed in over 26 hours"
          >
            <span className="red-dot" />
            STALE
          </span>
        )}
      </div>

      {/* tier-3 strip sits just above the command bar */}
      <div className="fixed inset-x-0 z-20" style={{ bottom: 'calc(34px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Contact lives inline in this row (pass 16). The row is width-tight,
            and the contact plus the full telemetry set overflowed a centred
            `justify-center` strip, clipping the leftmost ticker off-screen at
            every desktop width. To keep the contact inline without clipping,
            the lower-priority live tickers (BURNED, HASH) and the expanded
            source list are dropped here; the source credit stays in its
            collapsed `DATA · N OPEN SOURCES` form. (BURNED/HASH have no other
            desktop home; accepted trade-off to keep a single footer row.) */}
        <div className="hairline-t hidden items-center justify-center gap-4 bg-[color:var(--paper)] px-6 py-2 lg:flex">
          {tier3}
          <SourceCredit snapshot={snapshot} collapsed />
          <ContactCredit />
        </div>
        <div className="hairline-t lg:hidden">
          <div
            className={`flex items-center gap-8 overflow-x-auto bg-[color:var(--paper)] px-4 py-2 ${
              reducedMotion ? '' : 'ticker-strip'
            }`}
          >
            <Item label="SLOT" id="slot-m" width={8} refs={refs} onOpen={setOpenId} accent />
            {!rpcDead && <Item label="BLOCK" id="block-m" width={9} refs={refs} onOpen={setOpenId} />}
            <Item label="UTC" id="utc-m" width={8} refs={refs} onOpen={setOpenId} />
            <Item label="STAKED" id="staked-m" width={16} refs={refs} onOpen={setOpenId} />
            <Item label="TVS" id="tvs-m" width={7} refs={refs} onOpen={setOpenId} />
            <SourceCredit snapshot={snapshot} collapsed />
            <ContactCredit />
          </div>
        </div>
      </div>

      {openId && (
        <Suspense fallback={null}>
          <TickerModal id={openId} engine={engine} onClose={() => setOpenId(null)} />
        </Suspense>
      )}
    </>
  );
}
