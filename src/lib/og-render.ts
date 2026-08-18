/**
 * Runtime glue for the OG card. Rendering needs two wasm engines — satori's yoga
 * (layout) and resvg (raster). Cloudflare Workers can't compile wasm from bytes
 * at request time, so the eager worker entry (worker/index.ts) imports both —
 * wrangler esbuild pre-compiles them to WebAssembly.Modules — and stashes them
 * on globalThis. Here we only *instantiate* them (initEngines), which is
 * permitted via the sync-instance shim. See worker/index.ts for the why.
 */
import { renderBeatPng, initEngines } from './og-card.mjs';
import { OG_FONTS } from './og-fonts';

/** the fields the BEAT card renders (mirrors og-card.mjs' JSDoc) */
export interface BeatCardState {
  value: string;
  suffix: string;
  label: string;
  letter?: string;
  slot: number;
  asOf: string | null;
}

/** state → PNG bytes; instantiates both engines once per isolate from the globals. */
export async function renderBeat(state: BeatCardState): Promise<Uint8Array> {
  const g = globalThis as Record<string, unknown>;
  if (!g.__yogaWasm || !g.__resvgWasm) {
    throw new Error('og wasm modules missing on globalThis — worker entry did not compile them');
  }
  await initEngines(g.__yogaWasm, g.__resvgWasm);
  return renderBeatPng(state, OG_FONTS);
}
