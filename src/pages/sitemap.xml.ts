import type { APIRoute } from 'astro';
import { edgeCached } from '../lib/edge-cache';
import { siteOrigin, ROUTES } from '../lib/site';

export const prerender = false;

/**
 * sitemap.xml (spec §18.8): the seven channels plus every /pulse/[metric]
 * page from the metric registry. (/digest/* joins here when it exists.)
 */
export const GET: APIRoute = (ctx) =>
  edgeCached(ctx, async () => {
    const { DB } = ctx.locals.runtime.env;
    const origin = siteOrigin(ctx.locals.runtime.env);
    // only metrics that actually hold data: feature-flagged-off sources
    // keep their meta rows, but an empty dataset is nothing to crawl
    const metrics = (
      await DB.prepare(
        `SELECT metric_key FROM metric_meta mm
         WHERE EXISTS (SELECT 1 FROM metrics m WHERE m.metric_key = mm.metric_key)
         ORDER BY sort`,
      ).all<{ metric_key: string }>()
    ).results;

    // content pages that aren't channels in ROUTES (so they stay out of the
    // arcade nav) but are still crawlable / AEO surfaces. The /badge/*.svg
    // images are not listed.
    const EXTRA_PAGES = ['/methodology', '/badges'];

    const urls = [
      ...ROUTES.map((r) => `${origin}${r.path}`),
      ...EXTRA_PAGES.map((p) => `${origin}${p}`),
      ...metrics.map((m) => `${origin}/pulse/${m.metric_key}`),
    ];
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((u) => `  <url><loc>${u}</loc></url>`),
      '</urlset>',
      '',
    ].join('\n');

    return new Response(xml, {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, s-maxage=3600, max-age=300',
      },
    });
  });
