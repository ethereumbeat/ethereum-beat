import { useEffect, useRef, useState } from 'react';
import type { BeatEngine } from '../lib/beat';
import * as blockfeed from '../lib/blockfeed';

/**
 * Degraded machine output, three layers deep:
 * - a coarse Bayer dither field, denser at the viewport edges, drifting
 *   almost imperceptibly (CSS)
 * - a barely-there hex-dump crawling behind everything, expanded from the
 *   latest block hash — real bytes, not lorem hex
 * - random block-noise tiles that flash for 100-200ms every few seconds,
 *   scheduled inside the one rAF loop (no timers)
 * Reduced motion: the static dither only.
 */

interface Tile {
  id: number;
  x: number; // vw
  y: number; // vh
  w: number; // px
  h: number; // px
  until: number;
}

const NOISE_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='discrete' baseFrequency='0.55' numOctaves='1'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 0 0 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='48' height='48' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** expand a block hash into fake-but-derived memory dump lines */
function hexLines(hash: string, lines = 46): string[] {
  const bytes = hash.replace(/^0x/, '');
  const out: string[] = [];
  let seed = 0;
  for (let i = 0; i < bytes.length; i++) seed = (seed * 31 + bytes.charCodeAt(i)) >>> 0;
  for (let l = 0; l < lines; l++) {
    let line = (l * 16).toString(16).padStart(4, '0') + '  ';
    for (let g = 0; g < 8; g++) {
      const start = (seed + l * 7 + g * 11) % (bytes.length - 4);
      line += bytes.slice(start, start + 4) + ' ';
    }
    out.push(line);
  }
  return out;
}

interface Props {
  engine: BeatEngine;
  reducedMotion: boolean;
}

export default function PixelField({ engine, reducedMotion }: Props) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [stageGlitch, setStageGlitch] = useState(false);
  const nextAt = useRef(performance.now() + 2500);
  const idRef = useRef(0);
  const [dump, setDump] = useState<string[]>([]);

  useEffect(() => {
    if (reducedMotion) return;
    let lastHash = '';
    return blockfeed.subscribe(({ latest }) => {
      if (latest && latest.hash !== lastHash) {
        lastHash = latest.hash;
        setDump(hexLines(latest.hash));
      }
    });
  }, [reducedMotion]);

  // block-noise scheduler rides the main rAF loop
  useEffect(() => {
    if (reducedMotion) return;
    return engine.onFrame(() => {
      const now = performance.now();
      setTiles((cur) => (cur.length && cur[0]!.until < now ? [] : cur));
      if (now < nextAt.current) return;
      nextAt.current = now + 1800 + Math.random() * 3800;
      const tile: Tile = {
        id: idRef.current++,
        x: Math.random() * 92,
        y: Math.random() * 88,
        w: 30 + Math.random() * 110,
        h: 8 + Math.random() * 42,
        until: now + 100 + Math.random() * 100,
      };
      setTiles([tile]);
      if (Math.random() < 0.3) {
        setStageGlitch(true); // occasional full-stage displacement
      }
    });
  }, [engine, reducedMotion]);

  useEffect(() => {
    if (!stageGlitch) return;
    document.getElementById('stage-root')?.classList.add('stage-glitch');
    const el = document.getElementById('stage-root');
    const done = () => {
      el?.classList.remove('stage-glitch');
      setStageGlitch(false);
    };
    el?.addEventListener('animationend', done, { once: true });
    return () => el?.removeEventListener('animationend', done);
  }, [stageGlitch]);

  return (
    <>
      {/* coarse Bayer field, denser at the edges */}
      <div className="dither-field pointer-events-none fixed inset-0 z-0" aria-hidden="true" />

      {!reducedMotion && (
        <>
          {/* hex-dump crawl: real bytes from the latest block hash */}
          <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-[0.035]" aria-hidden="true">
            <div className="hex-crawl px-6 font-mono" style={{ fontSize: 11, lineHeight: '1.9', letterSpacing: '0.2em' }}>
              {/* one element per line so no giant text block can become the
                  page's LCP candidate */}
              {dump.map((line, i) => (
                <div key={i} className="whitespace-pre">
                  {line}
                </div>
              ))}
            </div>
          </div>

          {/* block-noise tiles */}
          {tiles.map((t) => (
            <div
              key={t.id}
              className="pointer-events-none fixed z-40 mix-blend-multiply"
              style={{
                left: `${t.x}vw`,
                top: `${t.y}vh`,
                width: t.w,
                height: t.h,
                backgroundImage: NOISE_BG,
                opacity: 0.35,
              }}
              aria-hidden="true"
            />
          ))}
        </>
      )}
    </>
  );
}
