/**
 * Nostr publish: sign a kind-1 note with NOSTR_NSEC (BIP-340 Schnorr over
 * secp256k1) and push it to a small, configurable relay set over the Worker's
 * outbound WebSocket. No third-party paid service. Absent key → skip.
 */
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { toSecretKeyBytes } from './bech32.ts';
import type { Digest } from './digest.ts';

/** small, free, no-auth relays; override with NOSTR_RELAYS (comma-separated) */
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
];

const RELAY_TIMEOUT_MS = 6000;

export interface NostrResult {
  skipped?: string;
  eventId?: string;
  relays?: { url: string; ok: boolean; note?: string }[];
  error?: string;
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/** Build + sign a kind-1 event per NIP-01. */
export function signNote(nsec: string, digest: Digest, createdAt: number): NostrEvent {
  const sk = toSecretKeyBytes(nsec);
  const pubkey = toHex(schnorr.getPublicKey(sk));
  // clients auto-embed bare image/link URLs; NIP-92 imeta hints the OG card
  const content = `${digest.text}\n\n${digest.url}\n${digest.ogImage}`;
  const tags: string[][] = [
    ['t', 'ethereum'],
    ['t', 'ethereumbeat'],
    ['r', digest.url],
    ['imeta', `url ${digest.ogImage}`, 'm image/png'],
  ];
  const serialized = JSON.stringify([0, pubkey, createdAt, 1, tags, content]);
  const id = toHex(sha256(new TextEncoder().encode(serialized)));
  const sig = toHex(schnorr.sign(hexToBytes(id), sk));
  return { id, pubkey, created_at: createdAt, kind: 1, tags, content, sig };
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Publish one event to one relay; resolve ok/fail, never reject. */
async function publishToRelay(relay: string, event: NostrEvent): Promise<{ url: string; ok: boolean; note?: string }> {
  const httpUrl = relay.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
  let ws: WebSocket | undefined;
  try {
    const resp = await fetch(httpUrl, { headers: { Upgrade: 'websocket' } });
    ws = resp.webSocket ?? undefined;
    if (!ws) return { url: relay, ok: false, note: `no websocket (status ${resp.status})` };
    ws.accept();
    const result = await new Promise<{ ok: boolean; note?: string }>((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, note: 'timeout' }), RELAY_TIMEOUT_MS);
      ws!.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
          // ["OK", <id>, <accepted:bool>, <message>]
          if (Array.isArray(msg) && msg[0] === 'OK' && msg[1] === event.id) {
            clearTimeout(timer);
            resolve({ ok: Boolean(msg[2]), note: typeof msg[3] === 'string' ? msg[3] : undefined });
          }
        } catch {
          /* ignore non-JSON frames */
        }
      });
      ws!.addEventListener('close', () => { clearTimeout(timer); resolve({ ok: false, note: 'closed' }); });
      ws!.addEventListener('error', () => { clearTimeout(timer); resolve({ ok: false, note: 'ws error' }); });
      ws!.send(JSON.stringify(['EVENT', event]));
    });
    return { url: relay, ...result };
  } catch (err) {
    return { url: relay, ok: false, note: err instanceof Error ? err.message : String(err) };
  } finally {
    try { ws?.close(); } catch { /* already closed */ }
  }
}

export async function publishNostr(env: Env, digest: Digest): Promise<NostrResult> {
  const nsec = env.NOSTR_NSEC?.trim();
  if (!nsec) return { skipped: 'NOSTR_NSEC not set' };
  try {
    const relays = (env.NOSTR_RELAYS ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    const targets = relays.length ? relays : DEFAULT_RELAYS;
    const event = signNote(nsec, digest, Math.floor(Date.now() / 1000));
    const results = await Promise.all(targets.map((r) => publishToRelay(r, event)));
    return { eventId: event.id, relays: results };
  } catch (err) {
    // a bad key or signing failure must never break the cron
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
