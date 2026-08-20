/**
 * API Catalog at /.well-known/api-catalog (RFC 9727), served as
 * application/linkset+json (RFC 9264). One linkset member per public endpoint
 * family. Discovered via the RFC 8288 Link header set in src/middleware.ts.
 *
 * The metric_key list is NOT enumerated here — it lives in D1 and changes without
 * a deploy, so key discovery points agents at /api/snapshot instead (spec §35.C).
 */
import type { APIRoute } from 'astro';
import { siteOrigin } from '../../lib/site';

export const prerender = false;

export const GET: APIRoute = ({ locals }) => {
  const origin = siteOrigin(locals.runtime.env);

  const linkset = {
    linkset: [
      {
        anchor: `${origin}/api/snapshot`,
        'service-doc': [
          {
            href: `${origin}/docs/api/snapshot.md`,
            type: 'text/markdown',
            title: 'Snapshot API — full latest snapshot, response shape',
          },
        ],
        // /api/snapshot reports freshness (generated_at, finished_at, is_stale),
        // so a status relation to itself is honest rather than fabricated.
        status: [
          {
            href: `${origin}/api/snapshot`,
            title: 'Freshness via generated_at / finished_at / is_stale',
          },
        ],
      },
      {
        anchor: `${origin}/api/metric/{key}`,
        'service-doc': [
          {
            href: `${origin}/docs/api/metric.md`,
            type: 'text/markdown',
            title: 'Per-metric time series — range param; discover {key} from /api/snapshot',
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(linkset, null, 2), {
    headers: {
      'content-type': 'application/linkset+json; charset=utf-8',
      'cache-control': 'public, max-age=86400',
      'access-control-allow-origin': '*',
    },
  });
};
