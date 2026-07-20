import type { APIContext } from 'astro';

/**
 * Serve API responses through the Workers Cache API so the 1h s-maxage is
 * honoured at the edge, not just described in a header. The daily cron busts
 * nothing: KV is always current and the TTL handles the rest.
 */
export async function edgeCached(
  ctx: APIContext,
  produce: () => Promise<Response>,
): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  if (!cache) return produce();

  const key = new Request(ctx.url.toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  const res = await produce();
  if (res.ok) {
    ctx.locals.runtime.ctx.waitUntil(cache.put(key, res.clone()));
  }
  return res;
}
