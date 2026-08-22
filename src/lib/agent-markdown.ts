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

/**
 * Content paths that answer to Accept: text/markdown. `/` (the BEAT stage) is
 * included from Pass 25 (§36.C) — it serves a network-health summary rendition;
 * the interactive page itself is unchanged. /privacy and /developers are static
 * trust/developer pages with their own renditions (SPECIAL below).
 */
export const MARKDOWN_PATHS = [
  '/',
  '/about',
  '/nodes',
  '/blobs',
  '/flow',
  '/finality',
  '/layers',
  '/roadmap',
  '/privacy',
  '/developers',
] as const;

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

function footer(origin: string): string[] {
  return ['---', `${SITE_NAME} · ${origin}/ · ${SITE_TAGLINE}`, ''];
}

/**
 * Static trust/developer pages that are not channels in the route registry
 * (§36.E/F). The concise facts here mirror the styled .astro pages; the shared
 * API + sources blocks below keep the machine-facing detail in one place.
 */
const SPECIAL_PAGES: Record<string, { heading: string; lead: string; body: string[] }> = {
  '/privacy': {
    heading: 'PRIVACY',
    lead: 'What Ethereum Beat collects: essentially nothing.',
    body: [
      '- **No accounts, no login, no personal data.** There is nothing to sign up for and no profile to build.',
      '- **No tracking cookies.** The only browser storage is your theme choice in `localStorage`, read client-side only.',
      '- **Analytics are cookieless and aggregate.** When enabled, Cloudflare Web Analytics counts page views without cookies, fingerprinting, or cross-site identifiers — and it is env-gated, so a fork with no token ships no analytics at all.',
      '- **No third-party ad networks or trackers.**',
      '- **Third-party data.** The live layer fetches public Ethereum RPC and Beacon endpoints (PublicNode, dRPC, 1RPC) directly from your browser; those hosts see the request as any website would. Ethereum Beat shares nothing with them.',
      '- **Open source and self-hostable.** The code is MIT; run your own copy if you prefer.',
      '',
      'Questions: beat@ethereumbeat.org. This is the "P" in CROPS, applied to the site itself.',
    ],
  },
  '/developers': {
    heading: 'DEVELOPERS',
    lead: 'A public, free, key-less JSON API — call it directly.',
    body: [
      'Every number on Ethereum Beat is available as open JSON. **No API key, no signup, no auth** — CORS is open (`access-control-allow-origin: *`) and responses are edge-cached ~1 hour.',
      '',
      '### Quickstart',
      '',
      '    curl -s https://ethereumbeat.org/api/snapshot        # every metric, one document',
      '    curl -s "https://ethereumbeat.org/api/metric/{key}?range=w"   # one metric, weekly',
      '',
      'Discover metric keys from `/api/snapshot` (`metrics[].metric_key`) — they live in D1 and are never hardcoded.',
      '',
      '### Discovery surfaces',
      '',
      '- API catalog (RFC 9727): /.well-known/api-catalog',
      '- Agent manifest (ARD): /.well-known/ai-catalog.json',
      '- For LLMs: /llms.txt and /llms-full.txt',
      '- Every content page also answers `Accept: text/markdown`.',
      '',
      '### What there is NOT',
      '',
      'No API keys, no sandbox environment, and no official CLI or SDK — the API is plain HTTP + JSON, so call it directly. The site is MIT-licensed and self-hostable: https://github.com/ethereumbeat/ethereum-beat',
    ],
  },
};

/** markdown rendition for a content path, or null if the path has none */
export function markdownFor(path: string, origin: string): string | null {
  const normalized = path === '/' ? '/' : path.replace(/\/$/, '');
  if (!MARKDOWN_PATHS.includes(normalized as (typeof MARKDOWN_PATHS)[number])) return null;

  const special = SPECIAL_PAGES[normalized];
  if (special) {
    return [
      `# ${SITE_NAME} — ${special.heading}`,
      '',
      `> ${special.lead}`,
      '',
      ...special.body,
      '',
      apiBlock(origin),
      '',
      sourcesBlock(),
      '',
      ...footer(origin),
    ].join('\n');
  }

  const meta = routeMeta(normalized);
  const parts: string[] = [`# ${SITE_NAME} — ${meta.channel}`, '', `> ${meta.oneLine}`, '', meta.description, ''];

  if (normalized === '/about') parts.push(CROPS_BLOCK, '');
  else parts.push(`This is a live, interactive view (${origin}${normalized}). The underlying numbers are available as JSON below.`, '');

  parts.push(apiBlock(origin), '', sourcesBlock(), '', ...footer(origin));
  return parts.join('\n');
}

/** markdown recovery body for an unknown path — a text/markdown 404 (§36.A) */
export function notFoundMarkdown(origin: string): string {
  return [
    '# 404 — not found',
    '',
    "That path doesn't exist on Ethereum Beat. Where to look next:",
    '',
    '## Channels',
    ...MARKDOWN_PATHS.filter((p) => !(p in SPECIAL_PAGES)).map((p) => `- ${origin}${p === '/' ? '' : p}`),
    '',
    '## Machine-readable',
    `- Latest snapshot (every metric): ${origin}/api/snapshot`,
    `- Per-metric series: ${origin}/api/metric/{key}?range=d|w|m|q|y`,
    `- API catalog: ${origin}/.well-known/api-catalog`,
    `- For LLMs: ${origin}/llms.txt`,
    `- Sitemap: ${origin}/sitemap.xml`,
    '',
    ...footer(origin),
  ].join('\n');
}
