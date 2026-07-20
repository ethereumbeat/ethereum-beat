import { ROUTES, SITE_NAME, SITE_TAGLINE } from './site';
import { licenseFor, LIVE_SOURCES } from './sources';
import { CATEGORY_LABELS } from './metrics';

/**
 * /llms.txt and /llms-full.txt (spec §18.7), generated from the metric
 * registry (metric_meta) and the route registry at request time, so they
 * can never drift from what the site actually serves.
 */

export interface MetaRow {
  metric_key: string;
  label: string;
  category: string;
  unit: string;
  description: string;
  source_name: string;
  source_url: string;
  featured: number;
  agg_mode: string;
}

export function buildLlmsText(origin: string, rows: MetaRow[], full: boolean): string {
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_TAGLINE[0]!.toUpperCase()}${SITE_TAGLINE.slice(1)}. A live, free, open-source instrument for the Ethereum network: protocol health, usage and neutrality metrics — no prices, no market talk. The visual pulse is genuinely synced to Ethereum's 12-second slots.`,
    '',
    'All data is served from open endpoints with CORS enabled and no API keys.',
    'A daily collector (06:00 UTC) stores series in a database; the live layer',
    '(blocks, mempool, slot clock) is computed client-side from public RPCs and',
    'the Beacon genesis timestamp.',
    '',
    '## Channels',
    '',
  );
  for (const r of ROUTES) push(`- [${r.channel}](${origin}${r.path}): ${r.description}`);
  push(
    `- Every metric also has a detail page at ${origin}/pulse/{metric_key} (ranges: daily, weekly, monthly, quarterly, yearly).`,
    '',
    '## Properties (CROPS)',
    '',
    "Metrics are grouped by the four indivisible CROPS properties from the Ethereum Foundation mandate (section III):",
    '- CR — Censorship resistance: no actor can selectively exclude a valid transaction or break functionality.',
    '- O — Open source and free: no privileged code or hidden specs; public, auditable, free to run and fork.',
    '- P — Privacy: user data is not exposed beyond necessity or against a person’s interests.',
    '- S — Security: things do exactly what they claim, no more and no less.',
    'Heartbeat (100% uptime since 2015) frames the beat but is not itself a CROPS property.',
    '',
    '## Open JSON API',
    '',
    `- \`GET ${origin}/api/snapshot\` — the full daily snapshot: every stored metric with latest value, 30-point sparkline and d/w/m/q/y deltas. Shape: \`{ generated_at, metrics: [{ metric_key, label, category, unit, description, source_name, source_url, featured, agg_mode, latest: { date, value }, spark: number[], deltas: { d, w, m, q, y } }] }\`.`,
    `- \`GET ${origin}/api/metric/{key}?range=d|w|m|q|y\` — one metric's series and metadata. Shape: \`{ meta, range, points: [{ date, value }] }\`. Ranges: d = last 30 days, w = 26 weeks, m = 24 months, q = 12 quarters, y = full history by year.`,
    `- \`GET ${origin}/api/layers\` — the per-chain activity board behind the LAYERS channel.`,
    `- \`GET ${origin}/api.json\` — a machine-readable manifest of these endpoints (params, shapes, cache, licence), generated from the metric registry.`,
    '',
    'All responses set `access-control-allow-origin: *`.',
    'Responses are edge-cached for 1 hour. Data updates once per day at 06:00 UTC;',
    'intraday values on the site come from the client-side live layer, not the API.',
    '',
    '## Data licences',
    '',
  );
  const sources = new Map<string, { url: string; license: string }>();
  for (const m of rows) {
    if (!m.source_name || m.source_name.startsWith('computed')) continue;
    if (!sources.has(m.source_name))
      sources.set(m.source_name, { url: m.source_url, license: licenseFor(m.source_name, m.source_url) });
  }
  for (const [name, s] of sources) {
    const lic = s.license.includes('creativecommons') ? 'CC BY 4.0, attribution required and given' : `source's own terms (${s.license})`;
    push(`- ${name} (${s.url}) — ${lic}`);
  }
  push(
    `- Live layer RPCs: ${LIVE_SOURCES.map((s) => s.name).join(', ')} — public endpoints, no stored data.`,
    '- Site code: MIT. The Ethereum glyph and name represent the Ethereum network; this is independent ecosystem work.',
    '',
  );

  if (!full) {
    push('## More', '', `- [llms-full.txt](${origin}/llms-full.txt): expanded version with per-metric definitions.`, `- [About](${origin}/about): concept, methodology, sources.`, `- [Sitemap](${origin}/sitemap.xml)`, '');
    return lines.join('\n');
  }

  push('## Metrics', '', 'Every stored metric, from the metric registry (metric_meta). `featured`', 'metrics rotate on the BEAT channel; everything is queryable via the API.', '');
  const cats = [...new Set(rows.map((m) => m.category))];
  for (const cat of cats) {
    push(`### ${CATEGORY_LABELS[cat] ?? cat}`, '');
    for (const m of rows.filter((r) => r.category === cat)) {
      push(
        `- \`${m.metric_key}\` — ${m.label} (unit: ${m.unit || 'count'}; aggregation: ${m.agg_mode}${m.featured ? '; featured' : ''})`,
        `  ${m.description}`,
        `  CROPS: ${CATEGORY_LABELS[m.category] ?? m.category} · Source: ${m.source_name} <${m.source_url}> · Licence: ${licenseFor(m.source_name, m.source_url)} · API: ${origin}/api/metric/${m.metric_key}`,
      );
    }
    push('');
  }
  return lines.join('\n');
}
