import type { APIRoute } from 'astro';
import { buildSnapshot, SNAPSHOT_KEY, type Snapshot } from '../../../worker/snapshot.ts';
import { BADGES, badgeMetric, badgeValue, renderBadge } from '../../lib/badge';

export const prerender = false;

// Tuned to the daily snapshot cadence: 5 min in the browser, 1 h at the edge —
// well under the daily refresh, and never a per-request RPC hit.
const SVG_HEADERS = {
  'content-type': 'image/svg+xml; charset=utf-8',
  'cache-control': 'public, max-age=300, s-maxage=3600',
  'access-control-allow-origin': '*',
};

export const GET: APIRoute = async ({ params, locals }) => {
  const slug = params.slug ?? '';
  const badge = BADGES[slug];
  if (!badge) {
    return new Response(`Unknown badge "${slug}". See /badges for the available ones.`, {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  // Cached data only: KV snapshot, self-healing from D1 (never the live RPC).
  // Any failure degrades to a "—" badge rather than a broken image.
  const { DB, SNAP } = locals.runtime.env;
  let snapshot: Snapshot | null = null;
  try {
    const raw = await SNAP.get(SNAPSHOT_KEY);
    snapshot = raw ? (JSON.parse(raw) as Snapshot) : await buildSnapshot(DB);
  } catch {
    snapshot = null;
  }

  const value = badgeValue(badgeMetric(snapshot, badge.metric_key));
  return new Response(renderBadge(badge.label, value), { headers: SVG_HEADERS });
};
