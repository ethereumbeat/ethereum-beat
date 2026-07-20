import { useEffect, useRef, useState } from 'react';
import type { SnapshotMetric } from '../lib/metrics';
import { kpiValue } from '../lib/format';
import Sparkline from './Sparkline';
import CropsBadge from './CropsBadge';

/**
 * The featured KPI: category index, label, one huge tabular numeral with a
 * count-up on change, a neutral delta line, and a 30-point sparkline.
 */

interface Props {
  metric: SnapshotMetric;
  companionText?: string | null;
  reducedMotion: boolean;
  /** open the pulse overlay instead of navigating (pass 12) */
  onOpen?: (key: string) => void;
}

function useCountUp(target: number, unit: string, reducedMotion: boolean): string {
  const [display, setDisplay] = useState(() => kpiValue(target, unit).value);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = target;
    if (reducedMotion || from === target) {
      setDisplay(kpiValue(target, unit).value);
      return;
    }
    const t0 = performance.now();
    const dur = 460;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - (1 - p) ** 3;
      setDisplay(kpiValue(from + (target - from) * eased, unit).value);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, unit, reducedMotion]);

  return display;
}

export default function KpiCard({ metric, companionText, reducedMotion, onOpen }: Props) {
  const { unit } = metric;
  const display = useCountUp(metric.latest.value, unit, reducedMotion);
  const suffix = kpiValue(metric.latest.value, unit).suffix;
  const [swapKey, setSwapKey] = useState(metric.metric_key);
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    if (swapKey !== metric.metric_key) {
      setSwapKey(metric.metric_key);
      if (!reducedMotion) {
        setGlitch(true);
        const t = setTimeout(() => setGlitch(false), 90);
        return () => clearTimeout(t);
      }
    }
  }, [metric.metric_key, swapKey, reducedMotion]);

  return (
    <a
      href={`/pulse/${metric.metric_key}`}
      className={`kpi-card group block text-center no-underline outline-none ${glitch ? 'kpi-glitch' : ''}`}
      aria-live="off"
      onClick={(e) => {
        // left-click with no modifier opens the overlay in place; the href
        // stays for middle-click, right-click and crawlers
        if (onOpen && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
          e.preventDefault();
          onOpen(metric.metric_key);
        }
      }}
    >
      <div key={swapKey}>
        <div className="label-big mb-2 text-[color:var(--ink)]">
          {metric.label}
        </div>
        <div
          data-kpi-number
          className="whitespace-nowrap font-display font-normal leading-none tracking-normal tabular-nums"
          style={{ fontSize: 'var(--text-kpi)', fontVariantNumeric: 'tabular-nums' }}
        >
          {display}
          {suffix && (
            <span className="ml-3 align-baseline text-[0.32em] font-normal uppercase tracking-widest text-[color:var(--ink-soft)]">
              {suffix}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-center gap-2">
          <CropsBadge category={metric.category} context={metric.label} />
          <span className="hidden sm:inline-flex">
            <Sparkline values={metric.spark} />
          </span>
        </div>
      </div>
    </a>
  );
}
