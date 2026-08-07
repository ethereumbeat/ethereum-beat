/**
 * Farcaster publish via the DIRECT HUB path (no paid API): build a CastAdd
 * message, hash it with Blake3, sign the hash with the account's Ed25519
 * signer, and POST the protobuf to a hub's /v1/submitMessage. Absent secrets
 * → skip.
 *
 * Why direct-hub and not a hosted API: the task forbids adding a paid API. A
 * hub's submitMessage is the free, first-party protocol path; the maintainer
 * points FARCASTER_HUB at any hub that accepts writes (many public hubs are
 * read-only — configure one you can write to, e.g. your own or a free
 * write-enabled hub).
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { blake3 } from '@noble/hashes/blake3.js';
import { ProtoWriter } from './protobuf.ts';
import type { Digest } from './digest.ts';

const FARCASTER_EPOCH = 1609459200; // 2021-01-01T00:00:00Z, in seconds
const MESSAGE_TYPE_CAST_ADD = 1;
const NETWORK_MAINNET = 1;
const HASH_SCHEME_BLAKE3 = 1;
const SIGNATURE_SCHEME_ED25519 = 1;
const DEFAULT_HUB = 'https://hub.pinata.cloud';

export interface FarcasterResult {
  skipped?: string;
  ok?: boolean;
  hash?: string;
  status?: number;
  note?: string;
  error?: string;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2) throw new Error('bad hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** CastAddBody: text (3) + up to two URL embeds (6). */
function castAddBody(digest: Digest): Uint8Array {
  const embedUrl = (url: string) => new ProtoWriter().string(1, url).finish();
  const body = new ProtoWriter().string(3, digest.text);
  // embeds: the page (unfurls to its OG card) + the OG image itself
  body.message(6, embedUrl(digest.url));
  body.message(6, embedUrl(digest.ogImage));
  return body.finish();
}

/** MessageData for a CastAdd at `timestamp` (Farcaster-epoch seconds). */
function messageData(fid: number, digest: Digest, timestamp: number): Uint8Array {
  return new ProtoWriter()
    .uint(1, MESSAGE_TYPE_CAST_ADD)
    .uint(2, fid)
    .uint(3, timestamp)
    .uint(4, NETWORK_MAINNET)
    .message(5, castAddBody(digest))
    .finish();
}

/** Build the fully signed hub Message protobuf. Exported for testing. */
export function buildCastMessage(fid: number, signerPrivHex: string, digest: Digest, nowMs: number): {
  message: Uint8Array;
  hash: string;
} {
  const priv = hexToBytes(signerPrivHex);
  const data = messageData(fid, digest, Math.floor(nowMs / 1000) - FARCASTER_EPOCH);
  const hash = blake3(data, { dkLen: 20 });
  const signature = ed25519.sign(hash, priv);
  const signer = ed25519.getPublicKey(priv);
  const message = new ProtoWriter()
    .message(1, data)
    .bytes(2, hash)
    .uint(3, HASH_SCHEME_BLAKE3)
    .bytes(4, signature)
    .uint(5, SIGNATURE_SCHEME_ED25519)
    .bytes(6, signer)
    .finish();
  return { message, hash: toHex(hash) };
}

export async function publishFarcaster(env: Env, digest: Digest): Promise<FarcasterResult> {
  const fidRaw = env.FARCASTER_FID?.trim();
  const signer = env.FARCASTER_SIGNER?.trim();
  if (!fidRaw || !signer) return { skipped: 'FARCASTER_FID / FARCASTER_SIGNER not set' };
  const fid = Number(fidRaw);
  if (!Number.isInteger(fid) || fid <= 0) return { error: `invalid FARCASTER_FID: ${fidRaw}` };
  try {
    const { message, hash } = buildCastMessage(fid, signer, digest, Date.now());
    const hub = (env.FARCASTER_HUB?.trim() || DEFAULT_HUB).replace(/\/$/, '');
    // copy into a concrete ArrayBuffer body (a clean BodyInit; sidesteps the
    // Uint8Array<ArrayBufferLike> vs ArrayBuffer generic mismatch)
    const body = new ArrayBuffer(message.byteLength);
    new Uint8Array(body).set(message);
    const resp = await fetch(`${hub}/v1/submitMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body,
    });
    const ok = resp.ok;
    let note: string | undefined;
    if (!ok) {
      note = (await resp.text().catch(() => '')).slice(0, 300) || undefined;
    }
    return { ok, hash, status: resp.status, note };
  } catch (err) {
    // signing or network failure must never break the cron
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
