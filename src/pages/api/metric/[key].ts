import type { APIRoute } from 'astro';
import { fetchSeries, RANGES, type AggMode, type Range } from '../../../lib/aggregate';
import { edgeCached } from '../../../lib/edge-cache';

export const prerender = false;

const HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'public, s-maxage=3600, max-age=300',
  'access-control-allow-origin': '*',
};

export const GET: APIRoute = (ctx) =>
  edgeCached(ctx, () => handle(ctx));

const handle = async ({ params, url, locals }: Parameters<APIRoute>[0]) => {
  const { DB } = locals.runtime.env;
  const key = params.key ?? '';
  const range = (url.searchParams.get('range') ?? 'd') as Range;
  if (!RANGES.includes(range)) {
    return new Response(JSON.stringify({ error: 'range must be one of d|w|m|q|y' }), {
      status: 400,
      headers: HEADERS,
    });
  }

  const meta = await DB.prepare('SELECT * FROM metric_meta WHERE metric_key = ?1').bind(key).first();
  if (!meta) {
    return new Response(JSON.stringify({ error: 'unknown metric' }), { status: 404, headers: HEADERS });
  }

  const points = await fetchSeries(DB, key, range, (meta['agg_mode'] as AggMode) ?? 'mean');
  return new Response(JSON.stringify({ meta, range, points }), { headers: HEADERS });
};
