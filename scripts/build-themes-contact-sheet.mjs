/**
 * Themes contact sheet (pass 15 item 3).
 *
 * Screenshots all seven themes on / and /layers and composes them into a
 * single labelled contact sheet PNG for review. Run against a live preview:
 *
 *   node scripts/build-themes-contact-sheet.mjs --base http://localhost:8788 \
 *        --out themes-contact-sheet.png
 *
 * Each cell is the real rendered page for that theme (localStorage theme set
 * before load), captured at a review-friendly size and laid out in an HTML
 * grid that is itself screenshotted, so the theme name + route label sit
 * under each shot.
 */
import { chromium } from 'playwright';

const arg = (flag, def) =>
  process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : def;
const BASE = arg('--base', 'http://localhost:8788');
const OUT = arg('--out', 'themes-contact-sheet.png');
const CI = process.argv.includes('--ci');

const THEMES = [
  ['light', '01 INK'],
  ['dark', '02 BONE'],
  ['swiss', '03 SWISS'],
  ['terminal', '04 TERMINAL'],
  ['fluffy', '05 FLUFFY'],
  ['sketch', '06 SKETCH'],
  ['splitflap', '07 SPLIT-FLAP'],
];
const ROUTES = ['/', '/layers'];
const SHOT_W = 900;
const SHOT_H = 560;

const browser = await chromium.launch(CI ? { args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {});
const ctx = await browser.newContext({ viewport: { width: SHOT_W, height: SHOT_H } });
const page = await ctx.newPage();

const cells = [];
for (const [theme, label] of THEMES) {
  for (const route of ROUTES) {
    await page.goto('about:blank');
    await page.addInitScript((th) => localStorage.setItem('theme', th), theme);
    await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => page.goto(BASE + route));
    await page.evaluate((th) => (document.documentElement.dataset.theme = th), theme);
    await page.waitForTimeout(1800);
    const buf = await page.screenshot({ type: 'png' });
    cells.push({ label: `${label} · ${route}`, uri: `data:image/png;base64,${buf.toString('base64')}` });
    process.stdout.write(`captured ${theme} ${route}\n`);
  }
}

// compose: an HTML grid (2 columns = the two routes), screenshotted whole
const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
  :root{color-scheme:light}
  body{margin:0;background:#d9d9d6;font-family:ui-monospace,Menlo,monospace;padding:24px}
  h1{font-size:20px;margin:0 0 4px}
  p{font-size:12px;color:#444;margin:0 0 20px}
  .grid{display:grid;grid-template-columns:repeat(2,${SHOT_W}px);gap:22px}
  figure{margin:0}
  img{display:block;width:${SHOT_W}px;height:${SHOT_H}px;border:1px solid #999}
  figcaption{font-size:13px;font-weight:700;padding:6px 2px;letter-spacing:0.04em}
</style></head><body>
  <h1>ETHEREUM BEAT — SEVEN THEMES</h1>
  <p>Contact sheet · BEAT (/) and LAYERS (/layers) · generated ${CI ? 'in CI' : 'locally'}</p>
  <div class="grid">
    ${cells.map((c) => `<figure><img src="${c.uri}"/><figcaption>${c.label}</figcaption></figure>`).join('')}
  </div>
</body></html>`;

await page.setViewportSize({ width: SHOT_W * 2 + 22 + 48, height: 400 });
await page.setContent(sheet, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log(`\ncontact sheet → ${OUT}`);
