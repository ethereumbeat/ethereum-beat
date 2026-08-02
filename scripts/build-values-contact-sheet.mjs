/**
 * Values-beat contact sheet (PR B — dissolve the values card).
 *
 * Screenshots the VALUES beat (dissolved into the dial, no filled panel) in
 * all seven themes and composes them into one labelled PNG for review:
 *
 *   node scripts/build-values-contact-sheet.mjs --base http://localhost:8788 \
 *        --out values-contact-sheet.png
 *
 * For each theme it loads /, sets the theme before load, holds the rotation
 * (Space) and jumps to the values slot (the ∞ Values tab in the rotation
 * index), then screenshots the live dial. The captures are laid out in an
 * HTML grid that is itself screenshotted so the theme name sits under each.
 */
import { chromium } from 'playwright';

const arg = (flag, def) =>
  process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : def;
const BASE = arg('--base', 'http://localhost:8788');
const OUT = arg('--out', 'values-contact-sheet.png');
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
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => page.goto(BASE + '/'));
  await page.evaluate((th) => (document.documentElement.dataset.theme = th), theme);
  // the rotation index (with the ∞ Values tab) appears once the snapshot loads
  await page.waitForSelector('button[aria-label="Values"]', { timeout: 15000 });
  // hold the rotation so the values beat stays put, then jump to it
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('Space');
  await page.click('button[aria-label="Values"]');
  await page.waitForSelector('.values-principle', { timeout: 5000 });
  await page.waitForTimeout(1200);
  const buf = await page.screenshot({ type: 'png' });
  cells.push({ label, uri: `data:image/png;base64,${buf.toString('base64')}` });
  process.stdout.write(`captured values beat · ${theme}\n`);
}

// compose: an HTML grid (2 columns), screenshotted whole
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
  <h1>ETHEREUM BEAT — VALUES BEAT · SEVEN THEMES</h1>
  <p>Dissolved into the dial (no filled panel) · principle "${'NO ONE CAN STOP YOU'}" · generated ${CI ? 'in CI' : 'locally'}</p>
  <div class="grid">
    ${cells.map((c) => `<figure><img src="${c.uri}"/><figcaption>${c.label}</figcaption></figure>`).join('')}
  </div>
</body></html>`;

await page.setViewportSize({ width: SHOT_W * 2 + 22 + 48, height: 400 });
await page.setContent(sheet, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log(`\nvalues contact sheet → ${OUT}`);
