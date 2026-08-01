import { lazy, Suspense, useEffect, useState } from 'react';
import type { ShareData } from './ShareModal';
const ShareModal = lazy(() => import('./ShareModal'));

/** small share affordance: chip + modal; hotkey X opens it anywhere */
export default function ShareButton({ data, compact = false, hotkey = 'x' }: { data: ShareData; compact?: boolean; hotkey?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === hotkey) setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey]);
  return (
    <>
      <button onClick={() => setOpen(true)} className="cmd-chip" aria-label={`Share ${data.label}`}>
        <kbd className="share-key">⇪</kbd>
        {!compact && <span>SHARE</span>}
      </button>
      {open && (
        <Suspense fallback={null}>
          <ShareModal data={data} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
