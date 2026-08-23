/**
 * Bluesky publish over the AT Protocol XRPC endpoints — free and first-party,
 * no paid service and no SDK: `createSession` with an app password, upload the
 * OG card as a blob, then `createRecord` an `app.bsky.feed.post` carrying the
 * digest text plus an `app.bsky.embed.external` link card. Absent credentials
 * → skip, exactly like Nostr/Farcaster; nothing here may throw.
 *
 * Why an app password and not OAuth: app passwords are separately scoped and
 * revocable from Bluesky settings, and need no redirect flow or refresh-token
 * store — the right fit for a cron whose only durable storage is KV.
 *
 * Why the URL rides in the embed and not the text: same rule digest.ts states
 * and Farcaster follows — the link travels as an embed where the channel
 * supports one, and is appended to the text only where it does not (Nostr).
 */
import type { Digest } from './digest.ts';
import { SITE_NAME, SITE_TAGLINE } from '../../src/lib/site.ts';

const DEFAULT_PDS = 'https://bsky.social';
const TIMEOUT_MS = 10_000;
const UA = 'ethereum-beat/0.1 (+https://github.com/ethereumbeat/ethereum-beat)';

/** `app.bsky.embed.external` thumb cap (lexicon maxSize) — far below the PDS's
 *  own 50 MB blob ceiling, so this is the limit that actually binds us. */
const THUMB_MAX_BYTES = 1_000_000;

/** A lex-json blob reference, as returned by uploadBlob and embedded verbatim. */
export interface BlobRef {
  $type: 'blob';
  ref: { $link: string };
  mimeType: string;
  size: number;
}

export interface PostRecord {
  $type: 'app.bsky.feed.post';
  text: string;
  createdAt: string;
  langs: string[];
  embed: {
    $type: 'app.bsky.embed.external';
    external: { uri: string; title: string; description: string; thumb?: BlobRef };
  };
}

export interface BlueskyResult {
  skipped?: string;
  ok?: boolean;
  /** at://did:plc:…/app.bsky.feed.post/<rkey> */
  uri?: string;
  cid?: string;
  /** whether the link card got its image; thumbNote says why not */
  thumb?: boolean;
  thumbNote?: string;
  status?: number;
  note?: string;
  error?: string;
}

/** Build the post record. Pure and exported so the test can assert its shape. */
export function buildPostRecord(digest: Digest, nowMs: number, thumb?: BlobRef): PostRecord {
  return {
    $type: 'app.bsky.feed.post',
    text: digest.text,
    createdAt: new Date(nowMs).toISOString(),
    // declared so language-filtered feeds don't drop the post
    langs: ['en'],
    embed: {
      $type: 'app.bsky.embed.external',
      external: {
        uri: digest.url,
        title: SITE_NAME,
        description: SITE_TAGLINE,
        ...(thumb ? { thumb } : {}),
      },
    },
  };
}

/** Truncated response body for the log — never the credentials. */
async function errNote(res: Response): Promise<string | undefined> {
  return (await res.text().catch(() => '')).slice(0, 300) || undefined;
}

interface Session {
  accessJwt: string;
  did: string;
}

async function createSession(pds: string, identifier: string, password: string): Promise<
  { session: Session } | { status: number; note?: string }
> {
  const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA },
    body: JSON.stringify({ identifier, password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return { status: res.status, note: await errNote(res) };
  const json = (await res.json()) as Partial<Session>;
  if (!json.accessJwt || !json.did) return { status: res.status, note: 'session missing accessJwt/did' };
  return { session: { accessJwt: json.accessJwt, did: json.did } };
}

/**
 * Fetch the OG card and upload it as a blob for the link preview. Best-effort:
 * any failure (or an over-cap image) returns a note and the post still goes
 * out, just without a thumbnail.
 */
async function uploadThumb(pds: string, jwt: string, imageUrl: string): Promise<
  { blob: BlobRef } | { note: string }
> {
  const img = await fetch(imageUrl, {
    headers: { accept: 'image/png', 'user-agent': UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!img.ok) return { note: `og fetch -> HTTP ${img.status}` };
  const mimeType = img.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  const bytes = await img.arrayBuffer();
  if (bytes.byteLength > THUMB_MAX_BYTES) {
    return { note: `og image ${bytes.byteLength}B over the ${THUMB_MAX_BYTES}B card cap` };
  }
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: { 'content-type': mimeType, authorization: `Bearer ${jwt}`, 'user-agent': UA },
    body: bytes,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return { note: `uploadBlob -> HTTP ${res.status} ${(await errNote(res)) ?? ''}`.trim() };
  const json = (await res.json()) as { blob?: BlobRef };
  return json.blob ? { blob: json.blob } : { note: 'uploadBlob returned no blob' };
}

export async function publishBluesky(env: Env, digest: Digest): Promise<BlueskyResult> {
  const identifier = env.BLUESKY_IDENTIFIER?.trim();
  const password = env.BLUESKY_APP_PASSWORD?.trim();
  if (!identifier || !password) {
    return { skipped: 'BLUESKY_IDENTIFIER / BLUESKY_APP_PASSWORD not set' };
  }
  const pds = (env.BLUESKY_PDS?.trim() || DEFAULT_PDS).replace(/\/$/, '');
  try {
    const auth = await createSession(pds, identifier, password);
    if (!('session' in auth)) {
      return { ok: false, status: auth.status, note: auth.note ?? 'createSession failed' };
    }
    const { accessJwt, did } = auth.session;

    // the card image is optional — a failure here must not lose the post
    const thumbed = await uploadThumb(pds, accessJwt, digest.ogImage).catch((err) => ({
      note: err instanceof Error ? err.message : String(err),
    }));
    const thumb = 'blob' in thumbed ? thumbed.blob : undefined;

    const res = await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${accessJwt}`,
        'user-agent': UA,
      },
      body: JSON.stringify({
        repo: did,
        collection: 'app.bsky.feed.post',
        record: buildPostRecord(digest, Date.now(), thumb),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const base = {
      thumb: Boolean(thumb),
      ...('note' in thumbed ? { thumbNote: thumbed.note } : {}),
      status: res.status,
    };
    if (!res.ok) return { ok: false, ...base, note: await errNote(res) };
    const json = (await res.json()) as { uri?: string; cid?: string };
    return { ok: true, uri: json.uri, cid: json.cid, ...base };
  } catch (err) {
    // a network or auth failure must never break the cron
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
