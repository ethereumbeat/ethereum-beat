/**
 * Build-time OG cards (spec §18.5): one 1200x630 card per channel plus a
 * generic /pulse card, rendered with the SAME share-template renderer the
 * in-page share modal uses (src/lib/share-render.ts) so the cards are in
 * the site's exact visual language. esbuild (already here via vite)
 * bundles the renderer + route registry for a Playwright page; the site
 * fonts are injected as data: @font-faces so Departure Mono lands in the
 * bitmap. Output committed to public/og/*.png.
 *
 *   node scripts/build-og.mjs
 */

import esbuild from 'esbuild';
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/og');
mkdirSync(outDir, { recursive: true });

const bundle = await esbuild.build({
  stdin: {
    contents: `export { renderShare } from './src/lib/share-render.ts';
export { ROUTES, SITE_TAGLINE, DEFAULT_CANONICAL_HOST } from './src/lib/site.ts';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  globalName: 'OG',
  write: false,
});
const js = bundle.outputFiles[0].text;

const font = (file) => readFileSync(join(root, 'public/fonts', file)).toString('base64');
const css = `
  @font-face { font-family: 'Departure Mono'; src: url(data:font/woff2;base64,${font('departure-mono.woff2')}) format('woff2'); }
  @font-face { font-family: 'Martian Mono Var'; src: url(data:font/woff2;base64,${font('martian-mono-var.woff2')}) format('woff2'); font-weight: 100 800; }
`;

// the cards render on the paper theme: the print look, and the one that
// survives messaging apps' light and dark chrome equally
const THEME = { paper: '#fbfbf9', ink: '#0a0a0a', accent: '#c90500' };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 700 } });
await page.setContent(`<style>${css}</style><canvas id="c"></canvas>`);
await page.addScriptTag({ content: js });
await page.evaluate(async () => {
  await document.fonts.load('120px "Departure Mono"');
  await document.fonts.load('20px "Martian Mono Var"');
  await document.fonts.ready;
});

const cards = await page.evaluate((theme) => {
  const canvas = document.getElementById('c');
  const host = OG.DEFAULT_CANONICAL_HOST;
  const out = {};
  for (const r of OG.ROUTES) {
    const data = {
      value: r.channel,
      label: r.oneLine,
      index: `CH_${r.ch}`,
      url: `https://${host}`,
      motif: /^\d+$/.test(String(+r.ch)) && r.ch !== '01' ? String(+r.ch) : undefined,
      stamp: OG.SITE_TAGLINE.toUpperCase(),
    };
    const template = r.path === '/' ? 'dial' : r.path === '/about' ? 'minimal' : 'motif';
    OG.renderShare(canvas, data, template, 'wide', theme);
    out[r.og] = canvas.toDataURL('image/png');
  }
  // the generic /pulse/[metric] card
  OG.renderShare(
    canvas,
    {
      value: 'PULSE',
      label: 'every metric · five ranges · open API',
      index: '_//',
      url: `https://${host}`,
      stamp: OG.SITE_TAGLINE.toUpperCase(),
    },
    'disc',
    'wide',
    theme,
  );
  out['pulse'] = canvas.toDataURL('image/png');
  return out;
}, THEME);

for (const [name, dataUrl] of Object.entries(cards)) {
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`og/${name}.png`);
}

await browser.close();
