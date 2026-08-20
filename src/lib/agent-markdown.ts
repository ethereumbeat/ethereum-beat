/**
 * Single-source markdown renditions of the content pages (spec §35.E), served
 * two ways off ONE generator — no hand-maintained second copy:
 *   • the middleware serves it on `Accept: text/markdown` (src/middleware.ts)
 *   • an astro:build:done hook writes the same output to static `dist/<page>.md`
 *     (astro.config.mjs) so `/<page>.md` also resolves directly.
 *
 * Content is derived from the site route registry; the data-source attribution
 * (load-bearing) is carried into every rendition. The interactive `/` BEAT stage
 * is intentionally excluded.
 */
import { routeMeta, SITE_NAME, SITE_TAGLINE } from './site';

/** content pages that answer to Accept: text/markdown (NOT the live BEAT stage) */
export const MARKDOWN_PATHS = ['/about', '/nodes', '/blobs', '/flow', '/finality', '/layers', '/roadmap'] as const;

/**
 * The real data sources (mirrors src/lib/sources.ts + the /about credit line).
 * Blobscan is intentionally absent — its daily-stats route was superseded by
 * growthepie / the Beacon API (see DECISIONS). growthepie's licence is the one
 * published licence; the rest are "under the source's own terms".
 */
const DATA_SOURCES: { name: string; url: string; license?: string }[] = [
  { name: 'growthepie', url: 'https://www.growthepie.com/', license: 'CC BY 4.0' },
  { name: 'Beacon API (PublicNode)', url: 'https://publicnode.com' },
  { name: 'ethernodes.org', url: 'https://ethernodes.org' },
  { name: 'beaconcha.in', url: 'https://beaconcha.in' },
  { name: 'DefiLlama', url: 'https://defillama.com' },
  { name: 'ultrasound.money', url: 'https://ultrasound.money' },
];

function sourcesBlock(): string {
  const lines = DATA_SOURCES.map((s) => `- ${s.name} — ${s.url}${s.license ? ` (${s.license})` : ''}`);
  return ['## Sources', '', "Data under each source's terms; growthepie data is CC BY 4.0.", ...lines].join('\n');
}

function apiBlock(origin: string): string {
  return [
    '## Machine-readable data',
    '',
    `- Latest snapshot (every metric): ${origin}/api/snapshot`,
    `- Per-metric time series: ${origin}/api/metric/{key}?range=d|w|m|q|y`,
    '  (valid `{key}` values are the `metric_key`s in /api/snapshot — they live in D1, not hardcoded)',
    `- API catalog: ${origin}/.well-known/api-catalog`,
  ].join('\n');
}

/** the CROPS framing — only on /about, summarised from the in-app CROPS copy */
const CROPS_BLOCK = [
  '## CROPS — what is measured',
  '',
  'Ethereum Beat tracks four protocol properties, never prices or markets:',
  '',
  '- **CR — Censorship resistance**: no actor can selectively exclude a valid transaction or break functionality.',
  '- **O — Open source & free**: all of Ethereum is public, auditable and free to run, fork and build on.',
  '- **P — Privacy**: assets and identity are held by cryptography, not an account someone else controls.',
  '- **S — Security**: things do exactly what they claim; attacking the chain means burning your own stake.',
].join('\n');

/** markdown rendition for a content path, or null if the path has none */
export function markdownFor(path: string, origin: string): string | null {
  const normalized = path === '/' ? '/' : path.replace(/\/$/, '');
  if (!MARKDOWN_PATHS.includes(normalized as (typeof MARKDOWN_PATHS)[number])) return null;

  const meta = routeMeta(normalized);
  const parts: string[] = [`# ${SITE_NAME} — ${meta.channel}`, '', `> ${meta.oneLine}`, '', meta.description, ''];

  if (normalized === '/about') parts.push(CROPS_BLOCK, '');
  else {
    parts.push(
      `This is a live, interactive view (${origin}${normalized}). The underlying numbers are available as JSON below.`,
      '',
    );
  }

  parts.push(apiBlock(origin), '', sourcesBlock(), '', '---', `${SITE_NAME} · ${origin}/ · ${SITE_TAGLINE}`, '');
  return parts.join('\n');
}
