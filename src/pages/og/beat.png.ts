/**
 * Dynamic BEAT social card (spec §33.A) — 1200×800 (3:2) PNG rendered live with
 * satori + resvg-wasm. It reads ONLY `snapshot:latest` from KV (never the RPC or
 * D1) and composes the card from a snapshot metric, the live beacon slot (pure
 * clock maths), and the CROPS taxonomy line.
 *
 * ?metric=<metric_key> optionally selects which metric to render; absent (or an
 * unknown key) falls back to the first featured metric by sort. ?theme=dark
 * renders the bone-on-black variant. The edge cache keys on the full URL
 * (query string included), so each param combination caches independently.
 *
 * It NEVER 500s: any failure — KV miss, malformed snapshot, unknown metric,
 * satori/resvg throw — falls back to the baked PNG committed in
 * src/lib/og-fallback.ts.
 */
import type { APIRoute } from 'astro';
import { renderBeat } from '../../lib/og-render';
import { OG_FALLBACK_PNG, OG_FALLBACK_PNG_DARK } from '../../lib/og-fallback';
import { resolveTheme } from '../../lib/og-card.mjs';
import { SNAPSHOT_KEY, type Snapshot } from '../../../worker/snapshot.ts';
import { kpiValue } from '../../lib/format';
import { slotClock } from '../../lib/clock';

export const prerender = false;

// CROPS category → badge letter. Mirrors the CROPS map in CropsBadge.tsx; kept
// inline so this image route pulls no React component into the Worker bundle.
const CROPS_LETTER: Record<string, string> = {
  'censorship-resistance': 'CR',
  openness: 'O',
  privacy: 'P',
  security: 'S',
};

const CACHE = 'public, s-maxage=3600, max-age=300'; // snapshot cadence, not 12s

function png(bytes: Uint8Array, extra?: Record<string, string>): Response {
  // Uint8Array is a valid BodyInit at runtime; the DOM lib's BodyInit type is
  // narrower than the Workers runtime, so cast through the buffer view.
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'content-type': 'image/png',
      'cache-control': CACHE,
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });
}

export const GET: APIRoute = async ({ locals, url }) => {
  // ?theme=dark → bone-on-black card; anything else (incl. absent) → light paper.
  const theme = resolveTheme(url.searchParams.get('theme'));
  const fallback = theme === 'dark' ? OG_FALLBACK_PNG_DARK : OG_FALLBACK_PNG;
  try {
    const env = locals.runtime.env;
    // KV only — do NOT self-heal from D1 here (an image route must stay cheap).
    const raw = await env.SNAP.get(SNAPSHOT_KEY);
    const snapshot = raw ? (JSON.parse(raw) as Snapshot) : null;

    // Default: the first featured metric by sort (unchanged, byte-identical for
    // the no-param case). ?metric=<key> overrides it with a specific snapshot
    // metric; an absent/unknown key degrades to this default rather than erroring.
    const featured = (snapshot?.metrics ?? [])
      .filter((m) => m.featured)
      .sort((a, b) => a.sort - b.sort)[0];
    const metricParam = url.searchParams.get('metric');
    const requested = metricParam ? snapshot?.metrics?.find((m) => m.metric_key === metricParam) : undefined;
    const metric = requested ?? featured;

    if (!metric) return png(fallback); // no data yet → baked card

    const { value, suffix } = kpiValue(metric.latest.value, metric.unit);
    const label = metric.label.length > 26 ? `${metric.label.slice(0, 25)}…` : metric.label;

    const bytes = await renderBeat({
      value,
      suffix,
      label,
      letter: CROPS_LETTER[metric.category],
      slot: slotClock(Date.now()).slot,
      asOf: snapshot?.generated_at?.slice(0, 10) ?? null,
      theme,
    });
    return png(bytes);
  } catch (err) {
    console.error('[og/beat] render failed, serving baked fallback', err);
    return png(fallback, { 'x-og-fallback': '1' });
  }
};
