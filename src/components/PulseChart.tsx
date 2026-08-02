import { useEffect, useMemo, useRef, useState } from 'react';
import type { Point, Range } from '../lib/aggregate';
import { axisValue } from '../lib/format';

/**
 * The instrument readout: hand-rolled SVG area chart with monotone cubic
 * interpolation (Fritsch-Carlson), hairline axes, dotted baseline, a red
 * scrub cursor and a fixed readout. No charting library.
 */

const W = 860;
const H = 300;
const M = { top: 18, right: 8, bottom: 26, left: 54 };

const RANGE_LABELS: Record<Range, string> = { d: 'D', w: 'W', m: 'M', q: 'Q', y: 'Y' };

interface Props {
  metricKey: string;
  unit: string;
  /** controlled range (the overlay drives it via D/W/M/Q/Y keys) */
  range: Range;
  onRange: (r: Range) => void;
  /** seed cache so the first render never flashes a fetch */
  seedRange?: Range;
  seedPoints?: Point[];
}

/** Fritsch-Carlson monotone cubic tangents -> cubic bezier path */
export function monotonePath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n === 0) return '';
  if (n === 1) return `M${xs[0]},${ys[0]}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1]! - xs[i]!);
    slope.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  }
  const m: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1]! * slope[i]! <= 0) m.push(0);
    else {
      const w1 = 2 * dx[i]! + dx[i - 1]!;
      const w2 = dx[i]! + 2 * dx[i - 1]!;
      m.push((w1 + w2) / (w1 / slope[i - 1]! + w2 / slope[i]!));
    }
  }
  m.push(slope[n - 2]!);
  let d = `M${xs[0]!.toFixed(2)},${ys[0]!.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = xs[i]! + dx[i]! / 3;
    const c1y = ys[i]! + (m[i]! * dx[i]!) / 3;
    const c2x = xs[i + 1]! - dx[i]! / 3;
    const c2y = ys[i + 1]! - (m[i + 1]! * dx[i]!) / 3;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${xs[i + 1]!.toFixed(2)},${ys[i + 1]!.toFixed(2)}`;
  }
  return d;
}

export default function PulseChart({ metricKey, unit, range, onRange, seedRange, seedPoints }: Props) {
  const seeded = seedRange && seedPoints ? { [seedRange]: seedPoints } : {};
  const [points, setPoints] = useState<Point[]>(seedRange === range && seedPoints ? seedPoints : []);
  const [loading, setLoading] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  // cache is per metric: a new metric (overlay cycle) starts fresh
  const cache = useRef<Partial<Record<Range, Point[]>>>(seeded);
  const cacheKey = useRef(metricKey);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (cacheKey.current !== metricKey) {
      cache.current = {};
      cacheKey.current = metricKey;
    }
    const cached = cache.current[range];
    if (cached) {
      setPoints(cached);
      return;
    }
    let live = true;
    setLoading(true);
    fetch(`/api/metric/${metricKey}?range=${range}`)
      .then((r) => r.json() as Promise<{ points: Point[] }>)
      .then((d) => {
        cache.current[range] = d.points;
        if (live) setPoints(d.points);
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [range, metricKey]);

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const lo = min === max ? min - 1 : min - (max - min) * 0.06;
    const hi = min === max ? max + 1 : max + (max - min) * 0.04;
    const xs = points.map((_, i) => M.left + (i / (points.length - 1)) * (W - M.left - M.right));
    const ys = points.map((p) => M.top + ((hi - p.value) / (hi - lo)) * (H - M.top - M.bottom));
    const line = monotonePath(xs, ys);
    const area = `${line}L${xs[xs.length - 1]},${H - M.bottom}L${xs[0]},${H - M.bottom}Z`;
    // four horizontal grid values
    const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => ({
      y: M.top + f * (H - M.top - M.bottom),
      v: hi - f * (hi - lo),
    }));
    return { xs, ys, line, area, ticks };
  }, [points]);

  const active = scrub !== null && geom ? Math.min(points.length - 1, scrub) : null;

  const onMove = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || !geom) return;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    geom.xs.forEach((px, i) => {
      const d = Math.abs(px - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setScrub(best);
  };

  const readoutIdx = active ?? points.length - 1;
  const readout = points[readoutIdx];

  // callout geometry (in-SVG box + elbow leader from the scrub cursor)
  const callout = (() => {
    if (!geom || !readout) return null;
    const boxW = 190;
    const boxH = 30;
    const boxY = M.top - 4;
    const cx = geom.xs[active ?? points.length - 1]!;
    const onRightHalf = cx > (M.left + W - M.right) / 2;
    const boxX = onRightHalf ? M.left + 2 : W - M.right - boxW;
    const anchorX = onRightHalf ? boxX + boxW : boxX; // near edge of the box
    return { boxW, boxH, boxX, boxY, cx, anchorX };
  })();

  return (
    <div className="brackets brackets-ink relative px-3 pb-3 pt-2">
      {/* range control: command-bar-style chips (D/W/M/Q/Y keys mirror these) */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Range">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={range === r}
            onClick={() => onRange(r)}
            className={`cmd-chip ${range === r ? 'cmd-active' : ''}`}
          >
            <span>{RANGE_LABELS[r]}</span>
          </button>
        ))}
        {loading && <span className="micro ml-1 text-[color:var(--ink-faint)]">LOADING…</span>}
      </div>

      {points.length < 2 ? (
        <p className="micro px-4 py-10 text-center">
          {loading ? 'LOADING…' : 'NOT ENOUGH HISTORY YET — THIS SERIES ACCUMULATES DAILY'}
        </p>
      ) : (
        geom && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className={`block w-full touch-pan-y select-none ${loading ? 'opacity-40' : ''}`}
            style={{ transition: 'opacity 150ms' }}
            role="img"
            aria-label={`${metricKey} chart, ${points.length} points`}
            onMouseMove={(e) => onMove(e.clientX)}
            onMouseLeave={() => setScrub(null)}
            onTouchMove={(e) => e.touches[0] && onMove(e.touches[0].clientX)}
            onTouchEnd={() => setScrub(null)}
          >
            <defs>
              {/* hatched area fill: nothing fills flat in this system */}
              <pattern id={`hatch-${metricKey}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink)" strokeWidth="1" strokeOpacity="0.5" />
              </pattern>
            </defs>

            {/* hairline grid at >=3:1 (line-data) + mono tick labels */}
            {geom.ticks.map((t, i) => (
              <g key={i}>
                <line x1={M.left} y1={t.y} x2={W - M.right} y2={t.y} stroke="var(--line-data)" strokeWidth="1" strokeDasharray="1 4" />
                <text
                  x={M.left - 8}
                  y={t.y + 3}
                  textAnchor="end"
                  fill="var(--ink)"
                  style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', fontWeight: 700 }}
                >
                  {axisValue(t.v, unit)}
                </text>
              </g>
            ))}

            {/* dotted baseline */}
            <line
              x1={M.left}
              y1={H - M.bottom}
              x2={W - M.right}
              y2={H - M.bottom}
              stroke="var(--line-data)"
              strokeWidth="1"
              strokeDasharray="2 5"
            />

            <path key={`a-${range}-${points.length}`} className="chart-fade" d={geom.area} fill={`url(#hatch-${metricKey})`} />
            <path
              key={`l-${range}-${points.length}`}
              className="chart-fade"
              d={geom.line}
              fill="none"
              stroke="var(--ink)"
              strokeWidth="1.6"
            />

            {/* latest point: the one always-red mark */}
            <circle cx={geom.xs[points.length - 1]} cy={geom.ys[points.length - 1]} r="3.4" fill="var(--accent)" />

            {/* x labels: first and last date */}
            <text x={M.left} y={H - 8} fill="var(--ink)" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              {points[0]!.date}
            </text>
            <text
              x={W - M.right}
              y={H - 8}
              textAnchor="end"
              fill="var(--ink)"
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}
            >
              {points[points.length - 1]!.date}
            </text>

            {/* scrub cursor: red, with an elbow leader to the readout callout */}
            {active !== null && callout && (
              <g>
                <line x1={geom.xs[active]} y1={M.top} x2={geom.xs[active]} y2={H - M.bottom} stroke="var(--accent)" strokeWidth="1" />
                <circle cx={geom.xs[active]} cy={geom.ys[active]} r="3.6" fill="var(--accent)" />
                <polyline
                  points={`${geom.xs[active]},${geom.ys[active]} ${geom.xs[active]},${callout.boxY + callout.boxH / 2} ${callout.anchorX},${callout.boxY + callout.boxH / 2}`}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1"
                />
              </g>
            )}

            {/* readout callout box (elbow leader points at it while scrubbing) */}
            {callout && readout && (
              <g>
                <rect x={callout.boxX} y={callout.boxY} width={callout.boxW} height={callout.boxH} fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />
                <circle cx={callout.boxX + 12} cy={callout.boxY + callout.boxH / 2} r="3" fill="var(--accent)" />
                <text
                  x={callout.boxX + 24}
                  y={callout.boxY + callout.boxH / 2 + 4}
                  fill="var(--ink)"
                  style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', fontWeight: 600 }}
                >
                  {readout.date} · {axisValue(readout.value, unit)}
                </text>
              </g>
            )}
          </svg>
        )
      )}
    </div>
  );
}
