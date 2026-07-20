/**
 * Synthesised sound, no audio files. Off by default; enabling requires a
 * click, which also satisfies autoplay policy. A soft lub-dub per beat
 * (S1 stronger, S2 ~180ms later), a dry tick per new block, accented on
 * epoch boundaries. Preference persists in localStorage.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;

const PREF_KEY = 'sound';

export function isEnabled(): boolean {
  return enabled;
}

export function wantsSound(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}

/** must be called from a user gesture the first time */
export function setEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0');
  } catch {
    /* private mode */
  }
  try {
    if (on && !ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx) void (on ? ctx.resume() : ctx.suspend()).catch(() => undefined);
  } catch {
    // no audio device / synthesis unavailable: stay silent, keep the UI state
  }
}

/** a low filtered thump: the body of a heart sound */
function thump(freq: number, gain: number, dur: number, when = 0): void {
  if (!ctx || !master || !enabled || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(28, freq * 0.6), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** soft lub-dub; the systole lands noticeably harder */
export function lubDub(systole: boolean): void {
  const s = systole ? 1 : 0.4;
  thump(58, 0.5 * s, 0.11); // S1 "lub"
  thump(46, 0.3 * s, 0.13, 0.18); // S2 "dub", softer
}

/** dry tick per new block; epoch boundaries get a brighter accent */
export function blockTick(epochBoundary: boolean): void {
  if (!ctx || !master || !enabled || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  osc.type = 'square';
  osc.frequency.value = epochBoundary ? 2600 : 1900;
  const peak = epochBoundary ? 0.16 : 0.08;
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (epochBoundary ? 0.05 : 0.025));
  osc.connect(hp).connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + 0.08);
  if (epochBoundary) {
    // a second, quick echo tick marks the boundary
    const t1 = t0 + 0.09;
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.value = 3200;
    g2.gain.setValueAtTime(0.1, t1);
    g2.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.04);
    osc2.connect(g2).connect(master);
    osc2.start(t1);
    osc2.stop(t1 + 0.06);
  }
}
