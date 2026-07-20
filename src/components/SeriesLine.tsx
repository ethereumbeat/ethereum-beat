import { useEffect, useRef, useState } from 'react';
import type { BeatEngine } from '../lib/beat';
import * as blockfeed from '../lib/blockfeed';
import { getCached, fetchSeries, RESAMPLE_POINTS } from '../lib/seriescache';

/**
 * The number is the heartbeat: the background line is the active KPI's own
 * monthly history, normalised into a silhouette. On KPI change the path
 * morphs into the next metric's curve (~600ms, one glitch frame mid-way);
 * each systole sends a red pulse of light travelling along the path and
 * the lub-dub makes the curve itself breathe.
 */

const WIDTH = 1200;
const HEIGHT = 150;
const BASELINE = 132;
const AMPLITUDE = 104;
const MORPH_MS = 600;
const PULSE_TRAVEL_MS = 950;

interface Props {
  engine: BeatEngine;
  activeKey: string | null;
  reducedMotion: boolean;
}

const FLAT = Array.from({ length: RESAMPLE_POINTS }, () => 0.12);

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

export default function SeriesLine({ engine, activeKey, reducedMotion }: Props) {
  const inkRef = useRef<SVGPathElement>(null);
  const pulseRef = useRef<SVGCircleElement>(null);
  const [dead, setDead] = useState(false);
  // morph state, mutated outside React
  const morph = useRef({ from: FLAT, to: FLAT, start: 0, glitched: true, pulsed: true });
  const pulseStart = useRef(-1);
  const currentYs = useRef<number[]>(FLAT);

  useEffect(() => blockfeed.subscribe((s) => setDead(s.dead)), []);

  // target curve follows the active KPI
  useEffect(() => {
    if (!activeKey) return;
    let alive = true;
    const apply = (ys: number[] | null) => {
      if (!alive) return;
      const target = ys ?? FLAT;
      if (target === morph.current.to) return;
      morph.current = {
        from: currentYs.current,
        to: target,
        start: reducedMotion ? 0 : performance.now(),
        glitched: reducedMotion,
        pulsed: reducedMotion, // the travelling pulse fires at morph completion
      };
    };
    const hit = getCached(activeKey);
    if (hit) apply(hit);
    else void fetchSeries(activeKey).then(apply);
    return () => {
      alive = false;
    };
  }, [activeKey, reducedMotion]);

  // held rotation still pulses on the systole (no morph will fire it)
  useEffect(() => {
    if (reducedMotion) return;
    return engine.onBeat(() => {
      const m = morph.current;
      const idle = m.pulsed && performance.now() - m.start > MORPH_MS + 100;
      if (idle) pulseStart.current = performance.now();
    });
  }, [engine, reducedMotion]);

  useEffect(() => {
    return engine.onFrame(({ scale }) => {
      const path = inkRef.current;
      if (!path) return;
      const now = performance.now();
      const m = morph.current;
      const p = reducedMotion ? 1 : Math.min(1, (now - m.start) / MORPH_MS);
      const eased = easeInOut(p);

      // one-frame glitch slice mid-morph
      let glitchOffset = 0;
      if (!m.glitched && p >= 0.45) {
        m.glitched = true;
        glitchOffset = 9;
      }

      // morph reveal: the line surfaces to ~30% then eases back to ambient
      const opacity = reducedMotion ? 0.11 : 0.11 + 0.19 * Math.sin(Math.PI * p);
      path.setAttribute('opacity', opacity.toFixed(3));

      // the travelling red pulse fires once, at morph completion
      if (!m.pulsed && p >= 1) {
        m.pulsed = true;
        pulseStart.current = now;
      }

      // the lub-dub breathes through the curve's amplitude
      const breathe = reducedMotion ? 1 : 1 + (scale - 1) * 2.2;

      const ys: number[] = new Array(m.to.length);
      let d = '';
      for (let i = 0; i < m.to.length; i++) {
        const v = m.from[i]! * (1 - eased) + m.to[i]! * eased;
        ys[i] = v;
        const x = (i / (m.to.length - 1)) * WIDTH + (glitchOffset && i % 3 ? glitchOffset : 0);
        const y = BASELINE - v * AMPLITUDE * breathe;
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(2);
      }
      currentYs.current = ys;
      path.setAttribute('d', d);

      // red pulse of light travelling left to right
      const pulse = pulseRef.current;
      if (pulse) {
        const dt = now - pulseStart.current;
        if (pulseStart.current > 0 && dt < PULSE_TRAVEL_MS && !reducedMotion) {
          const frac = dt / PULSE_TRAVEL_MS;
          const idx = Math.min(ys.length - 1, Math.round(frac * (ys.length - 1)));
          pulse.setAttribute('cx', (frac * WIDTH).toFixed(1));
          pulse.setAttribute('cy', (BASELINE - ys[idx]! * AMPLITUDE * breathe).toFixed(2));
          pulse.setAttribute('opacity', String(0.85 * (1 - frac * 0.55)));
        } else {
          pulse.setAttribute('opacity', '0');
        }
      }
    });
  }, [engine, reducedMotion]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="h-32 w-full sm:h-44"
      aria-hidden="true"
    >
      <line
        x1="0"
        y1={BASELINE}
        x2={WIDTH}
        y2={BASELINE}
        stroke="var(--ink)"
        strokeWidth="1"
        strokeDasharray="2 6"
        opacity="0.06"
      />
      {/* the KPI's own history, as a silhouette */}
      <use href="#kpi-series" transform="translate(0 -26)" opacity="0.45" />
      <path id="kpi-series" ref={inkRef} fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.11" />
      <circle ref={pulseRef} r="3.4" fill="var(--ink)" opacity="0" />
      {dead && (
        <text
          x={WIDTH / 2}
          y={BASELINE - 40}
          textAnchor="middle"
          fill="var(--accent)"
          opacity="0.6"
          style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}
        >
          — RPC SIGNAL LOST · HISTORY STILL BEATS —
        </text>
      )}
    </svg>
  );
}
