import { useMemo, useState } from 'react';
import landDots from '../data/land-dots.json';
import geo from '../data/nodes-geo.json';
import ExplainChip from './ExplainChip';
import CropsBadge from './CropsBadge';

/**
 * Decentralisation made visible: a dot-matrix world map baked from
 * public-domain Natural Earth data. Countries running nodes glow by share;
 * the top countries get red-dot annotations. No map library, no tiles.
 * Country aggregates only, nothing that could identify a node.
 */

const W = 760;
const H = 305;
const PAD = 10;

type Layer = 'execution' | 'consensus';

interface CountryStat {
  iso2: string;
  name: string;
  count: number;
  pct: number;
}

function project(lon: number, lat: number): [number, number] {
  const x = PAD + ((lon + 180) / 360) * (W - PAD * 2);
  const y = PAD + ((landDots.latMax - lat) / (landDots.latMax - landDots.latMin)) * (H - PAD * 2);
  return [x, y];
}

export default function NodeMap({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const [layer, setLayer] = useState<Layer>('execution');
  const data = geo[layer] as { total: number; countries: CountryStat[]; clients: CountryStat[] };

  const shareByIso = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data.countries) m.set(c.iso2, c.pct);
    return m;
  }, [data]);

  // brightness by log-scaled share; countries without nodes stay faint
  const maxPct = data.countries[0]?.pct ?? 1;
  const intensity = (pct: number | undefined) =>
    pct === undefined ? 0.14 : 0.3 + 0.7 * (Math.log1p(pct) / Math.log1p(maxPct));

  // annotate the top countries at the centroid of their dots, with fixed
  // per-country label offsets pushed into open water so nothing collides
  const annotations = useMemo(() => {
    const centroids = new Map<string, { x: number; y: number; n: number }>();
    for (const [lon, lat, ci] of landDots.dots as [number, number, number][]) {
      const iso = landDots.isoList[ci]!;
      const c = centroids.get(iso) ?? { x: 0, y: 0, n: 0 };
      const [x, y] = project(lon, lat);
      c.x += x;
      c.y += y;
      c.n += 1;
      centroids.set(iso, c);
    }
    const OFFSETS: Record<string, [number, number]> = {
      US: [-64, 42], DE: [58, -66], GB: [-72, -28], FI: [74, -8], FR: [-64, 34],
      SG: [26, 22], JP: [34, -18], CA: [-40, -34], CN: [30, 34], NL: [-80, 6], KR: [40, 8],
    };
    return data.countries.slice(0, 6).flatMap((c, i) => {
      const cen = centroids.get(c.iso2);
      if (!cen) return [];
      const cx = cen.x / cen.n;
      const cy = cen.y / cen.n;
      const [ox, oy] = OFFSETS[c.iso2] ?? [24, i % 2 === 0 ? -24 : 24];
      // labels stay inside the viewBox: the svg clips, so an off-map label
      // renders as half a line of text (DE used to lose its top half)
      const lx = Math.min(Math.max(cx + ox, 30), W - 30);
      const ly = Math.min(Math.max(cy + oy, 12), H - 6);
      return [{ iso2: c.iso2, pct: c.pct, cx, cy, lx, ly }];
    });
  }, [data]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2" role="tablist" aria-label="Node layer">
        <CropsBadge category="censorship-resistance" context="Node distribution: no jurisdiction can switch it off" />
        <ExplainChip
          title="Where Ethereum lives"
          text={[
            'Ethereum is thousands of computers run by volunteers, companies and stakers across the world. The wider the spread across countries and client software, the harder the network is to switch off, censor or break by accident.',
            'That spread is the point. Country-level aggregates only; nothing identifies an individual node.',
          ]}
        />
        {(['execution', 'consensus'] as Layer[]).map((l) => (
          <button
            key={l}
            role="tab"
            aria-selected={layer === l}
            onClick={() => setLayer(l)}
            className={`micro cursor-pointer border px-2 py-1 ${
              layer === l
                ? 'invert border-[color:var(--ink)]'
                : 'border-[color:var(--hairline)] text-[color:var(--ink-soft)]'
            }`}
          >
            {l.toUpperCase()} · {geo[l].total.toLocaleString('en-GB')} NODES
          </button>
        ))}
      </div>

      {/* country status grid strip: one box flickers as data refreshes */}
      <div className="mb-3 flex flex-wrap gap-1" aria-label="Top countries by node count">
        {data.countries.slice(0, 12).map((c, i) => (
          <div
            key={c.iso2}
            className={`brackets flex min-w-[64px] flex-col px-2 py-1 ${i === 0 ? 'invert' : ''}`}
            style={i === 5 ? { animation: 'country-flicker 7s steps(2) infinite' } : undefined}
          >
            <span className="micro font-bold">{c.iso2}</span>
            <span className="micro tabular-nums">{c.count}</span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="node-map-svg plus-field block w-full" role="img" aria-label={`World map of ${layer} layer node distribution by country`}>
        {(landDots.dots as [number, number, number][]).map(([lon, lat, ci], i) => {
          const iso = landDots.isoList[ci]!;
          const pct = shareByIso.get(iso);
          const [x, y] = project(lon, lat);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={1.5}
              fill="var(--ink)"
              opacity={intensity(pct)}
            />
          );
        })}

        {annotations.map((a, ai) => (
          <g key={a.iso2} className="font-mono">
            {/* the map's one red element: the largest country's callout */}
            <line x1={a.cx} y1={a.cy} x2={a.lx} y2={a.ly} stroke={ai === 0 ? 'var(--accent)' : 'var(--ink)'} strokeWidth={ai === 0 ? 1 : 0.6} opacity={ai === 0 ? 1 : 0.7} />
            <circle cx={a.cx} cy={a.cy} r="2.6" fill={ai === 0 ? 'var(--accent)' : 'var(--ink)'} />
            <text
              x={a.lx + (a.lx < a.cx ? -3 : 3)}
              y={a.ly + 3}
              textAnchor={a.lx < a.cx ? 'end' : 'start'}
              fill="var(--ink)"
              style={{ fontSize: 12, letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}
            >
              {a.iso2} {a.pct.toFixed(1)}%
            </text>
          </g>
        ))}

        {/* radar sweep, one pass per beat */}
        {!reducedMotion && (
          <g className="map-sweep">
            <rect x="-50" y="0" width="50" height={H} fill="url(#sweep-grad)" />
          </g>
        )}
        <defs>
          <linearGradient id="sweep-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
      </svg>

      <p className="micro mt-2 text-[color:var(--ink-faint)]">
        COUNTRY-LEVEL AGGREGATES ONLY · {data.countries.length} COUNTRIES · SOURCE {geo.source.name.toUpperCase()} · AS
        OF {geo.as_of}
      </p>

      {/* client diversity bars: the largest client share is the number that matters */}
      <div className="node-tables mt-4 grid gap-6 sm:grid-cols-2">
        {(['execution', 'consensus'] as Layer[]).map((l) => {
          const clients = geo[l].clients as CountryStat[];
          return (
            <div key={l}>
              <h3 className="micro mb-3">{l.toUpperCase()} CLIENTS</h3>
              <table className="w-full border-collapse">
                <tbody>
                  {clients.map((c) => {
                    const supermajority = c.pct > 50;
                    return (
                      <tr key={c.name} className="hairline-t">
                        <td className="mono-label w-24 py-1.5 pr-2">{c.name}</td>
                        <td className="py-1.5">
                          <div
                            className="h-1.5"
                            style={{
                              width: `${c.pct}%`,
                              background: supermajority ? 'var(--accent)' : 'var(--ink-soft)',
                            }}
                          />
                        </td>
                        <td
                          className={`mono-label w-14 py-1.5 text-right tabular-nums ${
                            supermajority ? 'text-[color:var(--accent)]' : ''
                          }`}
                        >
                          {c.pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {clients.some((c) => c.pct > 50) && (
                <p className="micro mt-2 text-[color:var(--accent)]">
                  ⚠ LARGEST CLIENT ABOVE 50% — A SINGLE BUG COULD DISRUPT THE CHAIN
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
