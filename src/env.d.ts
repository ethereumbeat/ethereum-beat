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
