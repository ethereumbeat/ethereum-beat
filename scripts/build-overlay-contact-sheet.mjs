/**
 * Detail-overlay contact sheet (PR D — sci-fi HUD modal).
 *
 * Screenshots the /pulse detail overlay (which opens on load over the live
 * dial) in all seven themes and composes them into one labelled PNG:
 *
 *   node scripts/build-overlay-contact-sheet.mjs --base http://localhost:8788 \
 *        --out overlay-contact-sheet.png
 *
 * Each cell is the real rendered modal for that theme (localStorage theme set
 * before load), laid out in an HTML grid that is itself screenshotted.
 */
import { chromium } from 'playwright';

const arg = (flag, def) =>
  process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : def;
const BASE = arg('--base', 'http://localhost:8788');
const OUT = arg('--out', 'overlay-contact-sheet.png');
const METRIC = arg('--metric', 'txcount_combined');
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
const SHOT_W = 1000;
const SHOT_H = 640;

const browser = await chromium.launch(CI ? { args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {});
const ctx = await browser.newContext({ viewport: { width: SHOT_W, height: SHOT_H } });
const page = await ctx.newPage();

const cells = [];
for (const [theme, label] of THEMES) {
  await page.goto('about:blank');
  await page.addInitScript((th) => localStorage.setItem('theme', th), theme);
  await page.goto(`${BASE}/pulse/${METRIC}`, { waitUntil: 'networkidle' }).catch(() => page.goto(`${BASE}/pulse/${METRIC}`));
  await page.evaluate((th) => (document.documentElement.dataset.theme = th), theme);
  await page.waitForSelector('.pulse-hud', { timeout: 15000 });
  await page.waitForTimeout(1400); // let the chart + frame settle
  const buf = await page.screenshot({ type: 'png' });
  cells.push({ label, uri: `data:image/png;base64,${buf.toString('base64')}` });
  process.stdout.write(`captured overlay · ${theme}\n`);
}

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
  <h1>ETHEREUM BEAT — DETAIL OVERLAY · SEVEN THEMES</h1>
  <p>Sci-fi HUD modal on /pulse/${METRIC} · generated ${CI ? 'in CI' : 'locally'}</p>
  <div class="grid">
    ${cells.map((c) => `<figure><img src="${c.uri}"/><figcaption>${c.label}</figcaption></figure>`).join('')}
  </div>
</body></html>`;

await page.setViewportSize({ width: SHOT_W * 2 + 22 + 48, height: 400 });
await page.setContent(sheet, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log(`\noverlay contact sheet → ${OUT}`);
