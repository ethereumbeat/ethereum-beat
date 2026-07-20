import type { APIRoute } from 'astro';
import { edgeCached } from '../lib/edge-cache';
import { siteOrigin } from '../lib/site';
import { buildLlmsText, type MetaRow } from '../lib/llms';

export const prerender = false;

const HEADERS = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'public, s-maxage=3600, max-age=300',
  'access-control-allow-origin': '*',
};

export const GET: APIRoute = (ctx) =>
  edgeCached(ctx, async () => {
    const { DB } = ctx.locals.runtime.env;
    const rows = (await DB.prepare('SELECT * FROM metric_meta ORDER BY sort').all<MetaRow>()).results;
    return new Response(buildLlmsText(siteOrigin(ctx.locals.runtime.env), rows, false), { headers: HEADERS });
  });
