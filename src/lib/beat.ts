/**
 * The beat engine: one rAF clock synced to real slot boundaries.
 *
 * Design pass 2: the pulse is physiological. The disc beats continuously
 * like a resting heart at 65 bpm — exactly 13 lub-dubs per 12s slot, so the
 * first beat of every slot lands precisely on the slot boundary. That beat
 * is the SYSTOLE: stronger, it fires the big QRS, advances the KPI and
 * triggers the glitch. The page is never still.
 */
import { slotClock, type SlotClock } from './clock';

export const BEATS_PER_SLOT = 13; // 65 bpm at 12s slots
export const BEAT_PERIOD = 12 / BEATS_PER_SLOT;
export const BPM = Math.round(BEATS_PER_SLOT * 5); // beats per 60s

export interface BeatFrame {
  nowMs: number;
  clock: SlotClock;
  /** glyph scale for this frame (1 = rest) */
  scale: number;
  /** halo intensity 0..1 */
  glow: number;
  /** true only during the systole beat window of the slot */
  systole: boolean;
}

export interface BeatEngine {
  start(): void;
  stop(): void;
  onFrame(cb: (f: BeatFrame) => void): () => void;
  /** fires once per slot boundary (the systole) */
  onBeat(cb: (slot: number) => void): () => void;
}

/** damped impulse: sharp attack at t=0, exponential settle */
function impulse(t: number, width: number): number {
  if (t < 0) return 0;
  return (t / width) * Math.exp(1 - t / width);
}

/**
 * Continuous heart envelope within a slot: every BEAT_PERIOD a lub-dub
 * (strong S1, softer S2 ~180ms later); the slot's first beat is the systole
 * and lands harder.
 */
export function pulseEnvelope(tSlot: number): { scale: number; glow: number; systole: boolean } {
  const beatIdx = Math.floor(tSlot / BEAT_PERIOD);
  const tBeat = tSlot - beatIdx * BEAT_PERIOD;
  const systole = beatIdx === 0;
  const strength = systole ? 1 : 0.38;
  const s1 = impulse(tBeat, 0.1) * 0.05 * strength; // S1, "lub"
  const s2 = impulse(tBeat - 0.18, 0.12) * 0.085 * strength; // S2, "dub", softer attack
  const s = s1 + s2;
  return { scale: 1 + s, glow: Math.min(1, s * (systole ? 11 : 7)), systole: systole && tBeat < 0.6 };
}

export function createBeatEngine(reducedMotion: boolean): BeatEngine {
  const frameCbs = new Set<(f: BeatFrame) => void>();
  const beatCbs = new Set<(slot: number) => void>();
  let raf = 0;
  let lastSlot = -1;
  let running = false;
  let suspended = false;

  function frame() {
    const nowMs = Date.now();
    const clock = slotClock(nowMs);
    if (clock.slot !== lastSlot) {
      if (lastSlot !== -1) for (const cb of beatCbs) cb(clock.slot);
      lastSlot = clock.slot;
    }
    const env = reducedMotion
      ? { scale: 1, glow: 0, systole: false }
      : pulseEnvelope(clock.secondsIntoSlot);
    const f: BeatFrame = { nowMs, clock, ...env };
    for (const cb of frameCbs) cb(f);
    if (running && !suspended) raf = requestAnimationFrame(frame);
  }

  const onVisibility = () => {
    // suspend everything while the tab is hidden; resync on return
    suspended = document.hidden;
    if (!suspended && running) {
      lastSlot = slotClock(Date.now()).slot; // no burst of missed beats
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastSlot = slotClock(Date.now()).slot; // no beat on mount
      document.addEventListener('visibilitychange', onVisibility);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(raf);
    },
    onFrame(cb) {
      frameCbs.add(cb);
      return () => frameCbs.delete(cb);
    },
    onBeat(cb) {
      beatCbs.add(cb);
      return () => beatCbs.delete(cb);
    },
  };
}

/**
 * One rAF loop for the whole app: islands share this engine, and with the
 * ClientRouter it persists across channel switches. start() is idempotent;
 * nobody stops it — visibilitychange suspension handles hidden tabs.
 */
let shared: BeatEngine | null = null;
export function sharedEngine(reducedMotion: boolean): BeatEngine {
  if (!shared) shared = createBeatEngine(reducedMotion);
  shared.start();
  return shared;
}
