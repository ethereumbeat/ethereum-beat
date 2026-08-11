/**
 * Metadata self-check — the second permanent QA gate (spec §18.10),
 * alongside scripts/audit-contrast.mjs.
 *
 * Discovers every route from /sitemap.xml, then asserts per route:
 *   - exactly one non-empty <title>, unique across routes; channel titles
 *     follow "Ethereum Beat — <CHANNEL> · <one-line>"
 *   - one meta description, unique, 50..300 chars
 *   - rel=canonical present and equal to the canonical origin + path
 *   - OG (title/description/url/image/image:alt) + twitter:card/image,
 *     og:url === canonical, and the og:image PNG actually serves
 *   - every JSON-LD block parses; WebSite + SoftwareApplication exist on
 *     every route; /pulse/* carries a Dataset with temporalCoverage,
 *     license and a distribution contentUrl on /api/metric/; /about
 *     carries WebPage.citation
 *   - theme-color meta and manifest link present
 * Plus the crawl surfaces once: /site.webmanifest parses (icons incl.
 * maskable + 2 screenshots), /robots.txt names the sitemap, /llms.txt and
 * /llms-full.txt serve text.
 *
 * Usage: node scripts/audit-meta.mjs [--base http://localhost:8788]
 * Exit code 1 on any failure.
 */

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8788';
const CANONICAL_ORIGIN = 'https://ethereumbeat.org';

const failures = [];
const fail = (route, what) => failures.push({ route, what });
const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

const get = async (path, type = 'text') => {
  const res = await fetch(BASE + path, { redirect: 'manual' });
  return { status: res.status, body: res.status === 200 ? await res.text() : '', type: res.headers.get('content-type') ?? '' };
};

// ── discover routes from the sitemap ────────────────────────────────────
const sitemap = await get('/sitemap.xml');
if (sitemap.status !== 200) {
  console.error('FATAL: /sitemap.xml unreachable');
  process.exit(1);
}
const routes = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => new URL(m[1]).pathname)
  .map((p) => (p === '/' ? '/' : p.replace(/\/$/, '')));
if (routes.length < 9) fail('/sitemap.xml', `only ${routes.length} URLs`);
for (const p of ['/', '/nodes', '/blobs', '/flow', '/finality', '/layers', '/roadmap', '/about'])
  if (!routes.includes(p)) fail('/sitemap.xml', `missing ${p}`);

// ── per-route assertions ────────────────────────────────────────────────
const seenTitles = new Map();
const seenDescriptions = new Map();

