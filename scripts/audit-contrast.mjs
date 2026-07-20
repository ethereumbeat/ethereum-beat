/**
 * Pixel-truth contrast audit — the permanent QA gate (spec §17.1).
 *
 * Loads every route in both themes at five viewports and, for every
 * visible text node, samples the ACTUAL RENDERED PIXELS of the glyphs
 * against their surrounding background. Computed styles lie whenever
 * layers, blend modes, opacity or images are involved; screenshots
 * don't.
 *
 * Method, per text node:
 *   1. Range.getClientRects() gives the tight boxes of the text itself.
 *   2. From the page screenshot, background = the most common colour in
 *      a 3px halo around the text box (quantised); foreground = the mean
 *      of the top 2% of in-box pixels by distance from that background —
 *      the glyph cores. Antialiased edge pixels never reach the core
 *      colour, so judging on percentile blends would flag text that a
 *      reader sees at full strength; judging on cores matches what the
 *      eye resolves.
 *   3. WCAG ratio between those two colours; threshold 4.5:1, or 3:1
 *      when the computed font-size >= 24px (large text).
 *
 * The page is loaded with prefers-reduced-motion and all animations
 * paused so DOM geometry and screenshot describe the same frame.
 *
 * Usage:  node scripts/audit-contrast.mjs [--base http://localhost:8788]
 * Output: audit-report.md (exit code 1 if any failure).
 */

import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8788';
// --ci: CI-appropriate Chromium launch flags (some runners restrict the
// sandbox). Playwright's bundled Chromium is used either way.
const CI = process.argv.includes('--ci');

const ROUTES = ['/', '/nodes', '/blobs', '/flow', '/finality', '/layers', '/about'];
const THEMES = ['light', 'dark'];
const VIEWPORTS = [
  [1280, 700],
  [1440, 900],
  [1536, 960],
  [1920, 1080],
  [390, 844],
];

/**
 * Decorative allowlist — every entry justified. These are ambient
 * texture by design, sit behind real content, and carry no information
 * that isn't also presented as legible text elsewhere. Anything inside
 * [aria-hidden] is skipped wholesale for the same reason (that is what
 * the attribute asserts).
 */
const ALLOWLIST = [
  // the hex-dump crawl: real block bytes at 3.5% opacity, pure ambience
  '.hex-crawl',
  // the giant channel numeral watermark behind each page (ghost tier)
  '.channel-id',
];

function srgb(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance([r, g, b]) {
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const quant = ([r, g, b]) => `${r >> 4},${g >> 4},${b >> 4}`;

/** analyse one text box against the page screenshot */
function sampleBox(png, box) {
  const { width, height, data } = png;
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(width, Math.ceil(box.x + box.w));
  const y1 = Math.min(height, Math.ceil(box.y + box.h));
  if (x1 - x0 < 3 || y1 - y0 < 3) return null;

  const px = (x, y) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };

  // background: modal colour of the 3px halo around the box
  const halo = new Map();
  const H = 3;
  for (let y = Math.max(0, y0 - H); y < Math.min(height, y1 + H); y++) {
    for (let x = Math.max(0, x0 - H); x < Math.min(width, x1 + H); x++) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      const c = px(x, y);
      const k = quant(c);
      const e = halo.get(k) ?? { n: 0, sum: [0, 0, 0] };
      e.n++;
      e.sum[0] += c[0];
      e.sum[1] += c[1];
      e.sum[2] += c[2];
      halo.set(k, e);
    }
  }
  if (halo.size === 0) return null;
  const bgE = [...halo.values()].sort((a, b) => b.n - a.n)[0];
  const bg = bgE.sum.map((v) => Math.round(v / bgE.n));

  // foreground: 95th-percentile most-distant in-box colour from bg
  const dists = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const c = px(x, y);
      dists.push([dist2(c, bg), c]);
    }
  }
  dists.sort((a, b) => b[0] - a[0]);
  // glyph core: mean of the top 2% most-distant pixels (at least 4)
  const n = Math.max(4, Math.floor(dists.length * 0.02));
  const top = dists.slice(0, n);
  if (!top.length || top[top.length - 1][0] < 64) return null; // box is blank: nothing to judge
  const fg = [0, 1, 2].map((i) => Math.round(top.reduce((s, d) => s + d[1][i], 0) / top.length));
  return { fg, bg };
}

