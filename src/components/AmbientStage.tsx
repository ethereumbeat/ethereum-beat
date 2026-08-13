import { type ReactElement, type RefObject, useEffect, useRef, useState } from 'react';
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
      .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : null))
      .then((s) => { if (alive && s) setLive((p) => ({ ...p, snap: s })); })
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

// normalized 1px sparkline (grid / strip / wall)
function Spark({ data, w = 120, h = 28 }: { data: number[]; w?: number; h?: number }) {
  if (!data || data.length < 2) return <svg viewBox={`0 0 ${w} ${h}`} className="amb-spark" aria-hidden="true" />;
  const min = Math.min(...data);
  const span = Math.max(...data) - min || 1;
  const pts = data
    .map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="amb-spark" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--amb-red)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// slot-synced sweep circle: one turn per 12s slot via --amb-slot (r=46, C≈289)
function SweepRing({ r = 46, cls }: { r?: number; cls: string }) {
  const c = 2 * Math.PI * r;
  return (
    <>
      <circle cx="50" cy="50" r={r} className={`${cls}-track`} />
      <circle
        cx="50" cy="50" r={r} className={`${cls}-fill`}
        style={{ strokeDasharray: c, strokeDashoffset: `calc(${c}px * (1 - var(--amb-slot)))` }}
      />
    </>
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

// ── design 2 · slot — glyph + 12s countdown ring + slot number ────────────────
function Design2({ live }: { live: Live }) {
  return (
    <div className="amb-2">
      <div className="amb-2-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true"><SweepRing cls="amb-2" /></svg>
        <div className="amb-2-glyph"><AmbGlyph /></div>
      </div>
      <div className="amb-2-read">
        <div className="amb-label">slot</div>
        <div className="amb-data">{fmtInt(live.slot)}</div>
      </div>
    </div>
  );
}

// ── design 3 · beat — procedural EKG line across the bottom, kicking each slot ─
function ekgPoints(): string {
  const seg = 150;
  const reps = 9;
  const pts: string[] = [];
  for (let r = 0; r < reps; r++) {
    const x = r * seg;
    pts.push(
      `${x},50`, `${x + 70},50`, `${x + 80},44`, `${x + 86},56`,
      `${x + 92},20`, `${x + 98},82`, `${x + 104},40`, `${x + 112},50`, `${x + seg},50`,
    );
  }
  return pts.join(' ');
}
function Design3() {
  return (
    <div className="amb-3">
      <svg viewBox="0 0 1200 100" preserveAspectRatio="none" className="amb-3-svg" aria-hidden="true">
        <line x1="0" y1="50" x2="1200" y2="50" className="amb-3-base" />
        <g className="amb-3-scroll">
          <polyline points={ekgPoints()} fill="none" stroke="var(--amb-red)" className="amb-3-line" />
        </g>
      </svg>
      <div className="amb-3-tag amb-label">65 bpm · one beat per slot</div>
    </div>
  );
}

// ── design 4 · ticker — bottom marquee of the six channel headlines ───────────
function Design4({ live }: { live: Live }) {
  const ch = channelsOf(live);
  const seq = [...ch, ...ch];
  return (
    <div className="amb-4">
      <div className="amb-4-track">
        {seq.map((c, i) => (
          <span key={i} className="amb-4-item">
            <span className="amb-label">{c.label}</span>
            <span className="amb-data">{c.value}</span>
            <span className="amb-4-sub amb-label">{c.sub}</span>
            <span className="amb-4-dot">/</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── design 5 · stack — right-corner column of six channels ────────────────────
function Design5({ live }: { live: Live }) {
  return (
    <div className="amb-5">
      {channelsOf(live).map((c) => (
        <div key={c.key} className="amb-5-row">
          <span className="amb-label">{c.label}</span>
          <span className="amb-data">
            {c.value}<span className="amb-5-sub amb-label">{c.sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ── design 6 · grid — 3×2 tile cluster with sparklines ────────────────────────
function Design6({ live }: { live: Live }) {
  return (
    <div className="amb-6">
      {channelsOf(live).map((c) => (
        <div key={c.key} className="amb-6-cell">
          <div className="amb-label">{c.label}</div>
          <div className="amb-data amb-6-val">{c.value}</div>
          <Spark data={c.spark} />
          <div className="amb-6-sub amb-label">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── design 7 · dial — one hero channel as a big slot-synced gauge ─────────────
function Design7({ live }: { live: Live }) {
  const ch = channelsOf(live);
  return (
    <div className="amb-7">
      <div className="amb-7-dial">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <SweepRing r={44} cls="amb-7" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
            return (
              <line
                key={i} className="amb-7-tick"
                x1={(50 + Math.cos(a) * 38).toFixed(2)} y1={(50 + Math.sin(a) * 38).toFixed(2)}
                x2={(50 + Math.cos(a) * 44).toFixed(2)} y2={(50 + Math.sin(a) * 44).toFixed(2)}
              />
            );
          })}
        </svg>
        <div className="amb-7-center">
          <div className="amb-label">slot</div>
          <div className="amb-data amb-7-big">{fmtInt(live.slot)}</div>
          <div className="amb-label amb-7-epoch">epoch {fmtInt(live.epoch)}</div>
        </div>
      </div>
      <div className="amb-7-side">
        {ch.slice(1).map((c) => (
          <div key={c.key} className="amb-7-read">
            <span className="amb-label">{c.label}</span>
            <span className="amb-data">{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── design 8 · strip — full-height left rail, six channels + sparklines ───────
function Design8({ live }: { live: Live }) {
  return (
    <div className="amb-8">
      {channelsOf(live).map((c) => (
        <div key={c.key} className="amb-8-row">
          <div className="amb-8-head">
            <span className="amb-label">{c.label}</span>
            <span className="amb-data">{c.value}</span>
          </div>
          <Spark data={c.spark} w={200} h={34} />
          <span className="amb-8-sub amb-label">{c.sub}</span>
        </div>
      ))}
    </div>
  );
}

// ── design 9 · console — terminal side panel, scrolling slot log ──────────────
function Design9({ live }: { live: Live }) {
  const ch = channelsOf(live);
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    setLog((prev) =>
      [...prev, `slot ${live.slot} · ${live.basefee != null ? live.basefee.toFixed(2) : '—'} gwei · ${live.blobs ?? '—'} blobs`].slice(-9),
    );
  }, [live.slot, live.basefee, live.blobs]);
  return (
    <div className="amb-9">
      <div className="amb-9-head amb-label">ethereum · slot events</div>
      <div className="amb-9-log">
        {log.map((l, i) => (
          <div key={i} className="amb-9-line"><span className="amb-9-caret amb-red">›</span> {l}</div>
        ))}
        <div className="amb-9-line"><span className="amb-9-cursor amb-red">█</span></div>
      </div>
      <div className="amb-9-reads">
        {ch.map((c) => (
          <div key={c.key} className="amb-9-read">
            <span className="amb-label">{c.label}</span>
            <span className="amb-data">{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── design 10 · wall — the maximal one: full data wall on a side ──────────────
function Design10({ live }: { live: Live }) {
  return (
    <div className="amb-10">
      <div className="amb-10-top">
        <div className="amb-10-clock">
          <span className="amb-label">slot</span>
          <span className="amb-data amb-10-slot">{fmtInt(live.slot)}</span>
          <span className="amb-label">epoch {fmtInt(live.epoch)}</span>
        </div>
        <div className="amb-10-glyph"><AmbGlyph /></div>
      </div>
      <div className="amb-10-grid">
        {channelsOf(live).map((c) => (
          <div key={c.key} className="amb-10-cell">
            <div className="amb-label">{c.label}</div>
            <div className="amb-data amb-10-val">{c.value}</div>
            <Spark data={c.spark} w={220} h={40} />
            <div className="amb-10-sub amb-label">{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DESIGNS: Record<number, (p: { live: Live }) => ReactElement> = {
  1: Design1, 2: Design2, 3: () => <Design3 />, 4: Design4, 5: Design5,
  6: Design6, 7: Design7, 8: Design8, 9: Design9, 10: Design10,
};
function renderDesign(design: number, live: Live) {
  const D = DESIGNS[design] ?? Design1;
  return <D live={live} />;
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
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (setup) setSetup(false); // modal owns Esc while open
        else location.href = '/'; // otherwise Esc exits to the main site
        return;
      }
      if (setup) return; // freeze cycling while the setup modal is open
      if (e.key === 'ArrowRight') { e.preventDefault(); setDesign((d) => wrap(d + 1)); setCopied(false); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setDesign((d) => wrap(d - 1)); setCopied(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive, setup]);

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
          <button type="button" className="amb-hud-exit" onClick={() => (location.href = '/')}>
            esc · exit
          </button>
          <span className="amb-hud-arrows" aria-hidden="true">← →</span>
          <span>
            design <b>{pad2(design)}</b> / {pad2(DESIGN_COUNT)} · <b>{DESIGN_NAMES[design - 1]}</b>
          </span>
          <button type="button" onClick={copyLink} className={copied ? 'amb-copied' : ''}>
            {copied ? 'link copied ✓' : 'copy wallpaper link'}
          </button>
          <button type="button" onClick={() => setSetup(true)}>wallpaper setup</button>
        </div>
      )}

      {interactive && setup && (
        <div className="amb-modal-scrim" onClick={() => setSetup(false)}>
          <div
            className="amb-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Wallpaper setup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="amb-modal-head">
              <p className="amb-modal-kicker">ethereum beat · ambient</p>
              <p className="amb-modal-title">wallpaper setup</p>
              <button type="button" className="amb-modal-x" onClick={() => setSetup(false)} aria-label="Close">
                esc ✕
              </button>
            </div>
            <ol className="amb-modal-steps">
              <li>
                <span className="amb-modal-n">1</span>
                <span>Install <b>Plash</b> — a free desktop-wallpaper app on the Mac App Store.</span>
              </li>
              <li>
                <span className="amb-modal-n">2</span>
                <span>
                  Pick a design here, then hit <span className="amb-modal-code">copy wallpaper link</span> — it
                  copies an <span className="amb-modal-code">/ambient/N</span> URL.
                </span>
              </li>
              <li>
                <span className="amb-modal-n">3</span>
                <span>Paste that URL into Plash as the website to show.</span>
              </li>
              <li>
                <span className="amb-modal-n">4</span>
                <span>Use Plash&apos;s <b>Browsing Mode</b> to preview, then <b>lock</b> it as your wallpaper.</span>
              </li>
              <li>
                <span className="amb-modal-n">5</span>
                <span>Optionally set a <b>reload interval</b> in Plash for a periodic refresh.</span>
              </li>
            </ol>
            <p className="amb-modal-note">
              The 12-second live pulse keeps running on its own — the wallpaper stays live without a reload.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
