/**
 * Worker entry: wraps the Astro-built handler so the same Worker also serves
 * the daily cron trigger, and stamps baseline security headers + a
 * Content-Security-Policy onto every HTML response. `astro build` must run
 * before wrangler dev/deploy.
 */
// @ts-ignore — built by `astro build`, no type declarations
import astro from '../dist/_worker.js/index.js';
import { runCollector } from './collector.ts';
import { runBroadcast } from './broadcast/index.ts';

/**
 * Script CSP: a per-request nonce + 'strict-dynamic'.
 *
 * Every page is server-rendered and uses Astro's ClientRouter (view
 * transitions), which (a) re-executes inline scripts on soft navigation and
 * (b) injects runtime helper scripts (e.g. a `data:` script-ordering sentinel).
 * A plain hash/allowlist policy blocks (b) unless `data:` is opened up (an XSS
 * hole), and a bare nonce doesn't survive (a). 'strict-dynamic' solves both:
 * the nonce trusts the scripts present in the response (inline theme script,
 * Astro's hydration bootstraps, the bundled module scripts), and any script
 * THOSE trusted scripts inject afterwards inherits trust — with no host/scheme
 * allowlist widening. `'self'` is a legacy fallback for engines without
 * strict-dynamic; they ignore it in modern engines. The nonce is added to every
 * <script> by HTMLRewriter below.
 */
const CONNECT_SRC = [
  // exactly the hosts the *browser* talks to. Everything historical is fetched
  // server-side by the collector (growthepie, DefiLlama, ultrasound, ethernodes)
  // and reaches the client only via same-origin /api/*, so those are absent.
  "'self'",
  'https://ethereum-rpc.publicnode.com', // RPC tier-2 block poll (src/lib/rpc.ts)
  'https://eth.drpc.org',
  'https://1rpc.io',
  'https://ethereum-beacon-api.publicnode.com', // finality + glyph head block
  'wss://ethereum-rpc.publicnode.com', // FLOW mempool stream (src/lib/mempool.ts)
  'wss://eth.drpc.org',
  // Cloudflare Web Analytics: the beacon SCRIPT is authorised by its nonce
  // (strict-dynamic), not by host. These hosts cover the beacon's own data POST
  // (cloudflareinsights.com) — the analytics endpoint, not a script allowlist.
  'https://cloudflareinsights.com',
  'https://static.cloudflareinsights.com',
];

function cspFor(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    // inline style attributes (React style props, Astro style=) + view-transition
    // styles are pervasive; styles are low-risk, so 'unsafe-inline' is accepted
    "style-src 'self' 'unsafe-inline'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self'`,
    `connect-src ${CONNECT_SRC.join(' ')}`,
  ].join('; ');
}

/** add the request nonce to every <script> so the nonce+strict-dynamic policy
 *  trusts the response's scripts (inline and bundled alike) */
class AddNonce {
  constructor(private nonce: string) {}
  element(el: Element) {
    el.setAttribute('nonce', this.nonce);
  }
}

/** Baseline headers + CSP for an HTML response. JSON API responses keep their
 *  intentionally-open CORS and are returned untouched. */
function secureHtml(res: Response): Response {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const rewritten = new HTMLRewriter().on('script', new AddNonce(nonce)).transform(res);
  const out = new Response(rewritten.body, rewritten); // mutable headers, preserves stream + status
  out.headers.set('Content-Security-Policy', cspFor(nonce));
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set('X-Frame-Options', 'DENY');
  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // behind a flag until DNS is live: workers.dev → canonical host, 301
    if (env.REDIRECT_TO_CANONICAL === 'true') {
      const url = new URL(request.url);
      if (url.hostname.endsWith('.workers.dev')) {
        url.hostname = env.CANONICAL_HOST || 'ethereumbeat.org';
        url.port = '';
        return Response.redirect(url.toString(), 301);
      }
    }
    const res = await astro.fetch(request, env, ctx);
    const type = res.headers.get('content-type') ?? '';
    return type.includes('text/html') ? secureHtml(res) : res;
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // collect first, then broadcast off the fresh snapshot. Both are
    // best-effort; the broadcast never blocks or fails the collector.
    ctx.waitUntil(
      runCollector(env)
        .catch((err) => console.error('collector failed', err))
        .then(() => runBroadcast(env))
        .catch((err) => console.error('broadcast failed', err)),
    );
  },
} satisfies ExportedHandler<Env>;
