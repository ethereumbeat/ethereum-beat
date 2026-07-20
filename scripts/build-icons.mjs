/**
 * Rasterise the icon set from public/favicon.svg — the simplified mark
 * (glyph + ring + one red tick), NOT the full avatar. Playwright renders
 * the SVG at each size so the PNGs stay pixel-faithful to the vector — no
 * extra image dependencies.
 *
 *   node scripts/build-icons.mjs
 *
 * Output (paths per the community/metadata reference):
 * - public/favicon-64.png              64,  transparent  (small)
 * - public/apple-touch-icon.png        180, opaque paper, 12% pad (small)
 * - public/icons/icon-192.png          192, transparent
 * - public/icons/icon-512.png          512, transparent
 * - public/icons/icon-maskable-512.png 512, opaque paper, 20% safe-zone pad
 */

import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/favicon.svg'), 'utf8');
const pub = join(root, 'public');
mkdirSync(join(pub, 'icons'), { recursive: true });

const PAPER = '#fbfbf9';
const JOBS = [
  { file: 'favicon-64.png', size: 64, pad: 0, bg: null },
  { file: 'apple-touch-icon.png', size: 180, pad: 0.12, bg: PAPER },
  { file: 'icons/icon-192.png', size: 192, pad: 0, bg: null },
  { file: 'icons/icon-512.png', size: 512, pad: 0, bg: null },
  // maskable: opaque, glyph inside the 80% safe zone so platform masks never clip it
  { file: 'icons/icon-maskable-512.png', size: 512, pad: 0.2, bg: PAPER },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });

for (const { file, size, pad, bg } of JOBS) {
  const inner = Math.round(size * (1 - 2 * pad));
  await page.setContent(
    `<style>html,body{margin:0}</style>
     <div id="i" style="width:${size}px;height:${size}px;display:grid;place-items:center;${bg ? `background:${bg}` : ''}">
       <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
     </div>`,
  );
  await page.locator('#i').screenshot({ path: join(pub, file), omitBackground: !bg });
  console.log(`${file} ${size}x${size}${pad ? ` (pad ${pad * 100}%)` : ''}`);
}

await browser.close();
