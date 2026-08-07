import type { APIRoute } from 'astro';
import { buildSnapshot, SNAPSHOT_KEY } from '../../../worker/snapshot.ts';
import { STALE_THRESHOLD_MS } from '../../../worker/alert.ts';
import { edgeCached } from '../../lib/edge-cache';

export const prerender = false;

const HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'public, s-maxage=3600, max-age=300',
  'access-control-allow-origin': '*',
};

export const GET: APIRoute = (ctx) =>
  edgeCached(ctx, async () => {
    const { DB, SNAP } = ctx.locals.runtime.env;

    let body = await SNAP.get(SNAPSHOT_KEY);
    if (!body) {
      // fresh deploy or KV wiped: compute once from D1 and store
      body = JSON.stringify(await buildSnapshot(DB));
      await SNAP.put(SNAPSHOT_KEY, body);
    }

    const snap = JSON.parse(body) as Record<string, unknown> & { generated_at?: string };

    // Staleness reflects the last successful COLLECTION, not when the snapshot
    // JSON was last built — a self-heal rebuild bumps generated_at but does not
    // mean the data is fresh. Fall back to generated_at only before the first
    // collector run (fresh deploy) or if the table isn't migrated yet.
    let finished_at: string | null = null;
    try {
      const row = await DB.prepare(
        'SELECT finished_at FROM collector_runs ORDER BY finished_at DESC LIMIT 1',
      ).first<{ finished_at: string }>();
      finished_at = row?.finished_at ?? null;
    } catch {
      finished_at = null;
    }
    if (!finished_at) finished_at = snap.generated_at ?? null;
    const is_stale = finished_at ? Date.now() - Date.parse(finished_at) > STALE_THRESHOLD_MS : false;

    return new Response(JSON.stringify({ ...snap, finished_at, is_stale }), { headers: HEADERS });
  });
