/**
 * One block poll per slot, shared by every consumer (tickers, ECG). The
 * beat engine triggers polls; consumers subscribe. Keeps a small ring of
 * per-slot gas usage so the ECG can replay recent history as it scrolls.
 */
import { fetchLatestBlock, fetchBlockByNumber, type BlockStats } from './rpc';

export interface FeedState {
  latest: BlockStats | null;
  /** true after 3 consecutive failures: RPC considered down (NO SIGNAL) */
  dead: boolean;
}

type Listener = (state: FeedState) => void;

const HISTORY_SLOTS = 96;
/** rolling in-session buffer so modals can chart the value block by block */
const MAX_BLOCKS = 128;

const state: FeedState = { latest: null, dead: false };
const listeners = new Set<Listener>();
const gasBySlot = new Map<number, number>(); // slot -> gasUsed/gasLimit 0..1
const blocks: BlockStats[] = [];
let fails = 0;
let lastGasPct = 0.5;
let inFlight = false;

export function getBlocks(): readonly BlockStats[] {
  return blocks;
}

/** insert keeping ascending order and uniqueness; trim to MAX_BLOCKS */
function insertBlock(b: BlockStats): void {
  if (blocks.some((x) => x.number === b.number)) return;
  let i = blocks.length;
  while (i > 0 && blocks[i - 1]!.number > b.number) i--;
  blocks.splice(i, 0, b);
  if (blocks.length > MAX_BLOCKS) blocks.shift();
}

let seeded = false;

/**
 * Backfill the session buffer with the last 64 blocks so modal charts are
 * full immediately. Sequential fetches with a concurrency cap of 4 — kind
 * to the public RPCs, still done in a couple of seconds.
 */
export async function seedHistory(depth = 64, concurrency = 4): Promise<void> {
  if (seeded) return;
  seeded = true;
  const head = state.latest?.number; // caller polls first
  if (!head) {
    seeded = false; // retry on a later call once the RPC recovers
    return;
  }
  const wanted: number[] = [];
  for (let n = head - 1; n > head - depth; n--) wanted.push(n);
  let cursor = 0;
  const worker = async () => {
    while (cursor < wanted.length) {
      const n = wanted[cursor++]!;
      const b = await fetchBlockByNumber(n);
      if (b) {
        insertBlock(b);
        for (const cb of listeners) cb(state);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  if (state.latest || state.dead) cb(state);
  return () => void listeners.delete(cb);
}

export function gasPctForSlot(slot: number): number {
  return gasBySlot.get(slot) ?? lastGasPct;
}

export async function poll(slot: number): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const b = await fetchLatestBlock();
    if (b) {
      fails = 0;
      state.latest = b;
      state.dead = false;
      lastGasPct = b.gasUsed / b.gasLimit;
      gasBySlot.set(slot, lastGasPct);
      for (const s of gasBySlot.keys()) if (s < slot - HISTORY_SLOTS) gasBySlot.delete(s);
      insertBlock(b);
    } else {
      fails += 1;
      if (fails >= 3) state.dead = true;
    }
    for (const cb of listeners) cb(state);
  } finally {
    inFlight = false;
  }
}
