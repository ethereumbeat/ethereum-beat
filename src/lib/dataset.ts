import { licenseFor } from './sources';

/**
 * The /pulse/[metric] Dataset JSON-LD — the single source of truth so the
 * server-rendered head (direct load) and the client-injected head (soft-nav
 * overlay open / cycle) produce byte-identical structured data (PR E).
 */
export interface DatasetMeta {
  metric_key: string;
  label: string;
  description: string;
  source_name: string;
  source_url: string;
}

export function pulseDataset(
  m: DatasetMeta,
  coverage: { first: string | null; last: string | null } | null,
  origin: string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${m.label} — Ethereum`,
    description: m.description,
    url: `${origin}/pulse/${m.metric_key}`,
    ...(coverage?.first && coverage?.last ? { temporalCoverage: `${coverage.first}/${coverage.last}` } : {}),
    license: licenseFor(m.source_name, m.source_url),
    isAccessibleForFree: true,
    creditText: `Source: ${m.source_name}`,
    creator: { '@type': 'Organization', name: m.source_name, url: m.source_url },
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: `${origin}/api/metric/${m.metric_key}`,
      },
    ],
  };
}
