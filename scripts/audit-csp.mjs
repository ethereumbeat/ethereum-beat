/**
 * CSP + security-header audit — a permanent QA gate.
 *
 * The site is server-rendered and locks scripts down with a nonce +
 * 'strict-dynamic' Content-Security-Policy (worker/index.ts): the Worker mints
 * a per-request nonce and HTMLRewriter stamps it onto every <script>. The
 * failure mode is silent — if a script tag slips through un-nonced (an
 * HTMLRewriter/adapter change), the browser blocks it but the SSR HTML still
 * renders, so the contrast/metadata audits don't notice. This gate catches it:
 * for every route it checks the CSP shape and asserts every <script> in the
 * response carries the response's nonce, plus the baseline security headers.
 * (The runtime scripts ClientRouter injects during navigation are covered by
 * 'strict-dynamic' and verified separately in the browser.)
 *
 * Usage:  node scripts/audit-csp.mjs [--base http://localhost:8788]
 * Exit 1 on any failure.
 */
const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8788';

// one HTML route per template kind (channels + about + a /pulse detail + a 404)
const ROUTES = [
  '/',
  '/nodes',
  '/blobs',
  '/flow',
  '/finality',
  '/layers',
  '/roadmap',
  '/about',
  '/badges', // has its own inline copy-to-clipboard script — must stay nonced
  '/pulse/txcount_combined',
  '/pulse/txcount', // 404 page — still HTML, still under the CSP
];

const EXPECT_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};

// browser hosts the connect-src must permit (RPC + beacon + WSS mempool)
const CONNECT_MUST_INCLUDE = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.drpc.org',
  'https://1rpc.io',
  'https://ethereum-beacon-api.publicnode.com',
  'wss://ethereum-rpc.publicnode.com',
  'wss://eth.drpc.org',
  'https://cloudflareinsights.com', // Cloudflare Web Analytics beacon endpoint
];

const failures = [];
let scriptsChecked = 0;

for (const route of ROUTES) {
  let res;
  try {
    res = await fetch(BASE + route);
  } catch (e) {
    failures.push(`${route}: fetch failed — ${e.message}`);
    continue;
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/html')) {
    failures.push(`${route}: expected text/html, got '${ct}'`);
    continue;
  }
  const csp = res.headers.get('content-security-policy');
  if (!csp) {
    failures.push(`${route}: no Content-Security-Policy header`);
    continue;
  }

  for (const [h, want] of Object.entries(EXPECT_HEADERS)) {
    const got = res.headers.get(h);
    if (got !== want) failures.push(`${route}: header ${h} = ${got ?? '(absent)'}, expected ${want}`);
  }

  const scriptSrc = (csp.match(/script-src([^;]*)/) ?? [, ''])[1];
  const nonceMatch = scriptSrc.match(/'nonce-([^']+)'/);
  if (!nonceMatch) failures.push(`${route}: script-src has no nonce`);
  if (!/'strict-dynamic'/.test(scriptSrc)) failures.push(`${route}: script-src missing 'strict-dynamic'`);
  if (/'unsafe-inline'|'unsafe-eval'/.test(scriptSrc)) {
    failures.push(`${route}: script-src contains unsafe-inline/unsafe-eval`);
  }
  for (const host of CONNECT_MUST_INCLUDE) {
    if (!csp.includes(host)) failures.push(`${route}: connect-src missing ${host}`);
  }

  // every <script> in the response must carry the response's nonce, or the
  // browser would block it (nonce+strict-dynamic ignores host allowlists)
  const nonce = nonceMatch?.[1];
  if (nonce) {
    const html = await res.text();
    for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
      scriptsChecked++;
      if (!tag.includes(`nonce="${nonce}"`)) {
        failures.push(`${route}: a <script> tag is missing the response nonce → would be CSP-blocked\n      ${tag.slice(0, 90)}`);
      }
    }
  }
}

console.log(`CSP audit: ${ROUTES.length} routes, ${scriptsChecked} <script> tags checked.`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log("ALL GREEN — nonce+strict-dynamic policy intact; every <script> nonced; baseline headers present.");
