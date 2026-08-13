import { type RefObject, useEffect, useRef, useState } from 'react';
import { sharedEngine } from '../lib/beat';
import { slotClock } from '../lib/clock';
import * as blockfeed from '../lib/blockfeed';
import { findMetric, type Snapshot } from '../lib/metrics';
import { pad2 } from '../lib/format';

/**
 * The /ambient wallpaper stage (spec §28.A). One React island drives all ten
 * designs off the same live layer the main site uses: the shared beat engine
 * (12s slot clock + systole pulse), the shared block feed (basefee, blobs), and
 * a one-shot /api/snapshot read for the daily channel metrics.
 *
 * Per-frame work touches ONE element: onFrame writes four CSS custom properties
 * on .amb-root (--amb-scale / --amb-glow / --amb-slot / --amb-sys) and every
 * design reads them in CSS. Discrete values (slot, epoch, basefee, blobs, daily
 * metrics) are React state, updated only on slot boundaries / polls.
 */

export const DESIGN_NAMES = [
  'glyph', 'slot', 'beat', 'ticker', 'stack',
  'grid', 'dial', 'strip', 'console', 'wall',
];
export const DESIGN_COUNT = DESIGN_NAMES.length;

const nf = new Intl.NumberFormat('en-GB');
const fmtInt = (n: number | null | undefined) => (n == null ? '—' : nf.format(Math.round(n)));
const clampDesign = (n: number) => (n < 1 ? 1 : n > DESIGN_COUNT ? DESIGN_COUNT : n);
const wrap = (n: number) => ((n - 1 + DESIGN_COUNT) % DESIGN_COUNT) + 1;

export interface Live {
  slot: number;
  epoch: number;
  basefee: number | null;
  blobs: number | null;
  dead: boolean;
  snap: Snapshot | null;
}

function useAmbientLive(rootRef: RefObject<HTMLDivElement | null>): Live {
  const init = slotClock(Date.now());
  const [live, setLive] = useState<Live>({
    slot: init.slot, epoch: init.epoch, basefee: null, blobs: null, dead: false, snap: null,
  });

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const engine = sharedEngine(reduced);
    const root = rootRef.current;

    const offFrame = engine.onFrame((f) => {
      if (!root) return;
      root.style.setProperty('--amb-scale', f.scale.toFixed(4));
      root.style.setProperty('--amb-glow', f.glow.toFixed(3));
      root.style.setProperty('--amb-slot', (f.clock.secondsIntoSlot / 12).toFixed(4));
      root.style.setProperty('--amb-sys', f.systole ? '1' : '0');
    });
    const offBeat = engine.onBeat((slot) => {
      void blockfeed.poll(slot);
      const c = slotClock(Date.now());
      setLive((p) => ({ ...p, slot: c.slot, epoch: c.epoch }));
    });
    const offFeed = blockfeed.subscribe(({ latest, dead }) =>
      setLive((p) => ({
        ...p,
        basefee: latest?.baseFeeGwei ?? p.basefee,
        blobs: latest?.blobCount ?? p.blobs,
        dead,
      })),
    );
    void blockfeed.poll(slotClock(Date.now()).slot);

    let alive = true;
    fetch('/api/snapshot')
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Snapshot | null) => { if (alive && s) setLive((p) => ({ ...p, snap: s })); })
      .catch(() => {});

    return () => { offFrame(); offBeat(); offFeed(); alive = false; };
  }, [rootRef]);

  return live;
}

