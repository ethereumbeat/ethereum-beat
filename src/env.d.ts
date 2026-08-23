/// <reference types="astro/client" />

type D1Database = import('@cloudflare/workers-types').D1Database;
type KVNamespace = import('@cloudflare/workers-types').KVNamespace;

interface Env {
  DB: D1Database;
  SNAP: KVNamespace;
  CANONICAL_HOST?: string;
  REDIRECT_TO_CANONICAL?: string;
  BEACONCHAIN_API_KEY?: string;
  DUNE_API_KEY?: string;
  ETHERSCAN_API_KEY?: string;
  // Cloudflare Email Routing binding for collector failure alerts. OPTIONAL:
  // absent on free-tier forks (the committed wrangler.toml has no [[send_email]];
  // it is injected only into the maintainer's deploy config). Every use is
  // guarded — unbound means log-and-skip, never throw.
  SEND_EMAIL?: { send(message: import('cloudflare:email').EmailMessage): Promise<void> };
  ALERT_EMAIL_TO?: string;
  ALERT_EMAIL_FROM?: string;
  // Cloudflare Web Analytics beacon token. Unset → no beacon rendered.
  CF_BEACON_TOKEN?: string;
  // ── daily broadcast (worker/broadcast). All optional: an absent key skips
  //    that channel, never throws (same discipline as send_email). Injected
  //    into wrangler.ci.toml at deploy time, never the committed config. ──
  /** Nostr secret key (nsec1… or 64-hex). Absent → Nostr skipped. */
  NOSTR_NSEC?: string;
  /** comma-separated relay set; defaults to a small free set if unset */
  NOSTR_RELAYS?: string;
  /** Farcaster account fid (numeric). Absent → Farcaster skipped. */
  FARCASTER_FID?: string;
  /** Farcaster Ed25519 signer private key (hex). Absent → Farcaster skipped. */
  FARCASTER_SIGNER?: string;
  /** hub base URL for submitMessage; defaults to a public write hub if unset */
  FARCASTER_HUB?: string;
  /** Bluesky handle or DID (e.g. ethereumbeat.bsky.social). Absent → skipped. */
  BLUESKY_IDENTIFIER?: string;
  /** Bluesky APP PASSWORD (Settings → App Passwords), never the account
   *  password — it is scoped and revocable. Absent → Bluesky skipped. */
  BLUESKY_APP_PASSWORD?: string;
  /** PDS base URL for the XRPC calls; defaults to https://bsky.social */
  BLUESKY_PDS?: string;
  /**
   * Farcaster Mini App manifest accountAssociation (spec §33.D) — the
   * maintainer-signed { header, payload, signature } JSON that binds this
   * domain to their FID, as a single JSON string. Absent → the manifest serves
   * without accountAssociation (valid but unverified). NEVER fabricated.
   */
  FARCASTER_ACCOUNT_ASSOCIATION?: string;
}

// The Workers runtime provides this built-in module; declared so the collector's
// dynamic import type-checks even though the module only exists at runtime.
declare module 'cloudflare:email' {
  export class EmailMessage {
    constructor(from: string, to: string, raw: string);
  }
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
