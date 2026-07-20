import { useEffect, useRef } from 'react';
import type { BeatEngine } from '../lib/beat';

/**
 * The signature move of pass 9: supporting values ride the disc's own
 * curvature. Category above the numeral (top arc), caption below it
 * (bottom arc), both on SVG textPaths, matte red.
 *
 * Pass 10b: the top arc revolves — one turn every 105s — by rotating its
 * textPath GROUP about the disc centre, so the glyphs stay on their path.
 * Systole adds a 2.6° kick that eases back. Hovering the disc pauses it.
 *
 * Pass 10c: the bottom line becomes the numeral's caption. It moves off
 * the outer tick ring onto a much smaller concentric arc whose apex sits
 * just below the numeral, and it no longer revolves — pinned centred with
 * a slow ±8° oscillation. Reduced motion: everything static.
 */

const R_TOP = 402;
const TOP_SPREAD = (62 * Math.PI) / 180; // half-angle of the top arc window

// caption arc: a small concentric arc cupping just under the numeral. The
// radius (235 < the 306 mini-stat band) and the modest font keep the
// longest single-line caption ("100% UPTIME SINCE 2015", 22 chars) inside
// a ~±36° window centred at 6 o'clock, so it never splays out to the lower
// mini-stats (BLOBS/PARTICIP at ±45°) and never rises into the numeral.
const CAP_R = 235;
const CAP_SPREAD = (46 * Math.PI) / 180;
const CAP_FONT = 20;

// top arc: left → right over the crown (sweep 1)
const TOP = (() => {
  const x0 = 500 - R_TOP * Math.sin(TOP_SPREAD);
  const y = 500 - R_TOP * Math.cos(TOP_SPREAD);
  const x1 = 500 + R_TOP * Math.sin(TOP_SPREAD);
  return `M${x0.toFixed(1)},${y.toFixed(1)} A${R_TOP},${R_TOP} 0 0 1 ${x1.toFixed(1)},${y.toFixed(1)}`;
})();

// bottom (caption) arc: left → right bowing downward (sweep 0) so glyphs
// stay upright; apex on the vertical axis at y = 500 + CAP_R
const BOTTOM = (() => {
  const x0 = 500 - CAP_R * Math.sin(CAP_SPREAD);
  const y = 500 + CAP_R * Math.cos(CAP_SPREAD);
  const x1 = 500 + CAP_R * Math.sin(CAP_SPREAD);
  return `M${x0.toFixed(1)},${y.toFixed(1)} A${CAP_R},${CAP_R} 0 0 0 ${x1.toFixed(1)},${y.toFixed(1)}`;
})();

interface Props {
  top: string;
  bottom: string;
  /** systole source for the rotation kick; omit to render static */
  engine?: BeatEngine;
  reducedMotion?: boolean;
}

export default function ArcText({ top, bottom, engine, reducedMotion }: Props) {
  const kickTop = useRef<SVGGElement>(null);

  // the systole kicks the top revolution 2.6° forward, then it eases back;
  // inline transform on the inner group so the CSS revolution (outer group)
  // composes with the kick instead of fighting it. The caption oscillates
  // on its own and takes no kick.
  useEffect(() => {
    if (!engine || reducedMotion) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = engine.onBeat(() => {
      const el = kickTop.current;
      if (el) {
        el.style.transition = 'transform 130ms cubic-bezier(0.2, 0.7, 0.3, 1)';
        el.style.transform = 'rotate(2.6deg)';
      }
      timer = setTimeout(() => {
        if (!kickTop.current) return;
        kickTop.current.style.transition = 'transform 900ms var(--ease-settle)';
        kickTop.current.style.transform = 'rotate(0deg)';
      }, 150);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [engine, reducedMotion]);

  return (
    <svg
      viewBox="0 0 1000 1000"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      <defs>
        <path id="arc-top" d={TOP} />
        <path id="arc-bottom" d={BOTTOM} />
      </defs>
      {/* Departure Mono (pixel): +20% size compensates pixel rendering on
          a curve; tracking eased so rotated pixel glyphs don't shatter */}
      <g className="arc-spin">
        <g ref={kickTop} className="arc-kick">
          <text
            fill="var(--accent)"
            style={{ fontSize: 36, fontFamily: 'var(--font-display)', letterSpacing: '0.24em' }}
          >
            <textPath href="#arc-top" startOffset="50%" textAnchor="middle">
              {top}
            </textPath>
          </text>
        </g>
      </g>
      {/* the caption: pinned centred under the numeral, gentle oscillation */}
      <g className="arc-osc">
        <text
          fill="var(--accent)"
          style={{ fontSize: CAP_FONT, fontFamily: 'var(--font-display)', letterSpacing: '0.18em' }}
        >
          <textPath href="#arc-bottom" startOffset="50%" textAnchor="middle">
            {bottom}
          </textPath>
        </text>
      </g>
    </svg>
  );
}
