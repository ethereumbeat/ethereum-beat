/**
 * Agent Readiness Document (ARD) manifest at /.well-known/ai-catalog.json
 * (spec §35.D). application/json + open CORS so agents can fetch it. One entry
 * per channel plus the raw metric API, each with real representative questions.
 *
 * representativeQueries are protocol-health only — never price or TVL (out of
 * scope: CROPS is censorship-resistance / open-source / privacy / security).
 */
import type { APIRoute } from 'astro';
import { siteOrigin, routeMeta, SITE_NAME, SITE_TAGLINE } from '../../lib/site';

export const prerender = false;

// channel → representative agent questions (2–5 each)
const CHANNELS: { path: string; slug: string; queries: string[] }[] = [
  {
    path: '/',
    slug: 'beat',
    queries: [
      "What is the current state of Ethereum's network health?",
      'Is Ethereum producing and finalizing blocks normally right now?',
      'Which Ethereum protocol-health metric is beating right now?',
    ],
  },
  {
    path: '/nodes',
    slug: 'nodes',
    queries: [
      'How many Ethereum nodes are running and where are they located?',
      "What is Ethereum's execution and consensus client diversity?",
      'How geographically decentralized is Ethereum?',
    ],
  },
  {
    path: '/blobs',
    slug: 'blobs',
    queries: [
      "How full are Ethereum's blobs right now?",
      'What is the current Ethereum blob base fee?',
      'How many blobs is Ethereum carrying per day?',
    ],
  },
  {
    path: '/flow',
    slug: 'flow',
    queries: [
      "What is happening in Ethereum's mempool right now?",
      "What is Ethereum's current base fee?",
      'How many transactions is Ethereum processing?',
    ],
  },
  {
    path: '/finality',
    slug: 'finality',
    queries: [
      'Is Ethereum finalizing blocks right now?',
      'How long did the last finality delay last?',
      'Which epoch is Ethereum currently finalizing?',
    ],
  },
  {
    path: '/layers',
    slug: 'layers',
    queries: [
      'Which Ethereum layer-2 networks are most active?',
      'How does Ethereum L1 activity compare to L2 activity?',
      "How much of Ethereum's onchain activity happens on layer 2s?",
    ],
  },
];

export const GET: APIRoute = ({ locals }) => {
  const origin = siteOrigin(locals.runtime.env);

  const entries = [
    ...CHANNELS.map((c) => {
      const meta = routeMeta(c.path);
      return {
        id: `urn:air:ethereumbeat.org:${c.slug}`,
        displayName: meta.channel,
        description: meta.oneLine,
        type: 'text/html',
        url: `${origin}${c.path}`,
        representativeQueries: c.queries,
      };
    }),
    {
      id: 'urn:air:ethereumbeat.org:metric-api',
      displayName: 'Metric API',
      description: 'Machine-readable Ethereum protocol-health metrics as JSON',
      type: 'application/json',
      url: `${origin}/api/snapshot`,
      representativeQueries: [
        'Where can I get Ethereum protocol-health data as JSON?',
        'How do I query an Ethereum network metric over time?',
        'What machine-readable Ethereum metrics does Ethereum Beat expose?',
      ],
    },
  ];

  const manifest = {
    specVersion: '0.1',
    host: {
      name: SITE_NAME,
      url: `${origin}/`,
      description: `${SITE_NAME} — ${SITE_TAGLINE}. Ethereum protocol health, no prices, no market data.`,
    },
    entries,
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400',
      'access-control-allow-origin': '*',
    },
  });
};
