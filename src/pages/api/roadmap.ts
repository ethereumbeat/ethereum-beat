import type { APIRoute } from 'astro';
import { buildRoadmapSnapshot, ROADMAP_KEY } from '../../../worker/roadmap.ts';
import { edgeCached } from '../../lib/edge-cache';

export const prerender = false;

const HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'public, s-maxage=3600, max-age=300',
  'access-control-allow-origin': '*',
};

/** The roadmap as open JSON. Serves the KV snapshot; self-heals by building
 *  from D1 if the key is missing (like /api/snapshot). */
export const GET: APIRoute = (ctx) =>
  edgeCached(ctx, async () => {
    const { DB, SNAP } = ctx.locals.runtime.env;
    let body = await SNAP.get(ROADMAP_KEY);
    if (!body) {
      body = JSON.stringify(await buildRoadmapSnapshot(DB));
      await SNAP.put(ROADMAP_KEY, body);
    }
    return new Response(body, { headers: HEADERS });
  });
