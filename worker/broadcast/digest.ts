/**
 * The daily broadcast digest (the "Prompt 1" text): a compact, non-financial
 * read of Ethereum's protocol health, built from the same snapshot the site
 * renders. One body string is shared across Nostr, Farcaster and the X draft;
 * the URL and OG image travel alongside (as an embed / attachment where the
 * channel supports it, appended to the text where it does not).
 *
 * Voice: "a heartbeat, not a ticker". Vitals only — no prices, market cap or
 * trading framing (the three usd metrics are deliberately excluded).
 */
import type { Snapshot, SnapshotMetric } from '../snapshot.ts';
import { axisValue, compact } from '../../src/lib/format.ts';

export interface Digest {
  /** the shared post body — vital lines + signature, no bare URL */
  text: string;
  /** canonical link, posted as an embed or appended to the text */
  url: string;
  /** absolute OG card URL for the lead vital's channel */
  ogImage: string;
  /** the snapshot date this digest describes (YYYY-MM-DD) */
  date: string;
}

const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const pct = (m: SnapshotMetric) => `${m.latest.value.toFixed(1)}%`;

/**
 * Non-financial vitals in priority order. The uptime line is the signature
 * heartbeat and always leads when present; the rest fill until the body budget
 * is reached. usd metrics (tvs, stables, rwa) are intentionally absent.
 */
const VITALS: { key: string; line: (m: SnapshotMetric) => string; og: string }[] = [
  { key: 'uptime_days', line: (m) => `${nf0.format(m.latest.value)} days of unbroken uptime`, og: 'beat' },
  { key: 'participation_rate', line: (m) => `${pct(m)} of validators attesting`, og: 'finality' },
  { key: 'staked_pct', line: (m) => `${pct(m)} of all ETH staked`, og: 'nodes' },
  { key: 'validators_active', line: (m) => `${compact(m.latest.value, 2)} validators securing it`, og: 'nodes' },
  { key: 'node_countries', line: (m) => `${nf0.format(m.latest.value)} countries running nodes`, og: 'nodes' },
  { key: 'blobs_per_block_avg', line: (m) => `${axisValue(m.latest.value, 'count')} blobs per block`, og: 'blobs' },
  { key: 'throughput', line: (m) => `${axisValue(m.latest.value, 'mgas_s')} Mgas/s of throughput`, og: 'blobs' },
];

const SIGNATURE = 'One beat per 12-second slot — protocol health, not price.';

/** keep the body comfortably inside X's 280 and Farcaster's 320-byte limits */
const BODY_BUDGET = 240;

function fmtDate(iso: string): string {
  // en-GB "07 Aug 2026" from the snapshot's YYYY-MM-DD, without pulling in a
  // timezone (slice the date part and format via UTC)
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(d);
}

export function buildDigest(snapshot: Snapshot, origin: string): Digest {
  const byKey = new Map(snapshot.metrics.map((m) => [m.metric_key, m]));
  const date = snapshot.generated_at.slice(0, 10);
  const header = `⬡ Ethereum's vitals · ${fmtDate(date)}`;

  const lines: string[] = [];
  let og = 'beat';
  let used = header.length + 1 + SIGNATURE.length; // header + signature + newline
  for (const v of VITALS) {
    const m = byKey.get(v.key);
    if (!m) continue;
    const line = `· ${v.line(m)}`;
    if (used + line.length + 1 > BODY_BUDGET && lines.length >= 2) break;
    if (lines.length === 0) og = v.og; // OG card follows the lead vital
    lines.push(line);
    used += line.length + 1;
  }

  // Degrade gracefully: with no metrics at all, still emit a valid, on-voice
  // post rather than an empty one.
  const bodyLines = lines.length ? lines : ['· live at every 12-second slot'];
  const text = [header, ...bodyLines, SIGNATURE].join('\n');

  return { text, url: origin, ogImage: `${origin}/og/${og}.png`, date };
}
