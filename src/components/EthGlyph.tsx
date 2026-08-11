import { useEffect, useMemo, useRef } from 'react';
import type { BeatEngine } from '../lib/beat';
import { SLOTS_PER_EPOCH } from '../lib/clock';
import * as blockfeed from '../lib/blockfeed';

/**
 * The disc is an instrument dial, not a backdrop:
 * - EPOCH RING: 32 ticks, one per slot, filling as the epoch progresses;
 *   the current slot's tick is red and longer, all clear at a new epoch
 * - SLOT SWEEP: a hairline second-hand completes one turn per 12s slot
 * - GAS ARC: bottom-left segment whose length is the last block's gas use
 * - FINAL notch: finality trails the head by 2 epochs — two full turns of
 *   this dial — marked on the inner track at the equivalent angle
 * The generic octahedron glyph (not an official lockup) sits inside, its two
 * halves pulsing 60ms apart.
 */

const CX = 500;
const CY = 500;

const TOP_FACETS = [
  { points: '127.9,0 127.9,152.9 255.9,212.3', opacity: 0.36 },
  { points: '127.9,0 0,212.3 127.9,152.9', opacity: 0.22 },
  { points: '127.9,288 255.9,212.3 127.9,152.9', opacity: 0.52 },
  { points: '127.9,288 127.9,152.9 0,212.3', opacity: 0.3 },
];
const BOTTOM_FACETS = [
  { points: '127.9,416.9 127.9,312.2 255.9,236.6', opacity: 0.36 },
  { points: '127.9,416.9 0,236.6 127.9,312.2', opacity: 0.22 },
];



/** slot i's angle: slot 0 at 12 o'clock, clockwise (radians) */
function slotAngle(i: number): number {
  return (i / SLOTS_PER_EPOCH) * Math.PI * 2 - Math.PI / 2;
}

function radial(angle: number, r: number): [number, number] {
  return [CX + Math.cos(angle) * r, CY + Math.sin(angle) * r];
}

