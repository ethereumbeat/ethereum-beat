/**
 * Framework-free renderer for the dynamic BEAT social card (spec §33.A).
 * Shared by the runtime route (src/pages/og/beat.png.ts) and the build-time
 * fallback generator (scripts/build-og-assets.mjs), so the layout lives in one
 * place. Pure design tokens inlined — paper/ink/red, 1px lines, corner crop
 * marks, Departure Mono for the live value + slot, the grotesk for labels.
 * No rounded cards, no shadows. 1200×800 (3:2).
 *
 * satori + @resvg/resvg-wasm are both Workers-compatible. The wasm binary is
 * supplied by the caller (a WebAssembly.Module in the Worker, a Buffer in Node),
 * so this module never does the environment-specific `.wasm` import itself.
 */
// `satori/standalone` does NOT auto-load its yoga (layout) wasm — we init it
// ourselves, which is what makes satori work on Cloudflare Workers (the default
// entry's yoga auto-init compiles wasm at request time and is rejected).
import satori, { init as initYoga } from 'satori/standalone';
import { Resvg, initWasm } from '@resvg/resvg-wasm';

/**
 * Instantiate both wasm engines (yoga + resvg) from pre-compiled modules. On
 * Workers, async WebAssembly.instantiate() is rejected even for a compiled
 * module ("code generation disallowed"); the permitted form is the SYNChronous
 * WebAssembly.Instance constructor, so we briefly route instantiate() of a
 * Module through it while both engines initialise, then restore. In Node (the
 * build script) the modules pass straight through — async instantiate is fine.
 * @param {unknown} yogaModule @param {unknown} resvgModule
 */
let enginesReady = null;
export function initEngines(yogaModule, resvgModule) {
  if (enginesReady) return enginesReady;
  const orig = WebAssembly.instantiate;
  WebAssembly.instantiate = (m, imp) =>
    m instanceof WebAssembly.Module ? Promise.resolve(new WebAssembly.Instance(m, imp)) : orig(m, imp);
  enginesReady = (async () => {
    await initYoga(yogaModule);
    await initWasm(resvgModule);
  })().finally(() => {
    WebAssembly.instantiate = orig;
  });
  return enginesReady;
}

export const OG_W = 1200;
export const OG_H = 800;

// Two palettes, mirroring the site's own light ":root" and dark "02 BONE"
// ([data-theme=dark]) tokens in src/styles/tokens.css. The signal red is kept
// in BOTH themes (the site's red bar does the same), and the CROPS badge letter
// stays a near-white knockout on that red in both — so `onAccent` is constant.
const THEMES = {
  light: { bg: '#fbfbf9', ink: '#0a0a0a', accent: '#c90500', onAccent: '#fbfbf9' },
  dark: { bg: '#0a0a0a', ink: '#f4f2ec', accent: '#c90500', onAccent: '#fbfbf9' },
};
export const OG_THEMES = /** @type {const} */ (['light', 'dark']);
/** @param {unknown} theme */
export const resolveTheme = (theme) => (theme === 'dark' ? 'dark' : 'light');

const MONO = 'Departure Mono';
// The card commits to the single pixel data face (Departure Mono) for a punchy,
// legible social thumbnail and a small Worker bundle; hierarchy comes from size
// + opacity, not a second family. GROTESK is an alias so the label/url voices
// stay distinguishable in the layout if a grotesk is bundled later.
const GROTESK = MONO;

/** one L-shaped print crop mark, absolutely positioned at a frame corner */
function cropMark(corner, ink) {
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
        borderColor: ink,
        borderStyle: 'solid',
        borderTopWidth: corner.includes('t') ? th : 0,
        borderBottomWidth: corner.includes('b') ? th : 0,
        borderLeftWidth: corner.includes('l') ? th : 0,
        borderRightWidth: corner.includes('r') ? th : 0,
      },
    },
  };
}

function span(text, style) {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children: String(text) } };
}

/**
 * Build the satori element tree for the card.
 * @param {{ value: string, suffix: string, label: string, letter?: string, slot: number, asOf: string|null, theme?: 'light'|'dark' }} s
 */
export function beatCardElement(s) {
  const value = s.value ?? '—';
  const suffix = s.suffix ?? '';
  const label = (s.label ?? 'ETHEREUM').toUpperCase();
  const slot = Number.isFinite(s.slot) ? s.slot.toLocaleString('en-US') : '—';
  const { bg, ink, accent, onAccent } = THEMES[resolveTheme(s.theme)];

  return {
    type: 'div',
    props: {
      style: {
        width: OG_W,
        height: OG_H,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        background: bg,
        color: ink,
        padding: 84,
        fontFamily: MONO,
      },
      children: [
        cropMark('tl', ink),
        cropMark('tr', ink),
        cropMark('bl', ink),
        cropMark('br', ink),

        // top row — wordmark + snapshot date
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
            children: [
              span('ETHEREUM BEAT', { fontFamily: MONO, fontSize: 34, letterSpacing: 4 }),
              span(s.asOf ? `AS OF ${s.asOf}` : '', {
                fontFamily: GROTESK,
                fontSize: 24,
                letterSpacing: 2,
                color: ink,
                opacity: 0.62,
              }),
            ],
          },
        },

        // hero — metric label + big red value
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column' },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: 18 },
                  children: [
                    s.letter
                      ? span(s.letter, {
                          fontFamily: MONO,
                          fontSize: 26,
                          color: onAccent,
                          background: accent,
                          padding: '6px 12px',
                          letterSpacing: 1,
                        })
                      : span('', { width: 0 }),
                    span(label, { fontFamily: GROTESK, fontSize: 44, letterSpacing: 1 }),
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'flex-end', marginTop: 8 },
                  children: [
                    span(value, { fontFamily: MONO, fontSize: 210, color: accent, lineHeight: 1 }),
                    suffix
                      ? span(suffix, {
                          fontFamily: MONO,
                          fontSize: 64,
                          color: accent,
                          marginLeft: 24,
                          marginBottom: 24,
                        })
                      : span('', { width: 0 }),
                  ],
                },
              },
            ],
          },
        },

        // bottom row — slot (left) · CROPS framework + url (right group)
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
            children: [
              span(`SLOT ${slot}`, { fontFamily: MONO, fontSize: 34 }),
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: 40 },
                  children: [
                    span('CR · O · P · S', { fontFamily: GROTESK, fontSize: 26, letterSpacing: 3, opacity: 0.7 }),
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', alignItems: 'center', gap: 14 },
                        children: [
                          {
                            type: 'div',
                            props: { style: { display: 'flex', width: 15, height: 15, background: accent } },
                          },
                          span('ethereumbeat.org', { fontFamily: GROTESK, fontSize: 28, letterSpacing: 1 }),
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
}

/** satori-only: element tree → SVG string. `fonts` is satori's font array. */
export async function renderBeatSvg(state, fonts) {
  return satori(beatCardElement(state), { width: OG_W, height: OG_H, fonts });
}

/**
 * Full pipeline: state + fonts → PNG bytes. Assumes initEngines() has been
 * awaited by the caller (the wasm sources differ per environment).
 */
export async function renderBeatPng(state, fonts) {
  const svg = await renderBeatSvg(state, fonts);
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: OG_W } });
  return resvg.render().asPng();
}
