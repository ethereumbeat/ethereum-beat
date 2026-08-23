/**
 * Canonical host + the route/channel registry (pass 11). One source of
 * truth for titles, descriptions and crawl surfaces: head tags, OG cards,
 * sitemap.xml, llms.txt and scripts/audit-meta.mjs all read from here, so
 * none of them can drift from the others.
 */

export const DEFAULT_CANONICAL_HOST = 'ethereumbeat.org';

export interface SiteEnv {
  CANONICAL_HOST?: string;
}

/** Always the canonical origin — a workers.dev deployment still emits
 *  ethereumbeat.org canonicals unless CANONICAL_HOST overrides it. */
export function siteOrigin(env?: SiteEnv): string {
  return `https://${env?.CANONICAL_HOST || DEFAULT_CANONICAL_HOST}`;
}

export const SITE_NAME = 'Ethereum Beat';
export const SITE_TAGLINE = 'the pulse of Ethereum — a heartbeat, not a ticker';

export interface RouteMeta {
  path: string;
  /** channel name as it appears in the title pattern */
  channel: string;
  /** channel index as shown on the dial/OSD */
  ch: string;
  /** the one-line in "Ethereum Beat — <channel> · <one-line>" */
  oneLine: string;
  /** unique meta description */
  description: string;
  title: string;
  /** og:image basename under /og/ */
  og: string;
}

function route(path: string, channel: string, ch: string, oneLine: string, description: string, og: string): RouteMeta {
  return { path, channel, ch, oneLine, description, og, title: `${SITE_NAME} — ${channel} · ${oneLine}` };
}

export const ROUTES: RouteMeta[] = [
  route(
    '/',
    'BEAT',
    '01',
    'the live pulse of Ethereum, one beat per slot',
    'Ethereum as a living instrument: a disc that beats on every 12-second slot, one protocol-health metric per beat. Censorship resistance, open source, privacy and security — no prices, no market talk.',
    'beat',
  ),
  route(
    '/nodes',
    'NODES',
    '02',
    'where Ethereum physically lives',
    'Where Ethereum physically lives: execution and consensus nodes by country on a dot-matrix world map, client diversity bars, validator and stake counts.',
    'nodes',
  ),
  route(
    '/blobs',
    'BLOBS',
    '03',
    'the data-availability heartbeat',
    'The data-availability heartbeat: blob cells filling live per block against the protocol target, the blob base fee gauge and the daily blob count series.',
    'blobs',
  ),
  route(
    '/flow',
    'FLOW',
    '04',
    'live transaction telemetry',
    'Real-time transaction telemetry: the live mempool waterfall, sealed-block interrupts, inclusion ticks and the base fee, streamed like a terminal.',
    'flow',
  ),
  route(
    '/finality',
    'FINALITY',
    '05',
    'a block’s journey from proposed to final',
    'How Ethereum finality works, live: the current epoch filling slot by slot, justification, and the finalised checkpoint trailing two epochs behind the head.',
    'finality',
  ),
  route(
    '/layers',
    'LAYERS',
    '06',
    'the onchain economy, chain by chain',
    'The onchain economy by chain: a ranked live board of Ethereum L2s, the L1 vs L2 activity split and the combined activity curve, from open growthepie data.',
    'layers',
  ),
  route(
    '/roadmap',
    'ROADMAP',
    '07',
    'what is coming to the protocol, upgrade by upgrade',
    // Fork-agnostic fallback ONLY — the /roadmap page overrides this with a
    // description derived from the live upgrade data, so it never hardcodes a
    // fork list that can drift out of sync with the panels.
    "Ethereum's protocol roadmap in plain language: what each network upgrade — live, in development and on the long-range horizon — changes for censorship resistance, decentralisation, node sustainability and privacy. EIP numbers as decoration, no price or market framing.",
    'roadmap',
  ),
  route(
    '/about',
    'ABOUT',
    'A',
    'what this instrument is and how it works',
    'What Ethereum Beat is: a heartbeat, not a ticker. The concept, the beat mechanics, the CROPS protocol properties, and every data source with its licence.',
    'about',
  ),
];

export function routeMeta(path: string): RouteMeta {
  const hit = ROUTES.find((r) => r.path === path);
  if (!hit) throw new Error(`unknown route: ${path}`);
  return hit;
}

// the four CROPS properties (pass 13c) — used as JSON-LD keywords
const CROPS_KEYWORDS =
  'Ethereum, CROPS, censorship resistance, open source, privacy, security, protocol health, decentralisation';

/** site-wide JSON-LD, emitted on every route (spec §18.6): the site and
 *  the free, in-browser application it is */
export function siteJsonLd(origin: string): object[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${origin}/`,
      description: `${SITE_NAME}: ${SITE_TAGLINE}. Protocol health, usage and neutrality metrics for Ethereum, live.`,
      keywords: CROPS_KEYWORDS,
    },
    {
      // Organization for entity/contact verification (spec §36.G). No telephone
      // or PostalAddress — this is a free, open-source project with no business
      // phone or physical address; fabricating them to pass a checker is exactly
      // the dishonest scaffolding the project refuses. contactPoint is the real
      // mailbox; sameAs is the canonical repository.
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${origin}/`,
      logo: `${origin}/icon.png`,
      description: `${SITE_NAME} — a free, open-source instrument for Ethereum protocol health. No prices, no market data.`,
      sameAs: [
        'https://github.com/ethereumbeat/ethereum-beat',
        'https://x.com/ethereumbeat',
        'https://bsky.app/profile/ethereumbeat.bsky.social',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'technical support',
        email: 'beat@ethereumbeat.org',
        url: `${origin}/support`,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      url: `${origin}/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (web browser)',
      browserRequirements: 'Requires JavaScript',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      keywords: CROPS_KEYWORDS,
      description:
        'A live instrument for the Ethereum network: a disc that beats on every 12-second slot, surfacing the four CROPS properties — censorship resistance, open source, privacy and security. Free, open source, no accounts.',
    },
  ];
}

/** title/description/og for a /pulse/[metric] detail page */
export function pulseMeta(label: string, description: string): { title: string; description: string; og: string } {
  return {
    title: `${SITE_NAME} — PULSE · ${label.toLowerCase()}`,
    description,
    og: 'beat',
  };
}
