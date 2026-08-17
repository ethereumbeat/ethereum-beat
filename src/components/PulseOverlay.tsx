import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { Point, Range } from '../lib/aggregate';
import { kpiValue } from '../lib/format';
import { CATEGORY_LABELS, categoryIndex } from '../lib/metrics';
import { pulseMeta } from '../lib/site';
import { pulseDataset } from '../lib/dataset';
import { principleFor } from '../lib/values';
import CropsBadge from './CropsBadge';
import ExplainChip from './ExplainChip';
import PulseChart from './PulseChart';
import SectionHeader from './SectionHeader';
const ShareModal = lazy(() => import('./ShareModal'));

/**
 * PR D: /pulse/[metric] is a sci-fi HUD modal hovering over the still-live
 * dial (faintly visible behind the scrim), NOT a stacked document. Desktop is
 * two columns — LEFT the big pixel numeral + caption + CROPS + principle, RIGHT
 * the chart with D/W/M/Q/Y + scrub. The frame's bracket lines draw in on open,
 * corner ticks + a scan line + a "PULSE // METRIC" title bar with a barcode
 * complete the chrome. Mobile stacks left over right. Reduced motion: instant.
 *
 * The Astro page (title, canonical, Dataset JSON-LD) is untouched and stays
 * server-rendered, so direct /pulse/{key} URLs keep their metadata.
 */

export interface OverlayMetric {
  metric_key: string;
  label: string;
  category: string;
  unit: string;
  description: string;
  source_name: string;
  source_url: string;
  caption: string | null;
  agg_mode: 'mean' | 'sum' | 'last';
  latest: { date: string; value: number } | null;
}

interface Props {
  metric: OverlayMetric;
  initialRange: Range;
  /** seed points for the first (direct-load) metric so the chart never flashes */
  initialPoints?: Point[];
  canCycle: boolean;
  onClose: () => void;
  onCycle: (dir: 1 | -1) => void;
  reducedMotion: boolean;
}

const CLOSE_MS = 300;

