/**
 * Dynamic BEAT social card (spec §33.A) — 1200×800 (3:2) PNG rendered live with
 * satori + resvg-wasm. It reads ONLY `snapshot:latest` from KV (never the RPC or
 * D1) and composes the card from the first featured metric, the live beacon slot
 * (pure clock maths), and the CROPS taxonomy line.
 *
 * It NEVER 500s: any failure — KV miss, malformed snapshot, satori/resvg throw —
 * falls back to the baked PNG committed in src/lib/og-fallback.ts.
 */
import type { APIRoute } from 'astro';
import { renderBeat } from '../../lib/og-render';
import { OG_FALLBACK_PNG } from '../../lib/og-fallback';
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

export const GET: APIRoute = async ({ locals }) => {
  try {
    const env = locals.runtime.env;
    // KV only — do NOT self-heal from D1 here (an image route must stay cheap).
    const raw = await env.SNAP.get(SNAPSHOT_KEY);
    const snapshot = raw ? (JSON.parse(raw) as Snapshot) : null;

    const featured = (snapshot?.metrics ?? [])
      .filter((m) => m.featured)
      .sort((a, b) => a.sort - b.sort)[0];

    if (!featured) return png(OG_FALLBACK_PNG); // no data yet → baked card

    const { value, suffix } = kpiValue(featured.latest.value, featured.unit);
    const label = featured.label.length > 26 ? `${featured.label.slice(0, 25)}…` : featured.label;

    const bytes = await renderBeat({
      value,
      suffix,
      label,
      letter: CROPS_LETTER[featured.category],
      slot: slotClock(Date.now()).slot,
      asOf: snapshot?.generated_at?.slice(0, 10) ?? null,
    });
    return png(bytes);
  } catch (err) {
    console.error('[og/beat] render failed, serving baked fallback', err);
    return png(OG_FALLBACK_PNG, { 'x-og-fallback': '1' });
  }
};