for (const route of routes) {
  const { status, body: html } = await get(route);
  if (status !== 200) {
    fail(route, `HTTP ${status}`);
    continue;
  }

  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
  const title = titles[0] ?? '';
  if (titles.length !== 1 || !title.trim()) fail(route, `title count ${titles.length}`);
  if (seenTitles.has(title)) fail(route, `title duplicates ${seenTitles.get(title)}`);
  seenTitles.set(title, route);
  const isChannel = !route.startsWith('/pulse/');
  if (isChannel && !/^Ethereum Beat — [A-Z]+ · .+/.test(title)) fail(route, `title pattern: "${title}"`);

  const desc = attr(html.match(/<meta name="description"[^>]*>/)?.[0] ?? '', 'content') ?? '';
  if (desc.length < 50 || desc.length > 300) fail(route, `description length ${desc.length}`);
  if (seenDescriptions.has(desc)) fail(route, `description duplicates ${seenDescriptions.get(desc)}`);
  seenDescriptions.set(desc, route);

  const canonical = attr(html.match(/<link rel="canonical"[^>]*>/)?.[0] ?? '', 'href');
  const expected = CANONICAL_ORIGIN + route;
  if (canonical !== expected) fail(route, `canonical "${canonical}" != "${expected}"`);

  const og = {};
  for (const m of html.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+)" content="([^"]*)"[^>]*>/g))
    og[m[1]] = m[2];
  for (const k of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:image'])
    if (!og[k]) fail(route, `missing ${k}`);
  if (og['og:url'] && og['og:url'] !== canonical) fail(route, 'og:url != canonical');
  if (og['twitter:card'] !== 'summary_large_image') fail(route, `twitter:card ${og['twitter:card']}`);
  if (og['og:image']) {
    if (!og['og:image'].startsWith(CANONICAL_ORIGIN + '/og/')) fail(route, `og:image origin: ${og['og:image']}`);
    const img = await fetch(BASE + new URL(og['og:image']).pathname);
    if (img.status !== 200 || !(img.headers.get('content-type') ?? '').includes('png'))
      fail(route, `og:image not served (${img.status})`);
  }

  // tolerate extra attributes on the tag (the Worker adds a CSP nonce="…")
  const blocks = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  );
  const parsed = [];
  for (const b of blocks) {
    try {
      parsed.push(JSON.parse(b));
    } catch {
      fail(route, 'JSON-LD does not parse');
    }
  }
  const types = parsed.map((p) => p['@type']);
  if (!types.includes('WebSite')) fail(route, 'JSON-LD missing WebSite');
  if (!types.includes('SoftwareApplication')) fail(route, 'JSON-LD missing SoftwareApplication');
  if (route.startsWith('/pulse/')) {
    const ds = parsed.find((p) => p['@type'] === 'Dataset');
    if (!ds) fail(route, 'JSON-LD missing Dataset');
    else {
      if (!ds.license) fail(route, 'Dataset missing license');
      if (!ds.temporalCoverage) fail(route, 'Dataset missing temporalCoverage');
      const dl = ds.distribution?.[0]?.contentUrl ?? '';
      if (!dl.includes('/api/metric/')) fail(route, `Dataset distribution: "${dl}"`);
    }
  }
  if (route === '/about') {
    const wp = parsed.find((p) => p['@type'] === 'WebPage');
    if (!wp?.citation?.length) fail(route, 'about missing WebPage.citation');
  }

  if (!/<meta name="theme-color"/.test(html)) fail(route, 'missing theme-color');
  if (!/<link rel="manifest"/.test(html)) fail(route, 'missing manifest link');
  if (!/<link rel="alternate" type="application\/rss\+xml"/.test(html)) fail(route, 'missing RSS autodiscovery');
  process.stdout.write(`${route}: ${failures.filter((f) => f.route === route).length ? 'FAIL' : 'ok'}\n`);
}

// ── crawl surfaces ──────────────────────────────────────────────────────
const manifest = await get('/site.webmanifest');
try {
  const m = JSON.parse(manifest.body);
  if (!m.name || !m.short_name || !m.description || !m.categories?.length) fail('/site.webmanifest', 'incomplete fields');
  if (!m.icons?.some((i) => i.purpose === 'maskable')) fail('/site.webmanifest', 'no maskable icon');
  if ((m.screenshots ?? []).length < 2) fail('/site.webmanifest', 'needs 2 screenshots');
  for (const asset of [...(m.icons ?? []), ...(m.screenshots ?? [])]) {
    const r = await fetch(BASE + asset.src);
    if (r.status !== 200) fail('/site.webmanifest', `asset ${asset.src} → ${r.status}`);
  }
} catch {
  fail('/site.webmanifest', `unreadable (${manifest.status})`);
}
const robots = await get('/robots.txt');
if (!robots.body.includes('Sitemap:') || !robots.body.includes('/sitemap.xml')) fail('/robots.txt', 'no sitemap reference');
for (const p of ['/llms.txt', '/llms-full.txt']) {
  const r = await get(p);
  if (r.status !== 200 || !r.type.includes('text/plain') || !r.body.startsWith('# Ethereum Beat')) fail(p, `bad response (${r.status})`);
}

// ── report ──────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n${failures.length} failures:`);
  for (const f of failures) console.error(`  ${f.route}: ${f.what}`);
} else {
  console.log(`\nALL GREEN — ${routes.length} routes + crawl surfaces.`);
}
process.exit(failures.length ? 1 : 0);
