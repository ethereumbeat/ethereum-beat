import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Point, Range } from '../lib/aggregate';
import { kpiValue } from '../lib/format';
import { CATEGORY_LABELS, categoryIndex } from '../lib/metrics';
import { principleFor } from '../lib/values';
import CropsBadge from './CropsBadge';
import ExplainChip from './ExplainChip';
import PulseChart from './PulseChart';
import SectionHeader from './SectionHeader';
const ShareModal = lazy(() => import('./ShareModal'));

/**
 * Pass 12: /pulse/[metric] is a full-screen overlay over the live dial,
 * not a document. Instrument grammar, zero document styling. The dial keeps
 * beating underneath through the 5% transparency; the margin frame and
 * command bar float above it.
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
  const rootRef = useRef<HTMLDivElement>(null);

  const kpi = metric.latest ? kpiValue(metric.latest.value, metric.unit) : null;
  const principle = principleFor(metric.category);
  const licence = metric.source_name === 'growthepie' ? ' · CC BY 4.0' : '';

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
        onClose();
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
  }, [onClose, onCycle, canCycle]);

  // range follows the metric's default when the metric changes on cycle
  useEffect(() => setRange(initialRange), [metric.metric_key, initialRange]);

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
      className="pulse-overlay plus-field fixed inset-0 z-[16] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`${metric.label} detail`}
    >
      <div className="mx-auto flex min-h-full max-w-4xl flex-col px-4 pb-24 pt-16 sm:px-8">
        {/* header: category index + close + share */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <SectionHeader
            index={categoryIndex(metric.category).replace('_', '')}
            title={CATEGORY_LABELS[metric.category] ?? metric.category}
            subtitle="pulse detail"
            accent
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShareOpen(true)}
              className="group relative flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--hairline)] text-[color:var(--ink-soft)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
              aria-label="Share this metric as an image"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 3v12M7 8l5-5 5 5M5 21h14" />
              </svg>
            </button>
            <button onClick={onClose} className="cmd-chip" aria-label="Close detail">
              <kbd>ESC</kbd>
              <span>CLOSE</span>
            </button>
          </div>
        </div>

        {/* principle line: inverted panel + CROPS badge */}
        {principle && (
          <div className="invert brackets mb-8 flex items-center gap-3 px-4 py-3">
            <CropsBadge category={metric.category} context={metric.label} />
            <span className="font-display text-sm uppercase tracking-wide sm:text-base">{principle.title}</span>
            <span className="mono-label hidden text-[color:var(--paper)] opacity-80 sm:inline">— {principle.gloss}</span>
          </div>
        )}

        {/* the value, giant pixel numeral + caption */}
        <div key={metric.metric_key} className={reducedMotion ? '' : 'overlay-swap'}>
          <h1 className="mono-label uppercase tracking-[0.2em] text-[color:var(--ink-soft)]">{metric.label}</h1>
          {kpi ? (
            <p
              className="mt-2 font-display font-normal leading-none tabular-nums text-[color:var(--ink)]"
              style={{ fontSize: 'clamp(3rem, 12vw, 8rem)', viewTransitionName: reducedMotion ? undefined : 'kpi-morph' }}
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
          <div className="mt-3 flex items-center gap-3">
            {metric.caption && <span className="label-big text-[color:var(--accent)]">{metric.caption}</span>}
            {metric.latest && <span className="micro text-[color:var(--ink-faint)]">AS OF {metric.latest.date}</span>}
          </div>

          {/* one line of description; the rest lives behind [?] EXPLAIN */}
          <div className="mt-5 flex items-start gap-3">
            <p className="mono-label line-clamp-1 max-w-xl text-[color:var(--ink-soft)]">{metric.description}</p>
            <ExplainChip title={metric.label} text={metric.description} />
          </div>
        </div>

        {/* chart */}
        {metric.latest && (
          <div className="mt-10">
            <PulseChart
              metricKey={metric.metric_key}
              unit={metric.unit}
              range={range}
              onRange={setRange}
              seedRange={initialRange}
              seedPoints={initialPoints}
            />
          </div>
        )}

        {/* barcode separator + source line */}
        <div className="mt-auto pt-10">
          <div className="barcode mb-3 h-3 w-full opacity-70" aria-hidden="true" />
          <p className="micro text-[color:var(--ink-faint)]">
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
