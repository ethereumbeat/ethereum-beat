import { useEffect, useMemo, useState } from 'react';
import { sharedEngine } from '../lib/beat';
import * as blockfeed from '../lib/blockfeed';
import { slotClock } from '../lib/clock';
import type { Snapshot } from '../lib/metrics';
import LiveTickers from './LiveTickers';

/**
 * The margin instrument frame — side tickers, top clock, bottom status —
 * rendered identically on every channel. Persisted through view
 * transitions, driven by the one shared engine; it is also the app's
 * single per-slot block poller (poll() is in-flight-guarded, so channels
 * asking again are no-ops).
 */
export default function MarginFrame() {
  const reducedMotion = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const engine = useMemo(() => sharedEngine(reducedMotion), [reducedMotion]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    fetch('/api/snapshot')
      .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : Promise.reject(new Error(String(r.status)))))
      .then(setSnapshot)
      .catch(() => setSnapshot(null));
    void blockfeed.poll(slotClock(Date.now()).slot);
    return engine.onBeat((slot) => void blockfeed.poll(slot));
  }, [engine]);

  return <LiveTickers engine={engine} snapshot={snapshot} reducedMotion={reducedMotion} />;
}