/** SVG arc path between two angles at radius r (clockwise, y-down) */
function arcPath(a0: number, a1: number, r: number): string {
  const [x0, y0] = radial(a0, r);
  const [x1, y1] = radial(a1, r);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

export interface EthGlyphHandles {
  top: SVGGElement | null;
  bottom: SVGGElement | null;
  glow: SVGCircleElement | null;
}

interface Props {
  handles: EthGlyphHandles;
  engine: BeatEngine;
  /** staked share of supply, 0..100, from the snapshot */
  stakePct?: number | null;
}

/** near-full ring starting at 12 o'clock, drawn clockwise */
const RING_A0 = -Math.PI / 2 + 0.02;
const RING_A1 = RING_A0 + Math.PI * 2 - 0.04;
const MAX_BLOBS = 21; // beacon spec BLOB_SCHEDULE, epoch 419072+ (target 14)

async function fetchParticipation(): Promise<number | null> {
  try {
    const res = await fetch('https://ethereum-beacon-api.publicnode.com/eth/v2/beacon/blocks/head', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { data?: { message?: { body?: { sync_aggregate?: { sync_committee_bits: string } } } } };
    const bits = d.data?.message?.body?.sync_aggregate?.sync_committee_bits?.slice(2);
    if (!bits) return null;
    let n = 0;
    for (const c of bits) n += (parseInt(c, 16).toString(2).match(/1/g) ?? []).length;
    return n / 512;
  } catch {
    return null;
  }
}

export default function EthGlyph({ handles, engine, stakePct }: Props) {
  const ringRef = useRef<SVGGElement>(null);
  const sweepRef = useRef<SVGGElement>(null);
  const epochTextRef = useRef<SVGTextElement>(null);
  const gasRingRef = useRef<SVGPathElement>(null);
  const gasTextRef = useRef<SVGTextPathElement>(null);
  const blobGroupRef = useRef<SVGGElement>(null);
  const blobTextRef = useRef<SVGTextPathElement>(null);
  const partRingRef = useRef<SVGPathElement>(null);
  const partTextRef = useRef<SVGTextPathElement>(null);
  const stakeRingRef = useRef<SVGPathElement>(null);
  const finalNotchRef = useRef<SVGLineElement>(null);
  const finalLeaderRef = useRef<SVGLineElement>(null);
  const finalTextRef = useRef<SVGTextElement>(null);
  const lastSlotRef = useRef(-1);

  // dial state: sweep every frame, ring/final once per slot
  useEffect(() => {
    return engine.onFrame(({ clock }) => {
      const sweep = sweepRef.current;
      if (sweep) {
        const deg = (clock.secondsIntoSlot / 12) * 360;
        sweep.setAttribute('transform', `rotate(${deg.toFixed(2)} ${CX} ${CY})`);
      }
      if (clock.slot === lastSlotRef.current) return;
      lastSlotRef.current = clock.slot;

      const ring = ringRef.current;
      if (ring) {
        const ticks = ring.children;
        for (let i = 0; i < ticks.length; i++) {
          const t = ticks[i] as SVGLineElement;
          if (i === clock.slotInEpoch) {
            t.setAttribute('stroke', 'var(--accent)');
            t.setAttribute('stroke-width', '5');
            t.setAttribute('opacity', '1');
            t.setAttribute('x1', t.dataset['lx1']!);
            t.setAttribute('y1', t.dataset['ly1']!);
          } else if (i < clock.slotInEpoch) {
            t.setAttribute('stroke', 'var(--ink)');
            t.setAttribute('stroke-width', '2.5');
            t.setAttribute('opacity', '0.9');
            t.setAttribute('x1', t.dataset['x1']!);
            t.setAttribute('y1', t.dataset['y1']!);
          } else {
            t.setAttribute('stroke', 'var(--ink)');
            t.setAttribute('stroke-width', '1');
            t.setAttribute('opacity', '0.18');
            t.setAttribute('x1', t.dataset['x1']!);
            t.setAttribute('y1', t.dataset['y1']!);
          }
        }
      }
      if (epochTextRef.current) {
        epochTextRef.current.textContent = `EPOCH ${clock.epoch} · SLOT ${String(clock.slotInEpoch + 1).padStart(2, '0')}/32`;
      }

      // FINAL trails the head by 2 epochs = exactly two turns of this dial:
      // same angle, inner track
      const a = slotAngle(clock.slotInEpoch);
      const notch = finalNotchRef.current;
      if (notch) {
        const [x1, y1] = radial(a, 404);
        const [x2, y2] = radial(a, 424);
        notch.setAttribute('x1', x1.toFixed(1));
        notch.setAttribute('y1', y1.toFixed(1));
        notch.setAttribute('x2', x2.toFixed(1));
        notch.setAttribute('y2', y2.toFixed(1));
      }
      // label lives outside the ring so it never collides with the numeral
      const label = finalTextRef.current;
      const leader = finalLeaderRef.current;
      if (label) {
        const [lx, ly] = radial(a, 498);
        // in the top strip the epoch readout owns the line at y≈5..26;
        // lift the label above it there so the two never overlap
        const topBand = ly < 40;
        const end = lx < CX;
        label.setAttribute('x', (lx + (end ? -6 : 6)).toFixed(1));
        label.setAttribute('y', topBand ? '-6' : (ly + 3).toFixed(1));
        label.setAttribute('text-anchor', end ? 'end' : 'start');
        // safe area (pass 10b): clamp the rendered box back inside the
        // viewport — the svg overflows visibly, so near 3/9 o'clock the
        // label can otherwise leave the screen on narrow viewports
        const ctm = label.getScreenCTM();
        if (ctm) {
          const box = label.getBoundingClientRect();
          const pad = 8;
          let dx = 0;
          if (box.right > window.innerWidth - pad) dx = window.innerWidth - pad - box.right;
          else if (box.left < pad) dx = pad - box.left;
          if (dx !== 0) {
            label.setAttribute('x', (parseFloat(label.getAttribute('x')!) + dx / ctm.a).toFixed(1));
          }
        }
      }
      if (leader) {
        const [x1, y1] = radial(a, 424);
        const [x2, y2] = radial(a, 492);
        leader.setAttribute('x1', x1.toFixed(1));
        leader.setAttribute('y1', y1.toFixed(1));
        leader.setAttribute('x2', x2.toFixed(1));
        leader.setAttribute('y2', y2.toFixed(1));
      }
    });
  }, [engine]);

  // per-block rings: gas sweep + blob segments, red while fresh
  const lastBlockRef = useRef(0);
  useEffect(() => {
    return blockfeed.subscribe(({ latest }) => {
      if (!latest || latest.number === lastBlockRef.current) return;
      lastBlockRef.current = latest.number;
      const pct = latest.gasUsed / latest.gasLimit;
      const ring = gasRingRef.current;
      if (ring) {
        ring.setAttribute('stroke-dasharray', `${pct.toFixed(3)} 1`);
        ring.setAttribute('opacity', '1');
        setTimeout(() => ring.setAttribute('opacity', '0.55'), 1600);
      }
      if (gasTextRef.current) gasTextRef.current.textContent = `GAS ${Math.round(pct * 100)}%`;
      const g = blobGroupRef.current;
      if (g) {
        const segs = g.children;
        const n = Math.min(MAX_BLOBS, latest.blobCount);
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i] as SVGPathElement;
          seg.setAttribute('stroke', 'var(--ink)');
          seg.setAttribute('opacity', i < n ? (i === n - 1 ? '1' : '0.55') : '0.12');
        }
      }
      if (blobTextRef.current) blobTextRef.current.textContent = `BLOBS ${latest.blobCount}/${MAX_BLOBS}`;
    });
  }, []);

  // participation: sync-committee share, refreshed each epoch
  useEffect(() => {
    const apply = (v: number | null) => {
      if (v === null) return;
      const ring = partRingRef.current;
      if (ring) {
        ring.setAttribute('stroke-dasharray', `${v.toFixed(3)} 1`);
        // healthy (>=99%) reads as a green RING, not green text: the
        // curved micro readout can't hold 4.5:1 in green at phone scale
        ring.setAttribute('stroke', v >= 0.99 ? 'var(--ok)' : 'var(--ink)');
      }
      if (partTextRef.current) {
        partTextRef.current.textContent = `PARTICIP ${(v * 100).toFixed(1)}%`;
      }
    };
    void fetchParticipation().then(apply);
    return engine.onBeat((slot) => {
      if (slot % 32 === 0) void fetchParticipation().then(apply);
    });
  }, [engine]);

  // stake ring: near-static, from the snapshot
  useEffect(() => {
    if (stakePct == null) return;
    stakeRingRef.current?.setAttribute('stroke-dasharray', `${(stakePct / 100).toFixed(3)} 1`);
  }, [stakePct]);

  // the gas ring breathes with the pulse
  useEffect(() => {
    return engine.onFrame(({ scale }) => {
      gasRingRef.current?.setAttribute('stroke-width', (2 + (scale - 1) * 26).toFixed(2));
    });
  }, [engine]);

  // 16 viewBox units ≈ 10px on screen (the disc renders at ~0.6x of the
  // 1000-unit viewBox); full ink because tiny glyph cores dilute heavily.
  // weight 700: on-curve textPath glyphs at phone scale dilute harder than
  // straight text — the green PARTICIP readout sampled 3.14:1 at 400
  const micro = { fontSize: 16, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', fontWeight: 700 } as const;
  // ring radii, outermost data ring first
  const R_GAS = 396;
  const R_BLOB = 374;
  const R_PART = 352;
  const R_STAKE = 330;

  return (
    <svg
      viewBox="0 0 1000 1000"
      className="block h-full w-full"
      style={{ overflow: 'visible' }}
      role="img"
      aria-label="Instrument dial: epoch progress ring, slot sweep hand, gas arc and finality marker around the Ethereum glyph"
    >
      <defs>
        <radialGradient id="beat-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.4" />
          <stop offset="55%" stopColor="var(--ink)" stopOpacity="0.1" />
          <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle
        ref={(el) => void (handles.glow = el)}
        cx={CX}
        cy={CY}
        r="492"
        fill="url(#beat-glow)"
        opacity="0"
      />

      {/* the disc: one clean hairline */}
      <circle cx={CX} cy={CY} r="478" fill="var(--disc-fill)" stroke="var(--hairline)" strokeWidth="1.5" />

      {/* EPOCH RING: one tick per slot, filling through the epoch */}
      <g ref={ringRef}>
        {Array.from({ length: SLOTS_PER_EPOCH }, (_, i) => {
          const a = slotAngle(i);
          const [x1, y1] = radial(a, 446); // resting inner end
          const [lx1, ly1] = radial(a, 436); // longer inner end (current slot)
          const [x2, y2] = radial(a, i % 8 === 0 ? 476 : 470);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              data-x1={x1.toFixed(1)}
              data-y1={y1.toFixed(1)}
              data-lx1={lx1.toFixed(1)}
              data-ly1={ly1.toFixed(1)}
              stroke="var(--ink)"
              strokeWidth="1"
              opacity="0.18"
            />
          );
        })}
      </g>

      {/* epoch readout with leader to the ring's zero tick */}
      <line x1={CX} y1={16} x2={CX + 34} y2={16} stroke="var(--hairline)" strokeWidth="0.75" />
      <line x1={CX} y1={16} x2={CX} y2={24} stroke="var(--hairline)" strokeWidth="0.75" />
      <text ref={epochTextRef} x={CX + 40} y={19} fill="var(--ink)" style={micro} />

      {/* SLOT SWEEP: one turn per 12 seconds */}
      <g ref={sweepRef}>
        <line x1={CX} y1={CY - 476} x2={CX} y2={CY - 430} stroke="var(--accent)" strokeWidth="2" />
        <line x1={CX} y1={CY - 430} x2={CX} y2={CY - 60} stroke="var(--ink)" strokeWidth="0.5" opacity="0.14" />
      </g>

      {/* CONCENTRIC DATA RINGS: gas, blobs, participation, stake */}
      {[
        { r: R_GAS, ref: gasRingRef },
        { r: R_PART, ref: partRingRef },
        { r: R_STAKE, ref: stakeRingRef },
      ].map(({ r, ref }, i) => (
        <g key={i}>
          <path d={arcPath(RING_A0, RING_A1, r)} fill="none" stroke="var(--line-data)" strokeWidth="1" strokeDasharray="1 5" />
          <path ref={ref} d={arcPath(RING_A0, RING_A1, r)} pathLength={1} fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="0 1" opacity="0.8" strokeLinecap="butt" />
        </g>
      ))}
      {/* blob ring: MAX_BLOBS segments, filled per block, reset each block */}
      <g ref={blobGroupRef}>
        {Array.from({ length: MAX_BLOBS }, (_, i) => {
          const span = (Math.PI * 2 - 0.04) / MAX_BLOBS;
          const a0 = RING_A0 + i * span + 0.02;
          return (
            <path key={i} d={arcPath(a0, a0 + span - 0.05, R_BLOB)} fill="none" stroke="var(--ink)" strokeWidth="3.5" opacity="0.12" />
          );
        })}
      </g>
      {/* ring readouts ride their own short arc segments at the four
          diagonals — inside the innermost ring, radially anchored to the
          ring each one describes by a hairline leader ending in a dot
          (pass 10b: no floating text blocks inside the disc). Upper
          labels sit on clockwise arcs (glyphs extend outward), lower on
          counterclockwise ones (glyphs extend inward), so all four
          occupy the same 306..322 radius band, clear of the glyph, the
          numeral and the red arc text. */}
      {[
        { r: R_GAS, ref: gasTextRef, text: 'GAS', deg: 45, upper: true },
        { r: R_BLOB, ref: blobTextRef, text: 'BLOBS', deg: 135, upper: false },
        { r: R_PART, ref: partTextRef, text: 'PARTICIP', deg: 225, upper: false },
        {
          r: R_STAKE,
          ref: undefined,
          text: stakePct != null ? `STAKE ${stakePct.toFixed(1)}%` : 'STAKE',
          deg: 315,
          upper: true,
        },
      ].map(({ r, ref, text, deg, upper }, i) => {
        const a = (deg * Math.PI) / 180 - Math.PI / 2; // from 12 o'clock, clockwise
        const half = (55 * Math.PI) / 180;
        const L = upper ? 306 : 322; // baseline radius; glyphs fill 306..322
        const d = upper
          ? arcPath(a - half, a + half, L)
          : (() => {
              const [x0, y0] = radial(a + half, L);
              const [x1, y1] = radial(a - half, L);
              return `M${x0.toFixed(1)},${y0.toFixed(1)} A${L},${L} 0 0 0 ${x1.toFixed(1)},${y1.toFixed(1)}`;
            })();
        const [lx1, ly1] = radial(a, 326);
        const [lx2, ly2] = radial(a, r);
        return (
          <g key={i}>
            <path id={`stat-arc-${i}`} d={d} fill="none" />
            <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="var(--hairline)" strokeWidth="0.6" />
            <circle cx={lx2} cy={ly2} r="3.5" fill="var(--ink)" opacity="0.8" />
            <text fill="var(--ink)" style={micro}>
              <textPath ref={ref} href={`#stat-arc-${i}`} startOffset="50%" textAnchor="middle">
                {text}
              </textPath>
            </text>
          </g>
        );
      })}

      {/* FINAL notch on the inner track, labelled outside the ring */}
      <line ref={finalNotchRef} stroke="var(--ink)" strokeWidth="2" opacity="0.7" />
      <line ref={finalLeaderRef} stroke="var(--hairline)" strokeWidth="0.6" opacity="0.8" />
      <text ref={finalTextRef} fill="var(--ink)" style={micro}>
        FINAL −2 EPOCHS
      </text>

      {/* the glyph: line-art backdrop dead-centre of the disc, ~57% of its
          diameter tall; the KPI numeral renders on top, so strokes sit in
          the 35-45% opacity band to keep the number readable. The two
          halves still pulse 60ms apart. */}
      <g transform="translate(500 500) scale(1.3)">
        <g transform="translate(-128 -208.5)">
          <g ref={(el) => void (handles.top = el)} style={{ transformOrigin: '128px 208px' }}>
            {TOP_FACETS.map((f, i) => (
              <polygon key={i} points={f.points} fill="none" stroke="var(--ink)" strokeWidth="1.6" opacity={0.3 + f.opacity * 0.25} />
            ))}
          </g>
          <g ref={(el) => void (handles.bottom = el)} style={{ transformOrigin: '128px 208px' }}>
            {BOTTOM_FACETS.map((f, i) => (
              <polygon key={i} points={f.points} fill="none" stroke="var(--ink)" strokeWidth="1.6" opacity={0.3 + f.opacity * 0.25} />
            ))}
          </g>
        </g>
      </g>
    </svg>
  );
}
