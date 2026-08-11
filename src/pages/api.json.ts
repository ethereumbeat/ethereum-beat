import type { APIRoute } from 'astro';
import { edgeCached } from '../lib/edge-cache';
import { siteOrigin, SITE_NAME } from '../lib/site';
import { RANGES } from '../lib/aggregate';

export const prerender = false;

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, s-maxage=3600, max-age=300',
  'access-control-allow-origin': '*',
};

/**
 * A short, self-describing machine-readable API manifest (audit 2026-07-20).
 * Generated from the metric registry + range list so it never drifts from
 * what the endpoints actually serve. Prose for LLMs lives in /llms.txt;
 * this is the structured form for tools and agents.
 */
export const GET: APIRoute = (ctx) =>
  edgeCached(ctx, async () => {
    const { DB } = ctx.locals.runtime.env;
    const origin = siteOrigin(ctx.locals.runtime.env);
    const metrics = (
      await DB.prepare(
        `SELECT metric_key FROM metric_meta mm
         WHERE EXISTS (SELECT 1 FROM metrics m WHERE m.metric_key = mm.metric_key)
         ORDER BY sort`,
      ).all<{ metric_key: string }>()
    ).results.map((r) => r.metric_key);

    const doc = {
      name: `${SITE_NAME} API`,
      description:
        'Open, keyless JSON API for Ethereum protocol-health metrics, grouped by the four CROPS properties (censorship resistance, open source, privacy, security). CORS is open; data updates once daily at 06:00 UTC.',
      base: origin,
      cors: '*',
      updateCadence: 'daily 06:00 UTC',
      license: 'Per source; growthepie series are CC BY 4.0 (attribution given). See /about and /llms.txt.',
      docs: `${origin}/llms.txt`,
      endpoints: [
        {
          path: '/api/snapshot',
          method: 'GET',
          description:
            'The full daily snapshot: every stored metric with latest value, 30-point sparkline and d/w/m/q/y deltas.',
          response:
            '{ generated_at, metrics: [{ metric_key, label, category, unit, description, source_name, source_url, featured, agg_mode, latest: { date, value }, spark: number[], deltas: { d, w, m, q, y } }] }',
          cacheControl: 'public, s-maxage=3600, max-age=300',
        },
        {
          path: '/api/metric/{key}',
          method: 'GET',
          description: "One metric's aggregated series and metadata.",
          params: { key: metrics, range: RANGES },
          response: '{ meta, range, points: [{ date, value }] }',
          cacheControl: 'public, s-maxage=3600',
        },
        {
          path: '/api/layers',
          method: 'GET',
          description: 'The per-chain activity board behind the LAYERS channel.',
          cacheControl: 'public, s-maxage=3600',
        },
        {
          path: '/api/roadmap',
          method: 'GET',
          description:
            "The ROADMAP channel: upcoming Ethereum network upgrades in plain language, each with target window (dates slip — see date_locked), included/candidate EIPs, and the CROPS properties it advances. Non-financial. Machine fields from Forkcast; summaries editorial.",
          response:
            '{ generated_at, upgrades: [{ id, name, codename, status, target_label, date_locked, activation_date, summary, significance, crops, meta_eip_url, source_name, source_url, eips: [{ eip, title, inclusion, summary, crops }] }] }',
          cacheControl: 'public, s-maxage=3600, max-age=300',
        },
      ],
      metrics,
    };

    return new Response(JSON.stringify(doc, null, 2), { headers: HEADERS });
  });
