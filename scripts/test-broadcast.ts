/**
 * Correctness checks for the broadcast primitives — run with:
 *   node --experimental-strip-types scripts/test-broadcast.ts
 * No network. Verifies bech32/key derivation against the canonical NIP-19
 * vector, the Nostr event id + Schnorr signature, the Farcaster protobuf +
 * Ed25519/Blake3 signature (round-tripped), the digest shape, and the Bluesky
 * post record against the app.bsky.feed.post lexicon's limits.
 */
import { schnorr } from '@noble/curves/secp256k1.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { blake3 } from '@noble/hashes/blake3.js';
import { toSecretKeyBytes, bech32ToBytes } from '../worker/broadcast/bech32.ts';
import { signNote } from '../worker/broadcast/nostr.ts';
import { buildCastMessage } from '../worker/broadcast/farcaster.ts';
import { buildPostRecord, type BlobRef } from '../worker/broadcast/bluesky.ts';
import { buildDigest } from '../worker/broadcast/digest.ts';
import { SITE_NAME, SITE_TAGLINE } from '../src/lib/site.ts';
import type { Snapshot } from '../worker/snapshot.ts';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}
const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

const hexToBytes = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

// ── 1. NIP-19 vector ──────────────────────────────────────────────────────
// External anchor: the published nsec decodes to this exact private key
// (NIP-19). The x-only pubkey is derived by @noble (the reference impl).
const NSEC = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5';
const EXPECT_SK = '67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa';
const EXPECT_PK = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
const sk = toSecretKeyBytes(NSEC);
check('bech32 nsec → secret key (published vector)', toHex(sk) === EXPECT_SK, toHex(sk));
check('schnorr x-only pubkey', toHex(schnorr.getPublicKey(sk)) === EXPECT_PK);
check('hex secret key accepted too', toHex(toSecretKeyBytes(EXPECT_SK)) === EXPECT_SK);
check('bech32 rejects wrong hrp', (() => { try { bech32ToBytes('npub1x', 'nsec'); return false; } catch { return true; } })());

// ── 2. Nostr event id + signature ─────────────────────────────────────────
const digest = {
  text: "⬡ Ethereum's vitals · 07 Aug 2026\n· 4046 days of unbroken uptime\nOne beat per 12-second slot — protocol health, not price.",
  url: 'https://ethereumbeat.org',
  ogImage: 'https://ethereumbeat.org/og/beat.png',
  date: '2026-08-07',
};
const ev = signNote(NSEC, digest, 1_754_560_000);
check('event pubkey matches key', ev.pubkey === EXPECT_PK);
check('event id is 64-hex', /^[0-9a-f]{64}$/.test(ev.id));
check('schnorr signature verifies', schnorr.verify(hexToBytes(ev.sig), hexToBytes(ev.id), hexToBytes(ev.pubkey)));
check('event kind is 1', ev.kind === 1);
check('content carries url + og', ev.content.includes(digest.url) && ev.content.includes(digest.ogImage));

// ── 3. Farcaster protobuf + signature (round-trip decode) ─────────────────
const signerPriv = toHex(ed25519.utils.randomSecretKey());
const { message, hash } = buildCastMessage(42, signerPriv, digest, 1_754_560_000_000);
// minimal protobuf reader for the top-level Message
function readMessage(buf: Uint8Array) {
  const fields: Record<number, Uint8Array> = {};
  let i = 0;
  const varint = () => { let r = 0n, s = 0n; while (true) { const b = buf[i++]!; r |= BigInt(b & 0x7f) << s; if (!(b & 0x80)) break; s += 7n; } return r; };
  while (i < buf.length) {
    const tag = Number(varint()); const field = tag >> 3; const wire = tag & 7;
    if (wire === 2) { const len = Number(varint()); fields[field] = buf.slice(i, i + len); i += len; }
    else if (wire === 0) { const start = i; varint(); fields[field] = buf.slice(start, i); }
  }
  return fields;
}
const m = readMessage(message);
const data = m[1]!;
check('Message.data present', data instanceof Uint8Array && data.length > 0);
check('Message.hash is 20 bytes (blake3)', m[2]?.length === 20);
check('Message.hash == blake3(data)[:20]', toHex(m[2]!) === toHex(blake3(data, { dkLen: 20 })));
check('Message.hash matches returned hash', toHex(m[2]!) === hash);
check('Message.signature is 64 bytes', m[4]?.length === 64);
check('Message.signer is 32 bytes', m[6]?.length === 32);
check('ed25519 signature verifies over hash', ed25519.verify(m[4]!, m[2]!, m[6]!));
check('signer == derived pubkey', toHex(m[6]!) === toHex(ed25519.getPublicKey(new Uint8Array(signerPriv.match(/../g)!.map((h) => parseInt(h, 16))))));

