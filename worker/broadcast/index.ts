/**
 * Daily broadcast orchestrator, run from cron after the collector. Builds the
 * digest, always refreshes the X draft (served at /broadcast/x-draft.json for
 * manual posting), and publishes to Nostr, Farcaster and Bluesky when their
 * keys are present. Every step is best-effort: a missing key or a network
 * failure logs and skips, exactly like send_email — the cron must never throw
 * here.
 */
import { buildSnapshot, SNAPSHOT_KEY, type Snapshot } from '../snapshot.ts';
import { siteOrigin } from '../../src/lib/site.ts';
import { buildDigest, type Digest } from './digest.ts';
import { publishNostr, type NostrResult } from './nostr.ts';
import { publishFarcaster, type FarcasterResult } from './farcaster.ts';
import { publishBluesky, type BlueskyResult } from './bluesky.ts';

export const X_DRAFT_KEY = 'broadcast:x-draft';

type ChannelName = 'nostr' | 'farcaster' | 'bluesky';

/**
 * Once-per-UTC-day marker, keyed PER CHANNEL. A single shared marker would let
 * whichever channel posted first claim the day for all of them — so adding a
 * channel's keys to an account that already broadcasts would silently skip the
 * new channel until the next day. Per-channel keys make enabling one
 * independent of the rest.
 */
const lastDateKey = (channel: ChannelName) => `broadcast:last-date:${channel}`;

/**
 * Run one channel's publisher unless it already posted today, then claim the
 * day. The day is claimed on ATTEMPT, not on success — Pass 25's semantics,
 * kept deliberately: a re-run after a failed publish can't tell "the post
 * failed" from "the post landed but the response was lost", and on a public
 * feed a duplicate digest is worse than a missed one. A skipped channel (no
 * keys) never claims, so a keyless fork doesn't latch.
 *
 * The cast is safe because every *Result type has no required field.
 */
async function publishOnce<T extends { skipped?: string }>(
  env: Env,
  channel: ChannelName,
  date: string,
  publish: () => Promise<T>,
): Promise<T> {
  if ((await env.SNAP.get(lastDateKey(channel))) === date) {
    return { skipped: `already posted ${date}` } as T;
  }
  const result = await publish();
  if (!result.skipped) await env.SNAP.put(lastDateKey(channel), date);
  return result;
}

/** No X API (no free tier as of Feb 2026): the draft is written here for manual
 *  posting. TODO(maintainer): if you later opt into X's paid pay-per-use API,
 *  add a publishX(env, digest) alongside the Nostr/Farcaster publishers and
 *  call it below; keep this draft as the fallback. */
export interface XDraft {
  generated_at: string;
  date: string;
  post: string;
  text: string;
  url: string;
  og_image: string;
  chars: number;
  note: string;
}

function xDraft(digest: Digest): XDraft {
  const post = `${digest.text}\n\n${digest.url}`;
  return {
    generated_at: new Date().toISOString(),
    date: digest.date,
    post,
    text: digest.text,
    url: digest.url,
    og_image: digest.ogImage,
    chars: [...post].length,
    note: 'Manual post — the X API has no free tier (Feb 2026). Copy `post` into X. TODO: to automate, add publishX() and opt into paid pay-per-use.',
  };
}

export interface BroadcastReport {
  date: string;
  x: 'written';
  nostr?: NostrResult;
  farcaster?: FarcasterResult;
  bluesky?: BlueskyResult;
}

async function loadSnapshot(env: Env): Promise<Snapshot> {
  const raw = await env.SNAP.get(SNAPSHOT_KEY);
  return raw ? (JSON.parse(raw) as Snapshot) : await buildSnapshot(env.DB);
}

/** Build the current X draft on demand (the /broadcast/x-draft.json fallback
 *  when the cron hasn't written one yet). */
export async function computeXDraft(env: Env): Promise<XDraft> {
  const snapshot = await loadSnapshot(env);
  return xDraft(buildDigest(snapshot, siteOrigin(env)));
}

export async function runBroadcast(env: Env): Promise<BroadcastReport> {
  const snapshot = await loadSnapshot(env);
  const digest = buildDigest(snapshot, siteOrigin(env));
  const report: BroadcastReport = { date: digest.date, x: 'written' };

  // the X draft is idempotent and needs no keys — always refresh it
  await env.SNAP.put(X_DRAFT_KEY, JSON.stringify(xDraft(digest)));

  // each channel guards its own day, so one failing or newly-enabled channel
  // never blocks the others
  report.nostr = await publishOnce(env, 'nostr', digest.date, () => publishNostr(env, digest));
  report.farcaster = await publishOnce(env, 'farcaster', digest.date, () => publishFarcaster(env, digest));
  report.bluesky = await publishOnce(env, 'bluesky', digest.date, () => publishBluesky(env, digest));

  console.log('broadcast', JSON.stringify(report));
  return report;
}
