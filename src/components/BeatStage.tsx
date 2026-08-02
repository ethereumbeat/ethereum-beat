import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { navigate } from 'astro:transitions/client';
import type { Point, Range } from '../lib/aggregate';
import { sharedEngine, pulseEnvelope, BEAT_PERIOD } from '../lib/beat';
import * as audio from '../lib/audio';
import * as blockfeed from '../lib/blockfeed';
import { slotClock } from '../lib/clock';
import type { Snapshot, SnapshotMetric } from '../lib/metrics';
import { featuredMetrics, findMetric, categoryIndex, CATEGORY_LABELS } from '../lib/metrics';
import { metricCaption } from '../lib/format';
import EthGlyph, { type EthGlyphHandles } from './EthGlyph';
import SeriesLine from './SeriesLine';
import { prefetch } from '../lib/seriescache';
import { PRINCIPLES } from '../lib/values';
import { lazy, Suspense } from 'react';
const ShareModal = lazy(() => import('./ShareModal'));
import { kpiValue } from '../lib/format';

import KpiCard from './KpiCard';
import PixelField from './PixelField';
import Ornaments from './Ornaments';
import ArcText from './ArcText';
import PulseOverlay, { type OverlayMetric } from './PulseOverlay';
import SectionHeader from './SectionHeader';

/**
 * The whole interactive experience: one island, one rAF clock.
 * The heartbeat is genuinely synced to slot boundaries; each beat advances
 * the featured KPI. Arrow keys, swipe and click zones take control.
 */

const BEATS_PER_KPI = 1;

/* the KPI cylinder, seen from above: each numeral is a face at vi*STEP
   degrees, translateZ = radius; advancing rotates the whole track so the
   incoming face sweeps back-left -> front and the outgoing exits front ->
   right-back */
const CAROUSEL_STEP = 42; // degrees between faces
const CAROUSEL_RADIUS = 880; // px, cylinder radius
const CAROUSEL_MS = 700;

interface Props {
  /** direct entry to /pulse/[metric]: open the overlay on load over BEAT */
  initialOverlay?: {
    metric: OverlayMetric;
    initialRange: Range;
    initialPoints: Point[];
  };
}