// ── 4. Digest shape from a mock snapshot ──────────────────────────────────
const meta = (k: string, unit: string, value: number) => ({
  metric_key: k, label: k, category: 'x', unit, description: '', source_name: '', source_url: '',
  featured: 1, sort: 0, agg_mode: 'last' as const,
  latest: { date: '2026-08-07', value }, spark: [value], deltas: {} as never,
});
const snap: Snapshot = {
  generated_at: '2026-08-07T06:00:00.000Z',
  metrics: [
    meta('uptime_days', 'days', 4046),
    meta('participation_rate', 'pct', 99.3),
    meta('staked_pct', 'pct', 28.4),
    meta('tvs', 'usd', 1.2e11), // must NOT appear (financial)
  ],
};
const d = buildDigest(snap, 'https://ethereumbeat.org');
check('digest links to origin', d.url === 'https://ethereumbeat.org');
check('digest has an og image', /\/og\/\w+\.png$/.test(d.ogImage));
check('digest is non-financial (no $)', !d.text.includes('$'));
check('digest omits usd metric (tvs)', !d.text.toLowerCase().includes('secured'));
check('digest includes uptime vital', d.text.includes('4,046') || d.text.includes('4046'));
check('digest body within X budget (<=280)', [...d.text].length <= 280, `${[...d.text].length} chars`);

// ── 5. Bluesky post record ────────────────────────────────────────────────
// The app.bsky.feed.post lexicon caps text at 300 graphemes AND 3000 UTF-8
// bytes. The digest is deliberately multi-byte (⬡ 3B, · 2B, — 3B), so the byte
// budget has to be measured in bytes, not string length — the same trap that
// makes String#indexOf the wrong tool for AT Protocol facet offsets.
const graphemes = (s: string) =>
  [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].length;
const utf8 = (s: string) => new TextEncoder().encode(s).length;

const NOW_MS = 1_754_560_000_000;
const blob: BlobRef = {
  $type: 'blob',
  ref: { $link: 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  mimeType: 'image/png',
  size: 25_551,
};
const rec = buildPostRecord(d, NOW_MS, blob);
check('record $type is app.bsky.feed.post', rec.$type === 'app.bsky.feed.post');
check('record text is the shared digest body', rec.text === d.text);
check('record declares langs (feeds filter on it)', rec.langs.includes('en'));
check('createdAt round-trips the passed instant', new Date(rec.createdAt).getTime() === NOW_MS, rec.createdAt);
check('embed is an external link card', rec.embed.$type === 'app.bsky.embed.external');
check('card uri is the digest url', rec.embed.external.uri === d.url);
check(
  'card title/description reuse site.ts',
  rec.embed.external.title === SITE_NAME && rec.embed.external.description === SITE_TAGLINE,
);
check('card carries the thumb blob', rec.embed.external.thumb?.ref.$link === blob.ref.$link);

const bare = buildPostRecord(d, NOW_MS);
check('thumb key absent (not undefined) when the blob is missing', !('thumb' in bare.embed.external));
check('a thumbless card still has its uri', bare.embed.external.uri === d.url);

// the link rides in the embed, not the text — digest.ts's stated rule
check('post text carries no bare url', !rec.text.includes('http'));
check('digest text is genuinely multi-byte', utf8(d.text) > d.text.length, `${utf8(d.text)}B / ${d.text.length} chars`);
check('text within the 300-grapheme lexicon cap', graphemes(rec.text) <= 300, `${graphemes(rec.text)} graphemes`);
check('text within the 3000-byte lexicon cap', utf8(rec.text) <= 3000, `${utf8(rec.text)}B`);

console.log('\n' + (failures ? `${failures} FAILURES` : 'ALL PASS'));
process.exit(failures ? 1 : 0);