// ── the six channel headlines, mixing per-slot live values with daily metrics ──
export interface Channel {
  key: string;
  label: string;
  value: string;
  sub: string;
  spark: number[];
  live: boolean;
}
const SPARK_KEY: Record<string, string> = {
  beat: 'uptime_days', nodes: 'node_countries', blobs: 'blobs_per_block_avg',
  flow: 'throughput', finality: 'participation_rate', layers: 'l2_count',
};
export function channelsOf(live: Live): Channel[] {
  const s = live.snap;
  const m = (k: string) => (s ? findMetric(s, k) : undefined);
  const spark = (k: string) => m(SPARK_KEY[k]!)?.spark ?? [];
  const nc = m('node_countries')?.latest.value;
  const bpb = m('blobs_per_block_avg')?.latest.value;
  const l2 = m('l2_count')?.latest.value;
  return [
    { key: 'beat', label: 'beat', value: fmtInt(live.slot), sub: 'slot', spark: spark('beat'), live: true },
    { key: 'nodes', label: 'nodes', value: fmtInt(nc), sub: 'countries', spark: spark('nodes'), live: false },
    {
      key: 'blobs', label: 'blobs',
      value: live.blobs != null ? String(live.blobs) : bpb != null ? bpb.toFixed(1) : '—',
      sub: 'per block', spark: spark('blobs'), live: live.blobs != null,
    },
    {
      key: 'flow', label: 'flow',
      value: live.basefee != null ? live.basefee.toFixed(2) : '—',
      sub: 'gwei', spark: spark('flow'), live: live.basefee != null,
    },
    { key: 'finality', label: 'finality', value: fmtInt(live.epoch), sub: 'epoch', spark: spark('finality'), live: true },
    { key: 'layers', label: 'layers', value: fmtInt(l2), sub: 'L2s', spark: spark('layers'), live: false },
  ];
}

// ── the faceted ETH glyph (generic octahedron, not an official lockup) ─────────
const FACETS: { p: string; o: number }[] = [
  { p: '127.9,0 127.9,152.9 255.9,212.3', o: 0.95 },
  { p: '127.9,0 0,212.3 127.9,152.9', o: 0.62 },
  { p: '127.9,288 255.9,212.3 127.9,152.9', o: 1 },
  { p: '127.9,288 127.9,152.9 0,212.3', o: 0.78 },
  { p: '127.9,416.9 127.9,312.2 255.9,236.6', o: 0.9 },
  { p: '127.9,416.9 0,236.6 127.9,312.2', o: 0.6 },
];
export function AmbGlyph() {
  return (
    <svg viewBox="0 0 255.9 416.9" aria-hidden="true">
      <g className="amb-glyph">
        <ellipse
          className="amb-glyph-halo"
          cx="127.9" cy="208" rx="150" ry="170"
          fill="var(--amb-red-lg)"
          style={{ filter: 'blur(34px)' }}
        />
        {FACETS.map((f, i) => (
          <polygon key={i} points={f.p} fill="var(--amb-fg)" opacity={f.o} />
        ))}
      </g>
    </svg>
  );
}

// ── design 1 · glyph — the uncluttered one ────────────────────────────────────
function Design1({ live }: { live: Live }) {
  return (
    <div className="amb-1">
      <AmbGlyph />
      <div className="amb-1-slot">
        <div className="amb-label">slot</div>
        <div className="amb-data">{fmtInt(live.slot)}</div>
      </div>
    </div>
  );
}

function renderDesign(design: number, live: Live) {
  switch (design) {
    case 1:
      return <Design1 live={live} />;
    default:
      // designs 2–10 land in the next commit (spec §28.A)
      return <Design1 live={live} />;
  }
}

interface Props {
  design: number;
  interactive?: boolean;
}
export default function AmbientStage({ design: initial, interactive = false }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const live = useAmbientLive(rootRef);
  const [design, setDesign] = useState(clampDesign(initial));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); setDesign((d) => wrap(d + 1)); setCopied(false); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setDesign((d) => wrap(d - 1)); setCopied(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive]);

  const copyLink = () => {
    void navigator.clipboard
      ?.writeText(`${location.origin}/ambient/${design}`)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  return (
    <div className="amb-root" ref={rootRef} data-design={design}>
      <div className="amb-field" aria-hidden="true" />
      <div className="amb-scan" aria-hidden="true" />
      {renderDesign(design, live)}
      {interactive && (
        <div className="amb-hud">
          <span className="amb-hud-arrows" aria-hidden="true">← →</span>
          <span>
            design <b>{pad2(design)}</b> / {pad2(DESIGN_COUNT)} · <b>{DESIGN_NAMES[design - 1]}</b>
          </span>
          <button type="button" onClick={copyLink} className={copied ? 'amb-copied' : ''}>
            {copied ? 'link copied ✓' : 'copy wallpaper link'}
          </button>
        </div>
      )}
    </div>
  );
}