export default function PulseOverlay({
  metric,
  initialRange,
  initialPoints,
  canCycle,
  onClose,
  onCycle,
  reducedMotion,
}: Props) {
  const [range, setRange] = useState<Range>(initialRange);
  const [shareOpen, setShareOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const kpi = metric.latest ? kpiValue(metric.latest.value, metric.unit) : null;
  // the pixel numeral must fit the value column without ever crossing the divider
  // (pass 19): scale its MAX size down as the digit count grows, and size the
  // middle clamp term to the column width (cqi) rather than the viewport (vw), so
  // a billion-scale value like "1,234,567,890" cannot paint over the chart.
  const valChars = kpi ? kpi.value.length : 0;
  const valMaxRem =
    valChars <= 5 ? 6 : valChars <= 7 ? 5 : valChars <= 9 ? 4 : valChars <= 11 ? 3.3 : 2.8;
  const principle = principleFor(metric.category);
  const licence = metric.source_name === 'growthepie' ? ' · CC BY 4.0' : '';

  // play the close animation, then hand off to the real close (history/nav).
  // reduced motion closes instantly.
  const requestClose = useCallback(() => {
    if (reducedMotion) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  }, [onClose, reducedMotion]);

  // the overlay owns the keyboard while open: Esc closes, Left/Right cycle
  // metrics, D/W/M/Q/Y switch ranges, X shares. Capture-phase +
  // stopImmediatePropagation so the dial's own key handlers stay quiet.
  // A nested modal (CROPS / EXPLAIN / share / the manual) owns the keyboard
  // while it is up, so the overlay stands down until it closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const nested = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(
        (el) => el !== rootRef.current && getComputedStyle(el).display !== 'none',
      );
      if (nested) return; // let the inner modal handle it (and close on Esc)
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        e.stopImmediatePropagation();
        requestClose();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (canCycle) onCycle(e.key === 'ArrowRight' ? 1 : -1);
      } else if (['d', 'w', 'm', 'q', 'y'].includes(k)) {
        e.stopImmediatePropagation();
        setRange(k as Range);
      } else if (k === 'x') {
        e.stopImmediatePropagation();
        setShareOpen(true);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [requestClose, onCycle, canCycle]);

  // range follows the metric's default when the metric changes on cycle
  useEffect(() => setRange(initialRange), [metric.metric_key, initialRange]);

  // ── head sync (PR E) ──────────────────────────────────────────────────
  // A client-side (soft-nav) overlay open changes the URL but not the head, so
  // the canonical stayed on "/" and the Dataset JSON-LD was absent. Keep the
  // title, canonical link and Dataset LD correct on open AND on Left/Right
  // cycle, matching what a direct /pulse load produces; restore the underlying
  // page's head on close. Defined BEFORE the per-metric effect so it captures
  // the original (homepage) head before that effect overwrites it.
  useEffect(() => {
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const origTitle = document.title;
    const origCanonical = canonicalEl?.getAttribute('href') ?? null;
    // a direct load renders its own Dataset server-side; a soft-nav open has none
    const preexistingDataset = !!document.getElementById('pulse-dataset');
    return () => {
      document.title = origTitle;
      if (canonicalEl && origCanonical !== null) canonicalEl.setAttribute('href', origCanonical);
      if (!preexistingDataset) document.getElementById('pulse-dataset')?.remove();
    };
  }, []);

  useEffect(() => {
    const canonicalEl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    // use the canonical HOST (not location.origin) so the injected LD matches
    // the server-rendered origin even on workers.dev / localhost
    const canonicalOrigin = canonicalEl ? new URL(canonicalEl.href).origin : location.origin;
    document.title = pulseMeta(metric.label, metric.description).title;
    canonicalEl?.setAttribute('href', `${canonicalOrigin}/pulse/${metric.metric_key}`);

    let cancelled = false;
    const upsertDataset = (coverage: { first: string | null; last: string | null } | null) => {
      let el = document.getElementById('pulse-dataset') as HTMLScriptElement | null;
      if (!el) {
        el = document.createElement('script');
        el.id = 'pulse-dataset';
        el.type = 'application/ld+json';
        document.head.appendChild(el);
      }
      el.textContent = JSON.stringify(pulseDataset(metric, coverage, canonicalOrigin));
    };
    // temporalCoverage needs the stored first/last date; this fetch shares the
    // browser/edge cache with PulseChart's identical request
    fetch(`/api/metric/${metric.metric_key}?range=m`)
      .then((r) => (r.ok ? (r.json() as Promise<{ coverage?: { first: string | null; last: string | null } | null }>) : null))
      .then((d) => !cancelled && upsertDataset(d?.coverage ?? null))
      .catch(() => !cancelled && upsertDataset(null));
    return () => {
      cancelled = true;
    };
  }, [metric.metric_key, metric.label, metric.description, metric.source_name, metric.source_url]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareData = {
    value: kpi ? `${kpi.value}${kpi.suffix ? ' ' + kpi.suffix : ''}` : metric.label,
    label: metric.label,
    index: categoryIndex(metric.category),
    url: `${origin}/pulse/${metric.metric_key}`,
    caption: metric.caption ?? undefined,
  };

  return (
    <div
      ref={rootRef}
      className={`pulse-overlay fixed inset-0 z-[16] flex items-center justify-center p-3 sm:p-6 ${
        reducedMotion ? '' : 'pulse-overlay--anim'
      } ${closing ? 'pulse-overlay--closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${metric.label} detail`}
      onPointerDown={(e) => {
        if (e.target === rootRef.current) requestClose();
      }}
    >
      <div className={`pulse-hud plus-field ${closing ? 'pulse-hud--closing' : ''}`}>
        {/* HUD frame: bracket edges + corner ticks draw in on open */}
        <svg className="hud-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="hud-edge" pathLength={1} d="M 8 0.6 L 99.4 0.6 L 99.4 99.4 L 0.6 99.4 L 0.6 0.6 L 8 0.6" />
          <path className="hud-tick" pathLength={1} d="M 0.6 8 L 0.6 0.6 L 8 0.6" />
          <path className="hud-tick" pathLength={1} d="M 92 99.4 L 99.4 99.4 L 99.4 92" />
        </svg>
        {!reducedMotion && <span className="hud-scan" aria-hidden="true" />}

        {/* title bar: PULSE // METRIC + barcode + controls */}
        <div className="hud-titlebar">
          <span className="hud-title">
            PULSE <span className="hud-slash">//</span> {metric.label.toUpperCase()}
          </span>
          <span className="barcode hud-barcode" aria-hidden="true" />
          <div className="hud-titlebar-actions">
            <button
              onClick={() => setShareOpen(true)}
              className="hud-icon-btn"
              aria-label="Share this metric as an image"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 3v12M7 8l5-5 5 5M5 21h14" />
              </svg>
            </button>
            <button onClick={requestClose} className="cmd-chip" aria-label="Close detail">
              <kbd>ESC</kbd>
              <span>CLOSE</span>
            </button>
          </div>
        </div>

        {/* body: two columns on desktop, stacked on mobile */}
        <div className="hud-body">
          {/* LEFT: numeral, caption, CROPS, principle */}
          <div key={metric.metric_key} className={`hud-col-left ${reducedMotion ? '' : 'overlay-swap'}`}>
            <SectionHeader
              index={categoryIndex(metric.category).replace('_', '')}
              title={CATEGORY_LABELS[metric.category] ?? metric.category}
              subtitle="pulse detail"
              accent
            />
            <h1 className="mono-label mt-5 uppercase tracking-[0.2em] text-[color:var(--ink-soft)]">{metric.label}</h1>
            {kpi ? (
              <p
                className="mt-1 max-w-full font-display font-normal leading-none tabular-nums text-[color:var(--ink)]"
                style={{ fontSize: `clamp(2.4rem, 20cqi, ${valMaxRem}rem)`, viewTransitionName: reducedMotion ? undefined : 'kpi-morph' }}
              >
                {kpi.value}
                {kpi.suffix && (
                  <span className="ml-3 align-baseline text-[0.28em] uppercase tracking-widest text-[color:var(--ink-soft)]">
                    {kpi.suffix}
                  </span>
                )}
              </p>
            ) : (
              <p className="micro mt-4">NO DATA COLLECTED FOR THIS METRIC YET</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              {metric.caption && <span className="label-big text-[color:var(--accent)]">{metric.caption}</span>}
              {metric.latest && <span className="micro text-[color:var(--ink-faint)]">AS OF {metric.latest.date}</span>}
            </div>

            {/* principle line + CROPS badge */}
            {principle && (
              <div className="hud-principle mt-6 flex items-center gap-3">
                <CropsBadge category={metric.category} context={metric.label} />
                <span className="font-display text-xs uppercase tracking-wide text-[color:var(--ink)] sm:text-sm">
                  {principle.title}
                </span>
              </div>
            )}

            {/* one line of description; the rest lives behind [?] EXPLAIN */}
            <div className="mt-5 flex items-start gap-3">
              <p className="mono-label line-clamp-2 max-w-md text-[color:var(--ink-soft)]">{metric.description}</p>
              <ExplainChip title={metric.label} text={metric.description} />
            </div>
          </div>

          {/* divider */}
          <div className="hud-divider" aria-hidden="true" />

          {/* RIGHT: chart with ranges + scrub */}
          <div className="hud-col-right">
            {metric.latest ? (
              <PulseChart
                metricKey={metric.metric_key}
                unit={metric.unit}
                range={range}
                onRange={setRange}
                seedRange={initialRange}
                seedPoints={initialPoints}
              />
            ) : (
              <p className="micro flex h-full items-center justify-center text-center text-[color:var(--ink-faint)]">
                NO SERIES YET
              </p>
            )}
          </div>
        </div>

        {/* footer: barcode + source line */}
        <div className="hud-footer">
          <span className="barcode h-2.5 flex-1 opacity-70" aria-hidden="true" />
          <p className="micro whitespace-nowrap text-[color:var(--ink-faint)]">
            SOURCE ·{' '}
            <a href={metric.source_url} className="underline hover:font-bold text-[color:var(--ink)]">
              {metric.source_name}
            </a>
            {licence}
          </p>
        </div>
      </div>

      {shareOpen && (
        <Suspense fallback={null}>
          <ShareModal data={shareData} onClose={() => setShareOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