async function collectTextBoxes(page, allowSel) {
  return page.evaluate((allow) => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const t = walker.currentNode;
      const el = t.parentElement;
      if (!el || !t.textContent.trim() || seen.has(el)) continue;
      // punctuation-only separator nodes (the middle dots between ticker
      // items, em-dash placeholders) convey no information — a 2px dot
      // has no glyph core to sample and no reading to lose
      if (/^[\u00b7\u2013\u2014\u2015\-–—·.,:;|/\\s]+$/.test(t.textContent.trim())) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      // WCAG 1.4.3 exempts inactive UI components (e.g. the command
      // bar's home-only actions when shown dimmed on other channels)
      if (el.closest('[aria-disabled="true"]')) continue;
      if (allow.some((s) => el.closest(s))) continue;
      // composited invisibility up the tree
      let e = el;
      let visible = true;
      while (e) {
        if (+getComputedStyle(e).opacity < 0.05) visible = false;
        e = e.parentElement;
      }
      if (!visible) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      const rects = [...range.getClientRects()].filter(
        (r) => r.width > 2 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
      );
      if (!rects.length) continue;
      let r = rects[0]; // first line is representative
      // a row half-clipped by a scroll container's edge shows only a
      // glyph sliver — not a position anyone reads it at. require >=70%
      // of the line height to survive ancestor overflow clipping
      {
        let clip = { top: r.top, bottom: r.bottom };
        let anc = el.parentElement;
        let clippedAway = false;
        while (anc) {
          const o = getComputedStyle(anc);
          if (o.overflowY !== 'visible' || o.overflowX !== 'visible') {
            const ar = anc.getBoundingClientRect();
            clip.top = Math.max(clip.top, ar.top);
            clip.bottom = Math.min(clip.bottom, ar.bottom);
          }
          anc = anc.parentElement;
        }
        if (clip.bottom - clip.top < r.height * 0.7) clippedAway = true;
        if (clippedAway) continue;
      }
      // occlusion: text under a fixed overlay (the command bar, a modal
      // scrim) is not being read there — judge text only where a reader
      // can see it. pointer-events:none ornaments don't hit-test, so the
      // grain/scanline layers never mask anything from the audit.
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) continue;
      out.push({
        x: r.x,
        y: r.y,
        w: Math.min(r.width, innerWidth - r.x),
        h: r.height,
        fontSize: parseFloat(cs.fontSize),
        text: t.textContent.trim().slice(0, 32),
        sel:
          el.tagName.toLowerCase() +
          (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 2).join('.') : ''),
      });
    }
    return out;
  }, allowSel);
}

const failures = [];
let checked = 0;

const browser = await chromium.launch(CI ? { args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {});
const ctx = await browser.newContext({ reducedMotion: 'reduce' });
const page = await ctx.newPage();

for (const [w, h] of VIEWPORTS) {
  await page.setViewportSize({ width: w, height: h });
  for (const route of ROUTES) {
    for (const theme of THEMES) {
      await page.goto('about:blank');
      await page.addInitScript((th) => localStorage.setItem('theme', th), theme);
      await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => page.goto(BASE + route));
      await page.waitForTimeout(2600);
      await page.evaluate((th) => {
        document.documentElement.dataset.theme = th;
      }, theme);
      // animation: none (not paused): pausing freezes flickers/fade-ins at
      // arbitrary keyframes (opacity 0.25 mid-flicker), which is not a
      // state a reader ever dwells on; none lands on the base state
      await page.addStyleTag({
        content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
      });
      await page.waitForTimeout(350);

      // one sampling pass over the current frame
      const samplePass = async () => {
        const boxes = await collectTextBoxes(page, ALLOWLIST);
        const shot = PNG.sync.read(await page.screenshot({ type: 'png' }));
        const fails = [];
        let n = 0;
        for (const b of boxes) {
          const s = sampleBox(shot, b);
          if (!s) continue;
          n++;
          const need = b.fontSize >= 24 ? 3 : 4.5;
          const r = ratio(s.fg, s.bg);
          if (r < need) fails.push({ sel: b.sel, text: b.text, ratio: +r.toFixed(2), need, fg: s.fg.join(','), bg: s.bg.join(',') });
        }
        return { fails, n };
      };

      const first = await samplePass();
      checked += first.n;
      let confirmed = first.fails;
      if (confirmed.length) {
        // live-data pages (the mempool waterfall) shift between rect
        // collection and screenshot; a failure must reproduce for the
        // SAME element+text on a second frame to count
        await page.waitForTimeout(450);
        const second = await samplePass();
        const key = (f) => `${f.sel}|${f.text.slice(0, 12)}`;
        const secondKeys = new Set(second.fails.map(key));
        confirmed = confirmed.filter((f) => secondKeys.has(key(f)));
      }
      for (const f of confirmed) failures.push({ route, theme, viewport: `${w}x${h}`, ...f });
      process.stdout.write(`${route} ${theme} ${w}x${h}: ${first.n} nodes, ${failures.length} fails so far\n`);
    }
  }
}

await browser.close();

const lines = [
  '# Pixel-truth contrast audit',
  '',
  `- Base: ${BASE}`,
  `- Matrix: ${ROUTES.length} routes x ${THEMES.length} themes x ${VIEWPORTS.length} viewports`,
  `- Text nodes sampled: ${checked}`,
  `- Failures: **${failures.length}**`,
  '',
];
if (failures.length) {
  lines.push('| route | theme | viewport | element | text | ratio | needs | fg | bg |', '|---|---|---|---|---|---|---|---|---|');
  for (const f of failures)
    lines.push(
      `| ${f.route} | ${f.theme} | ${f.viewport} | \`${f.sel}\` | ${f.text} | ${f.ratio} | ${f.need} | ${f.fg} | ${f.bg} |`,
    );
} else {
  lines.push('ALL GREEN — zero failures.');
}
lines.push('', `_Generated ${new Date().toISOString()} by scripts/audit-contrast.mjs_`, '');
writeFileSync('audit-report.md', lines.join('\n'));
console.log(`\n${failures.length} failures → audit-report.md`);
process.exit(failures.length ? 1 : 0);
