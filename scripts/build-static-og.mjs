/**
 * Generates the STATIC launch social card committed at public/og/default.png.
 *
 * For launch the site ships this fixed 1200×630 black card as the default
 * og:image / twitter:image (Layout.astro, USE_DYNAMIC_OG=false) instead of the
 * live /og/beat.png render — a predictable, always-identical card while the
 * dynamic generator stays in the codebase for later per-channel use.
 *
 * Same toolchain as build-og-assets.mjs: satori (JSX→SVG) + @resvg/resvg-wasm
 * (SVG→PNG), Departure Mono decompressed from woff2 with the MIT `wawoff2`
 * decoder (a devDependency, never shipped to the edge). Re-run after a design
 * change:  node scripts/build-static-og.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as wawoff from 'wawoff2';
import satori from 'satori/standalone';
import { Resvg } from '@resvg/resvg-wasm';
import { initEngines } from '../src/lib/og-card.mjs';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const p = (rel) => new URL(rel, `file://${ROOT}`).pathname;

// 1200×630 (1.91:1) — the canonical OG / X summary_large_image ratio.
const W = 1200;
const H = 630;
// Black-theme design tokens, mirroring the site's dark "02 BONE" theme
// (src/styles/tokens.css): hard black field, bone-white ink, red the only
// accent. Departure Mono for every voice, as the dynamic card does.
const BG = '#0a0a0a';
const INK = '#f4f2ec';
const ACCENT = '#c90500';
const MONO = 'Departure Mono';

const span = (text, style) => ({
  type: 'div',
  props: { style: { display: 'flex', fontFamily: MONO, ...style }, children: String(text) },
});

/** one L-shaped 2px print crop mark at a frame corner */
const cropMark = (corner) => {
  const arm = 34;
  const th = 2;
  const inset = 40;
  const v = corner.includes('t') ? { top: inset } : { bottom: inset };
  const h = corner.includes('l') ? { left: inset } : { right: inset };
  return {
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        width: arm,
        height: arm,
        ...v,
        ...h,
        borderColor: INK,
        borderStyle: 'solid',
        borderTopWidth: corner.includes('t') ? th : 0,
        borderBottomWidth: corner.includes('b') ? th : 0,
        borderLeftWidth: corner.includes('l') ? th : 0,
        borderRightWidth: corner.includes('r') ? th : 0,
      },
    },
  };
};

const tree = {
  type: 'div',
  props: {
    style: {
      width: W,
      height: H,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      background: BG,
      color: INK,
      padding: 72,
      fontFamily: MONO,
    },
    children: [
      cropMark('tl'),
      cropMark('tr'),
      cropMark('bl'),
      cropMark('br'),

      // top row — wordmark · ethos
      {
        type: 'div',
        props: {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
          children: [
            span('ETHEREUM BEAT', { fontSize: 32, letterSpacing: 4 }),
            span('NO PRICES · NO MARKET DATA', { fontSize: 20, letterSpacing: 2, opacity: 0.62 }),
          ],
        },
      },

      // hero — the brand line, red accent used once as a blinking-cursor block
      {
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'column' },
          children: [
            span('THE PULSE OF', { fontSize: 52, letterSpacing: 2, opacity: 0.9 }),
            {
              type: 'div',
              props: {
                style: { display: 'flex', alignItems: 'flex-end', marginTop: 6 },
                children: [
                  span('ETHEREUM', { fontSize: 132, lineHeight: 1 }),
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        width: 34,
                        height: 96,
                        marginLeft: 24,
                        marginBottom: 8,
                        background: ACCENT,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },

      // 1px rule + bottom row — CROPS framework · url
      {
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'column' },
          children: [
            {
              type: 'div',
              props: { style: { display: 'flex', height: 1, background: INK, opacity: 0.28, marginBottom: 22 } },
            },
            {
              type: 'div',
              props: {
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
                children: [
                  span('CR · O · P · S', { fontSize: 24, letterSpacing: 3, opacity: 0.7 }),
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', alignItems: 'center', gap: 14 },
                      children: [
                        { type: 'div', props: { style: { display: 'flex', width: 15, height: 15, background: ACCENT } } },
                        span('ethereumbeat.org', { fontSize: 28, letterSpacing: 1 }),
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  },
};

// ── fonts + engines (same pattern as build-og-assets.mjs) ──────────────────
const woff2 = await readFile(p('public/fonts/departure-mono.woff2'));
const otf = Buffer.from(await wawoff.decompress(woff2));
const fonts = [{ name: MONO, data: otf, weight: 400, style: 'normal' }];

const yogaWasm = await readFile(require.resolve('satori/yoga.wasm'));
const resvgWasm = await readFile(p('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
await initEngines(yogaWasm, resvgWasm);

const svg = await satori(tree, { width: W, height: H, fonts });
const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
if (png[0] !== 0x89 || png[1] !== 0x50) throw new Error('static og render did not produce a PNG');

await mkdir(p('public/og'), { recursive: true });
await writeFile(p('public/og/default.png'), png);
console.log(`wrote public/og/default.png (${W}×${H}, ${png.length}B)`);
