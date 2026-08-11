import type { Snapshot } from './metrics';

/**
 * The source registry for the footer credit line: metric sources come from
 * metric_meta via the snapshot (so anything added later appears
 * automatically), and the live layer's endpoints are declared here once.
 */

export interface SourceRef {
  name: string;
  url: string;
}

export const LIVE_SOURCES: SourceRef[] = [
  { name: 'PUBLICNODE', url: 'https://publicnode.com' },
  { name: 'DRPC', url: 'https://drpc.org' },
  { name: '1RPC', url: 'https://1rpc.io' },
  { name: 'ETHERNODES', url: 'https://ethernodes.org' },
];

/**
 * ROADMAP channel (CH 07) attributions. These are editorial roadmap sources,
 * not live metric endpoints, so they stay out of the metric credit line; they
 * are surfaced on /roadmap and /about. Forkcast's structured upgrade data
 * (github.com/ethereum/forkcast) is the machine source the daily refresh reads;
 * strawmap.org is the long-range view.
 */
export const ROADMAP_SOURCES: SourceRef[] = [
  { name: 'FORKCAST', url: 'https://forkcast.org' },
  { name: 'STRAWMAP', url: 'https://strawmap.org' },
];

/** licences of the underlying sources, for Dataset JSON-LD and llms.txt;
 *  sources without a published data licence fall back to their own URL
 *  (data under the source's terms) */
export const SOURCE_LICENSES: Record<string, string> = {
  growthepie: 'https://creativecommons.org/licenses/by/4.0/',
};

export function licenseFor(sourceName: string, sourceUrl: string): string {
  return SOURCE_LICENSES[sourceName] ?? sourceUrl;
}

/** pretty short names for known metric sources */
const SHORT: Record<string, string> = {
  growthepie: 'GROWTHEPIE',
  'Beacon API (PublicNode)': 'BEACON API',
  'ultrasound.money': 'ULTRASOUND',
  DefiLlama: 'DEFILLAMA',
  'beaconcha.in': 'BEACONCHA.IN',
  'ethernodes.org': 'ETHERNODES',
};

export function creditSources(snapshot: Snapshot | null): SourceRef[] {
  const out = new Map<string, SourceRef>();
  for (const m of snapshot?.metrics ?? []) {
    if (!m.source_name || m.source_name.startsWith('computed')) continue;
    const name = SHORT[m.source_name] ?? m.source_name.toUpperCase();
    if (!out.has(name)) out.set(name, { name, url: m.source_url });
  }
  for (const s of LIVE_SOURCES) if (!out.has(s.name)) out.set(s.name, s);
  return [...out.values()];
}
