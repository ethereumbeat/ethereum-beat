/**
 * In-memory cache of featured metrics' monthly series, normalised for the
 * background line. Each series is fetched once and resampled to a fixed
 * number of points so any two curves can be interpolated point-for-point
 * during the morph.
 */

export const RESAMPLE_POINTS = 240;

const cache = new Map<string, number[]>(); // metric_key -> normalised 0..1 ys
const pending = new Map<string, Promise<number[] | null>>();

function normalise(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  // resample to RESAMPLE_POINTS with linear interpolation
  const out: number[] = [];
  for (let i = 0; i < RESAMPLE_POINTS; i++) {
    const pos = (i / (RESAMPLE_POINTS - 1)) * (values.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(values.length - 1, lo + 1);
    const frac = pos - lo;
    const v = values[lo]! * (1 - frac) + values[hi]! * frac;
    out.push((v - min) / span);
  }
  return out;
}

export function getCached(key: string): number[] | null {
  return cache.get(key) ?? null;
}

export async function fetchSeries(key: string): Promise<number[] | null> {
  const hit = cache.get(key);
  if (hit) return hit;
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const res = await fetch(`/api/metric/${key}?range=m`);
      if (!res.ok) return null;
      const data = (await res.json()) as { points: { value: number }[] };
      const values = data.points.map((pt) => pt.value);
      if (values.length < 2) return null; // flat placeholder handled by caller
      const ys = normalise(values);
      cache.set(key, ys);
      return ys;
    } catch {
      return null;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, p);
  return p;
}

/** warm the cache for the whole rotation, one request at a time */
export async function prefetch(keys: string[]): Promise<void> {
  for (const key of keys) await fetchSeries(key);
}