export default function BeatStage({ initialOverlay }: Props = {}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  // continuous rotation index: never wrapped, so the cylinder always
  // advances forward; the visible slot is derived modulo count
  const [virtual, setVirtual] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  // hydration-safe: SSR can't know the media query, so the first client
  // render must match the server's false; the real value lands post-mount
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    setReducedMotion(matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  const engine = useMemo(() => sharedEngine(reducedMotion), [reducedMotion]);
  const glyphHandles = useRef<EthGlyphHandles>({ top: null, bottom: null, glow: null }).current;
  const beatCount = useRef(0);
  const touchX = useRef<number | null>(null);
  const [epochSlice, setEpochSlice] = useState<number | null>(null);
  const [debris, setDebris] = useState<{ id: number; angle: number; dist: number }[]>([]);

  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const lastBeatIdx = useRef(-1);

  // pass 12: the pulse detail is an overlay over this live dial.
  const [overlayKey, setOverlayKey] = useState<string | null>(initialOverlay?.metric.metric_key ?? null);
  // true when opened from BEAT (pushState) → close pops history; false on
  // direct entry → close is a real navigation to /
  const overlayPushed = useRef(false);
  const overlayOpen = overlayKey !== null;

  const metrics: SnapshotMetric[] = snapshot ? featuredMetrics(snapshot) : [];
  // one extra virtual slot after the rotation: the VALUES beat
  const count = metrics.length ? metrics.length + 1 : 0;
  const valuesSlot = metrics.length; // active === valuesSlot -> principle card
  const [principleIdx, setPrincipleIdx] = useState(0);
  const active = count > 0 ? ((virtual % count) + count) % count : 0;

  // jump the cylinder to a specific slot within the current revolution
  const jumpTo = useCallback(
    (target: number) => {
      setVirtual((v) => (count > 0 ? v + target - (((v % count) + count) % count) : v));
    },
    [count],
  );

  // deep link: #metric_key selects that KPI and holds the rotation —
  // on arrival and on in-page hash navigation alike
  useEffect(() => {
    if (!snapshot) return;
    const applyHash = () => {
      const key = window.location.hash.slice(1);
      if (!key) return;
      const idx = featuredMetrics(snapshot).findIndex((m) => m.metric_key === key);
      if (idx >= 0) {
        jumpTo(idx);
        setUserPaused(true);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [snapshot, jumpTo]);

  useEffect(() => {
    fetch('/api/snapshot')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((s) => {
        setSnapshot(s as Snapshot);
        // warm the background-line cache once first paint is settled
        setTimeout(() => void prefetch(featuredMetrics(s as Snapshot).map((m) => m.metric_key)), 2500);
      })
      .catch(() => setFailed(true));
  }, []);

  // drive the glyph directly, outside React (60fps)
  useEffect(() => {
    engine.start();
    const off = engine.onFrame(({ clock }) => {
      if (reducedMotion) return;
      const top = pulseEnvelope(clock.secondsIntoSlot);
      const bottom = pulseEnvelope(Math.max(0, clock.secondsIntoSlot - 0.06));
      if (glyphHandles.top) glyphHandles.top.style.transform = `scale(${top.scale.toFixed(4)})`;
      if (glyphHandles.bottom) glyphHandles.bottom.style.transform = `scale(${bottom.scale.toFixed(4)})`;
      if (glyphHandles.glow) glyphHandles.glow.setAttribute('opacity', top.glow.toFixed(3));
      // every lub-dub, not just the systole
      const beatIdx = clock.slot * 13 + Math.floor(clock.secondsIntoSlot / BEAT_PERIOD);
      if (beatIdx !== lastBeatIdx.current) {
        if (lastBeatIdx.current !== -1) audio.lubDub(clock.secondsIntoSlot < BEAT_PERIOD);
        lastBeatIdx.current = beatIdx;
      }
    });
    return off; // the shared engine persists; only our subscription ends
  }, [engine, glyphHandles, reducedMotion]);

  // the systole: one shared block poll, then the KPI advances.
  // the 64-block backfill waits for a quiet network so it never races the
  // snapshot fetch for first paint
  useEffect(() => {
    void blockfeed.poll(slotClock(Date.now()).slot);
    const idle = setTimeout(() => void blockfeed.seedHistory(), 3500);
    return () => clearTimeout(idle);
  }, []);
  useEffect(() => {
    return engine.onBeat((slot) => {
      void blockfeed.poll(slot);
      if (slot % 32 === 0 && !reducedMotion) setEpochSlice(slot); // once per epoch
      if (!reducedMotion) {
        // red pixel debris kicks off the disc edge
        setDebris(
          Array.from({ length: 4 + ((slot % 3) as number) }, (_, i) => ({
            id: slot * 8 + i,
            angle: Math.random() * Math.PI * 2,
            dist: 22 + Math.random() * 44,
          })),
        );
      }
      beatCount.current += 1;
      // the overlay pauses the rotation underneath so the dial does not
      // change behind the detail while you read it
      if (paused || userPaused || overlayOpen || count === 0) return;
      if (beatCount.current % BEATS_PER_KPI === 0)
        setVirtual((v) => {
          const n = (((v + 1) % count) + count) % count;
          if (n === valuesSlot) setPrincipleIdx((i) => (i + 1) % PRINCIPLES.length);
          return v + 1;
        });
    });
  }, [engine, paused, userPaused, overlayOpen, count, reducedMotion]);

  // manual navigation writes the hash (auto-rotation never touches the URL)
  const step = useCallback(
    (dir: 1 | -1) => {
      if (count === 0) return;
      setVirtual((v) => {
        const n = (((v + dir) % count) + count) % count;
        const key = metrics[n]?.metric_key;
        if (key) history.replaceState(null, '', `#${key}`);
        if (n === valuesSlot) setPrincipleIdx((i) => (i + 1) % PRINCIPLES.length);
        return v + dir;
      });
    },
    [count, metrics, valuesSlot],
  );

  const copyLink = useCallback(() => {
    const key = metrics[active]?.metric_key;
    if (!key) return;
    void navigator.clipboard.writeText(`${location.origin}/#${key}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }, [metrics, active]);

  // ── pulse overlay: open/close/cycle, history-aware, morph on open ──────
  const openOverlay = useCallback(
    (key: string) => {
      const doOpen = () => {
        history.pushState({ ov: key }, '', `/pulse/${key}`);
        overlayPushed.current = true;
        setOverlayKey(key);
      };
      const startVT = (document as unknown as { startViewTransition?: (cb: () => void) => { finished: Promise<void> } })
        .startViewTransition;
      if (reducedMotion || typeof startVT !== 'function') {
        doOpen();
        return;
      }
      // morph the active dial numeral into the overlay numeral: tag the
      // source, run the transition, hand the shared name to the overlay
      const dialNum = document.querySelector('[data-kpi-active] [data-kpi-number]') as HTMLElement | null;
      if (dialNum) dialNum.style.viewTransitionName = 'kpi-morph';
      try {
        const vt = startVT.call(document, () => {
          if (dialNum) dialNum.style.viewTransitionName = '';
          flushSync(doOpen);
        });
        vt.finished.finally(() => {
          if (dialNum) dialNum.style.viewTransitionName = '';
        });
      } catch {
        if (dialNum) dialNum.style.viewTransitionName = '';
        doOpen();
      }
    },
    [reducedMotion],
  );

  const closeOverlay = useCallback(() => {
    if (overlayPushed.current) history.back();
    else void navigate('/');
  }, []);

  const cycleOverlay = useCallback(
    (dir: 1 | -1) => {
      if (!overlayKey || metrics.length === 0) return;
      const i = metrics.findIndex((m) => m.metric_key === overlayKey);
      if (i < 0) return;
      const next = metrics[(i + dir + metrics.length) % metrics.length]!;
      history.replaceState({ ov: next.metric_key }, '', `/pulse/${next.metric_key}`);
      document.title = `Ethereum Beat — PULSE · ${next.label.toLowerCase()}`;
      setOverlayKey(next.metric_key);
    },
    [overlayKey, metrics],
  );

  // browser back/forward drives the overlay: the URL is the source of truth
  useEffect(() => {
    const onPop = () => {
      const m = location.pathname.match(/^\/pulse\/([^/]+)\/?$/);
      if (m) setOverlayKey(decodeURIComponent(m[1]!));
      else {
        overlayPushed.current = false;
        setOverlayKey(null);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // keep the dial behind the overlay on the same metric (morph source +
  // what shows when the overlay closes), rotation held
  useEffect(() => {
    if (!overlayKey || !snapshot) return;
    const i = featuredMetrics(snapshot).findIndex((m) => m.metric_key === overlayKey);
    if (i >= 0) {
      jumpTo(i);
      setUserPaused(true);
    }
  }, [overlayKey, snapshot, jumpTo]);

  // keyboard: arrows advance/rewind, Enter opens detail, Space holds the
  // rotation (Esc/T/N/B/? are handled globally in the layout). While the
  // overlay is open it owns the keyboard, so the dial stands down.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlayOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === ' ') {
        e.preventDefault();
        setUserPaused((p) => !p);
      } else if (e.key === 'x' || e.key === 'X') {
        setShareOpen(true);
      } else if (e.key === 's' || e.key === 'S') {
        setSound((on) => {
          audio.setEnabled(!on);
          return !on;
        });
      } else if (e.key === 'Enter' && metrics[active] && document.activeElement === document.body) {
        openOverlay(metrics[active]!.metric_key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, metrics, active, overlayOpen, openOverlay]);

  // audio: off by default; a remembered preference still waits for the
  // first gesture (autoplay policy), then re-arms silently
  useEffect(() => {
    if (!audio.wantsSound()) return;
    const arm = () => {
      audio.setEnabled(true);
      setSound(true);
    };
    window.addEventListener('pointerdown', arm, { once: true });
    window.addEventListener('keydown', arm, { once: true });
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, []);

  // dry tick per new block, accented on epoch boundaries
  const lastTickedBlock = useRef(0);
  useEffect(() => {
    return blockfeed.subscribe(({ latest }) => {
      if (!latest || latest.number <= lastTickedBlock.current) return;
      const first = lastTickedBlock.current === 0;
      lastTickedBlock.current = latest.number;
      if (!first) audio.blockTick(slotClock(Date.now()).slotInEpoch === 0);
    });
  }, []);

  // the [S] SOUND chip reflects state
  useEffect(() => {
    document.querySelector('#command-bar [data-keys="s"]')?.classList.toggle('cmd-active', sound);
  }, [sound]);

  // one glitch frame at the rotation's apex (~mid-transition)
  const [apexGlitch, setApexGlitch] = useState(false);
  const firstSpin = useRef(true);
  useEffect(() => {
    if (reducedMotion) return;
    if (firstSpin.current) {
      firstSpin.current = false;
      return;
    }
    const t1 = setTimeout(() => setApexGlitch(true), CAROUSEL_MS / 2 - 40);
    const t2 = setTimeout(() => setApexGlitch(false), CAROUSEL_MS / 2 + 60);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [virtual, reducedMotion]);

  const metric = metrics[active];
  const companionFor = (m?: SnapshotMetric): string | null =>
    m?.metric_key === 'staked_eth' && snapshot
      ? (() => {
          const pct = findMetric(snapshot, 'staked_pct');
          return pct ? `${pct.latest.value.toFixed(1)}% of all ETH` : null;
        })()
      : null;

  // one face of the cylinder: a KPI numeral or the VALUES card
  const renderSlot = (idx: number) =>
    idx === valuesSlot ? (
      <div key={`values-${principleIdx}`} className="invert brackets mx-auto max-w-2xl px-6 py-8 text-center sm:px-10">
        <div className="mb-3 flex justify-center">
          <SectionHeader index="∞" title="values" subtitle="one principle per beat" />
        </div>
        <div className="whitespace-normal font-display leading-tight" style={{ fontSize: 'clamp(1.5rem, 4.2vw, 3.6rem)' }}>
          {PRINCIPLES[principleIdx]!.title}
        </div>
        <p className="mono-label mx-auto mt-4 max-w-md opacity-85">{PRINCIPLES[principleIdx]!.gloss}</p>
      </div>
    ) : metrics[idx] ? (
      <KpiCard metric={metrics[idx]!} companionText={companionFor(metrics[idx])} reducedMotion={reducedMotion} onOpen={openOverlay} />
    ) : null;

  // the caption line under the numeral (dp10c): a metric_meta override
  // wins (uptime → "100% UPTIME SINCE 2015"), else the delta. A single
  // concise line; the staked % of supply keeps its home on the STAKE ring.
  const arcCaption = metric ? metricCaption(metric) : '';

  // a featured metric -> overlay data, with the caption resolved the same
  // way the disc resolves it
  const toOverlayMetric = (m: SnapshotMetric): OverlayMetric => ({
    metric_key: m.metric_key,
    label: m.label,
    category: m.category,
    unit: m.unit,
    description: m.description,
    source_name: m.source_name,
    source_url: m.source_url,
    caption: metricCaption(m) || null,
    agg_mode: m.agg_mode,
    latest: m.latest,
  });
  const overlayMetric: OverlayMetric | null = overlayKey
    ? (() => {
        const sm = snapshot ? findMetric(snapshot, overlayKey) : undefined;
        if (sm) return toOverlayMetric(sm);
        if (initialOverlay?.metric.metric_key === overlayKey) return initialOverlay.metric;
        return null;
      })()
    : null;
  const overlaySeed = overlayKey && initialOverlay?.metric.metric_key === overlayKey ? initialOverlay : null;

  return (
    <div
      id="stage-root"
      className="relative h-dvh overflow-hidden"
      onTouchStart={(e) => void (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x0 = touchX.current;
        const x1 = e.changedTouches[0]?.clientX;
        if (x0 !== null && x1 !== undefined && Math.abs(x1 - x0) > 48) step(x1 < x0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <PixelField engine={engine} reducedMotion={reducedMotion} />
      <Ornaments pageIndex={metric ? categoryIndex(metric.category) : '_00'} />

      {/* the active KPI's own history beats in the background, lower third */}
      <div
        className="pointer-events-none absolute inset-x-0 top-[72%] z-0 -translate-y-1/2"
        style={{ maskImage: 'linear-gradient(to right, transparent, black 10%, black 100%)' }}
      >
        <SeriesLine engine={engine} activeKey={metric?.metric_key ?? null} reducedMotion={reducedMotion} />
      </div>

      {/* click zones: left rewinds, right advances */}
      <button
        className="absolute inset-y-0 left-0 z-10 w-1/5 cursor-w-resize opacity-0"
        aria-label="Previous metric"
        onClick={() => step(-1)}
      />
      <button
        className="absolute inset-y-0 right-0 z-10 w-1/5 cursor-e-resize opacity-0"
        aria-label="Next metric"
        onClick={() => step(1)}
      />

      {/* the stage */}
      <main className="relative z-[5] mx-auto flex h-full max-w-5xl flex-col items-center justify-center px-4 pb-20 pt-10">
        <div
          className="disc-core relative"
          style={{ width: 'var(--disc-size)', height: 'var(--disc-size)', viewTransitionName: 'stage-core' }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <EthGlyph handles={glyphHandles} engine={engine} stakePct={snapshot ? (findMetric(snapshot, 'staked_pct')?.latest.value ?? null) : null} />

          {/* red pixel debris scattering off the disc edge on the systole */}
          {debris.map((p) => (
            <span
              key={p.id}
              className="debris"
              style={
                {
                  left: `calc(50% + ${(Math.cos(p.angle) * 47.8).toFixed(1)}%)`,
                  top: `calc(50% + ${(Math.sin(p.angle) * 47.8).toFixed(1)}%)`,
                  '--dx': `${(Math.cos(p.angle) * p.dist).toFixed(0)}px`,
                  '--dy': `${(Math.sin(p.angle) * p.dist).toFixed(0)}px`,
                } as React.CSSProperties
              }
              aria-hidden="true"
            />
          ))}

          {/* once per epoch, a thin pixel-sorted slice crosses the disc */}
          {epochSlice !== null && (
            <div
              key={`slice-${epochSlice}`}
              className="pixel-sort pointer-events-none absolute inset-x-[-4%] h-2"
              style={{ top: `${26 + ((epochSlice / 32) % 5) * 11}%` }}
              aria-hidden="true"
              onAnimationEnd={() => setEpochSlice(null)}
            />
          )}

          {/* blueprint dimension line: measures the disc on KPI change, then fades */}
          {!reducedMotion && metric && (
            <div
              key={`dim-${active}`}
              className="dim-line pointer-events-none absolute -bottom-7 left-[11%] right-[11%] flex items-start justify-center"
              aria-hidden="true"
            >
              <div className="relative h-2 w-full border-x border-[color:var(--hairline)]">
                <div className="absolute inset-x-0 top-0 h-px bg-[color:var(--hairline)]" />
                <span className="micro absolute left-1/2 top-2 -translate-x-1/2 bg-[color:var(--paper)] px-2 !text-[color:var(--ink)] opacity-90">
                  ⌀ DISC · MIN(78VMIN, 44REM)
                </span>
              </div>
            </div>
          )}

          {/* supporting values ride the disc's curvature */}
          {metric && (
            <ArcText
              top={`${categoryIndex(metric.category)} · ${(CATEGORY_LABELS[metric.category] ?? metric.category).toUpperCase()}`}
              bottom={arcCaption}
              engine={engine}
              reducedMotion={reducedMotion}
            />
          )}

          {/* the numeral, dead-centre of the disc, layered over the glyph */}
          <div className="kpi-stage absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
            <div className="relative w-[min(96vw,64rem)]">
              {metric && (
                <button
                  onClick={copyLink}
                  className="group absolute -top-3 right-[2%] z-10 flex cursor-pointer items-center gap-1 p-3 text-[color:var(--ink-soft)] hover:text-[color:var(--ink)] focus-visible:text-[color:var(--ink)]"
                  aria-label="Copy link to this metric"
                >
                  {copied ? (
                    <span className="micro font-bold text-[color:var(--ink)]">LINK COPIED</span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                    </svg>
                  )}
                </button>
              )}
              {count === 0 ? (
                <p className="micro text-center" role="status">
                  {failed ? 'SNAPSHOT UNAVAILABLE — THE PULSE CONTINUES' : 'SYNCING TO SLOT…'}
                </p>
              ) : reducedMotion ? (
                /* reduced motion: instant swap, no transforms */
                <div>{renderSlot(active)}</div>
              ) : (
                /* the cylinder: perspective origin at the disc centre */
                <div
                  className={apexGlitch ? 'kpi-glitch' : ''}
                  style={{ perspective: '1200px', perspectiveOrigin: '50% 50%' }}
                >
                  <div
                    data-kpi-track
                    style={{
                      transformStyle: 'preserve-3d',
                      transform: `translateZ(${-CAROUSEL_RADIUS}px) rotateY(${virtual * CAROUSEL_STEP}deg)`,
                      transition: `transform ${CAROUSEL_MS}ms var(--ease-settle)`,
                    }}
                  >
                    {[virtual - 1, virtual, virtual + 1].map((vi) => {
                      const idx = ((vi % count) + count) % count;
                      const current = vi === virtual;
                      return (
                        <div
                          key={vi}
                          data-kpi-active={current ? 'true' : undefined}
                          className={current ? 'relative' : 'pointer-events-none absolute inset-x-0 top-1/2'}
                          style={{
                            transform: `${current ? '' : 'translateY(-50%) '}rotateY(${-vi * CAROUSEL_STEP}deg) translateZ(${CAROUSEL_RADIUS}px)`,
                            backfaceVisibility: 'hidden',
                            opacity: current ? 1 : 0.3,
                            transition: `opacity ${CAROUSEL_MS}ms var(--ease-settle)`,
                          }}
                        >
                          {renderSlot(idx)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* visible dive affordance: a circular + on the disc's lower edge.
              Click or Enter opens the detail overlay; hover/focus rotates the +
              and reveals a bracketed "view details" tooltip above it. Red accent,
              visible at rest; keyboard-focusable (global focus ring). */}
          {metric && (
            <button
              type="button"
              className="dive-btn"
              aria-label={`View details for ${metric.label}`}
              onClick={() => openOverlay(metric.metric_key)}
              onKeyDown={(e) => {
                // native Enter/Space still activate the button; stop the event
                // reaching the dial's global Space=hold / Enter=dive handlers so
                // it never double-fires
                if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
              }}
            >
              <span className="dive-tip brackets" aria-hidden="true">view details</span>
              <svg
                className="dive-plus"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </div>

        {shareOpen && metric && (
        <Suspense fallback={null}>
        <ShareModal
          data={{
            value: `${kpiValue(metric.latest.value, metric.unit).value}${kpiValue(metric.latest.value, metric.unit).suffix ? ' ' + kpiValue(metric.latest.value, metric.unit).suffix : ''}`,
            label: metric.label,
            index: categoryIndex(metric.category),
            url: `${location.origin}/#${metric.metric_key}`,
            caption: arcCaption,
          }}
          onClose={() => setShareOpen(false)}
        />
        </Suspense>
      )}

      {/* rotation index + pause control */}
        <div className="mt-10 flex items-center gap-4 sm:mt-12">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Featured metrics">
            {[...metrics, null].slice(0, count).map((m, i) => m === null ? (
              <button
                key="values"
                role="tab"
                aria-selected={active === valuesSlot}
                aria-label="Values"
                onClick={() => jumpTo(valuesSlot)}
                className="flex h-6 w-6 cursor-pointer items-center justify-center"
              >
                <span className={`h-1.5 w-1.5 rotate-45 ${active === valuesSlot ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--hairline)]'}`} />
              </button>
            ) : (
              <button
                key={m.metric_key}
                role="tab"
                aria-selected={i === active}
                aria-label={m.label}
                onClick={() => {
                  jumpTo(i);
                  history.replaceState(null, '', `#${m.metric_key}`);
                }}
                className="flex h-6 w-6 cursor-pointer items-center justify-center"
              >
                <span
                  className={`h-1 w-4 transition-colors duration-200 ${
                    i === active ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--hairline)]'
                  }`}
                />
              </button>
            ))}
          </div>
          {metric && (
            <button
              onClick={() => setShareOpen(true)}
              className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[color:var(--hairline)] text-[color:var(--ink-soft)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
              aria-label="Share this metric as an image"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 3v12M7 8l5-5 5 5M5 21h14" />
              </svg>
              <span className="micro absolute -bottom-5 hidden whitespace-nowrap group-hover:inline group-focus-visible:inline">SHARE</span>
            </button>
          )}
          {userPaused && !overlayOpen && <span className="micro invert px-2 py-1">HOLDING — SPACE RESUMES</span>}
        </div>
      </main>

      {overlayMetric && (
        <PulseOverlay
          metric={overlayMetric}
          initialRange={overlaySeed?.initialRange ?? 'm'}
          initialPoints={overlaySeed?.initialPoints}
          canCycle={!!snapshot && metrics.length > 1}
          onClose={closeOverlay}
          onCycle={cycleOverlay}
          reducedMotion={reducedMotion}
        />
      )}
    </div>
  );
}
