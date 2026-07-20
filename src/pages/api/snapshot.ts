import type { APIRoute } from 'astro';
import { buildSnapshot, SNAPSHOT_KEY } from '../../../worker/snapshot.ts';
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
      const snapshot = await buildSnapshot(DB);
      body = JSON.stringify(snapshot);
      await SNAP.put(SNAPSHOT_KEY, body);
    }
    return new Response(body, { headers: HEADERS });
  });
