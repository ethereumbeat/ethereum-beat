/**
 * Daily broadcast orchestrator, run from cron after the collector. Builds the
 * digest, always refreshes the X draft (served at /broadcast/x-draft.json for
 * manual posting), and publishes to Nostr + Farcaster when their keys are
 * present. Every step is best-effort: a missing key or a network failure logs
 * and skips, exactly like send_email — the cron must never throw here.
 */
import { buildSnapshot, SNAPSHOT_KEY, type Snapshot } from '../snapshot.ts';
import { siteOrigin } from '../../src/lib/site.ts';
import { buildDigest, type Digest } from './digest.ts';
import { publishNostr, type NostrResult } from './nostr.ts';
import { publishFarcaster, type FarcasterResult } from './farcaster.ts';

export const X_DRAFT_KEY = 'broadcast:x-draft';
const LAST_DATE_KEY = 'broadcast:last-date';

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
  alreadyPostedToday?: boolean;
  nostr?: NostrResult;
  farcaster?: FarcasterResult;
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

  // guard against an accidental second run posting the same day twice
  const lastDate = await env.SNAP.get(LAST_DATE_KEY);
  if (lastDate === digest.date) {
    report.alreadyPostedToday = true;
    console.log('broadcast', JSON.stringify(report));
    return report;
  }

  report.nostr = await publishNostr(env, digest);
  report.farcaster = await publishFarcaster(env, digest);

  // only claim the day once a channel actually had keys to post with
  const attempted = !report.nostr.skipped || !report.farcaster.skipped;
  if (attempted) await env.SNAP.put(LAST_DATE_KEY, digest.date);

  console.log('broadcast', JSON.stringify(report));
  return report;
}
