/**
 * Tier 1 liveness: pure clock maths from the Beacon Chain genesis timestamp.
 * Zero network. Everything here is computable every frame.
 */

export const BEACON_GENESIS = 1_606_824_023; // unix seconds, 1 Dec 2020 12:00:23 UTC
export const SLOT_SECONDS = 12;
export const SLOTS_PER_EPOCH = 32;

/** Ethereum execution genesis: 30 July 2015, 15:26:13 UTC. */
export const CHAIN_GENESIS_MS = Date.UTC(2015, 6, 30, 15, 26, 13);

export interface SlotClock {
  /** seconds since beacon genesis */
  t: number;
  slot: number;
  epoch: number;
  /** 0..12, seconds into the current slot */
  secondsIntoSlot: number;
  slotInEpoch: number;
  slotsUntilEpoch: number;
  /** rough seconds until current head can finalise: rest of epoch + 2 epochs */
  secondsToFinality: number;
}

export function slotClock(nowMs: number): SlotClock {
  const t = nowMs / 1000 - BEACON_GENESIS;
  const slot = Math.floor(t / SLOT_SECONDS);
  const secondsIntoSlot = t - slot * SLOT_SECONDS;
  const epoch = Math.floor(slot / SLOTS_PER_EPOCH);
  const slotInEpoch = slot % SLOTS_PER_EPOCH;
  const slotsUntilEpoch = SLOTS_PER_EPOCH - slotInEpoch;
  const secondsToFinality =
    slotsUntilEpoch * SLOT_SECONDS - secondsIntoSlot + 2 * SLOTS_PER_EPOCH * SLOT_SECONDS;
  return { t, slot, epoch, secondsIntoSlot, slotInEpoch, slotsUntilEpoch, secondsToFinality };
}

export interface Uptime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function uptimeSinceGenesis(nowMs: number): Uptime {
  let s = Math.floor((nowMs - CHAIN_GENESIS_MS) / 1000);
  const days = Math.floor(s / 86_400);
  s -= days * 86_400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  return { days, hours, minutes, seconds: s - minutes * 60 };
}
