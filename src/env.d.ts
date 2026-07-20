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
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
