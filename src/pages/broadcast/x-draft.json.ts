/**
 * The X (Twitter) draft, for manual posting — there is no free X API as of
 * Feb 2026, so the cron writes the generated post here and a human copies it.
 * Served from KV (refreshed daily by the broadcast cron); self-heals by
 * computing a fresh draft if the key is missing, exactly like /api/snapshot.
 */
import type { APIRoute } from 'astro';
import { X_DRAFT_KEY, computeXDraft } from '../../../worker/broadcast/index.ts';
import { edgeCached } from '../../lib/edge-cache';

export const prerender = false;

const HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'public, s-maxage=3600, max-age=300',
  'access-control-allow-origin': '*',
};

export const GET: APIRoute = (ctx) =>
  edgeCached(ctx, async () => {
    const { SNAP } = ctx.locals.runtime.env;
    let body = await SNAP.get(X_DRAFT_KEY);
    if (!body) {
      body = JSON.stringify(await computeXDraft(ctx.locals.runtime.env));
      await SNAP.put(X_DRAFT_KEY, body);
    }
    return new Response(body, { headers: HEADERS });
  });
