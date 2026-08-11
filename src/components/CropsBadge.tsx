import { useEffect, useRef, useState } from 'react';
import SectionHeader from './SectionHeader';

/**
 * The CROPS badge (pass 13c): CROPS is FOUR properties — CR · O · P · S —
 * with Censorship Resistance owning the CR pair. The [CR] badge is one
 * two-letter unit (one box, never split). Heartbeat is explicitly NOT a
 * CROPS property, so heartbeat metrics carry no badge.
 * Clicking a badge opens a values modal — which property this number
 * demonstrates and why it matters, in two plain sentences (paraphrased from
 * the Ethereum protocol mandate).
 */

export interface CropsInfo {
  letter: string;
  property: string;
  why: string;
}

export const CROPS: Record<string, CropsInfo> = {
  'censorship-resistance': {
    letter: 'CR',
    property: 'Censorship resistance',
    why: 'No actor can selectively exclude a valid transaction or break functionality — no company, bank or government. This number measures how expensive and impractical censorship would be.',
  },
  openness: {
    letter: 'O',
    property: 'Open source & free',
    why: 'No privileged code and no hidden specifications: all of Ethereum is public, auditable and free to run, fork and build on without permission. This number measures that freedom exercised.',
  },
  privacy: {
    letter: 'P',
    property: 'Privacy',
    why: 'User data is not exposed beyond necessity or against a person’s interests. Assets and identity are held by cryptography, not by an account someone else controls.',
  },
  security: {
    letter: 'S',
    property: 'Security',
    why: 'Things do exactly what they claim — no more, no less. Attacking the chain means burning your own stake, so history is locked by economics.',
  },
};

export default function CropsBadge({ category, context }: { category: string; context?: string }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const info = CROPS[category];

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setOpen(false);
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
        e.stopImmediatePropagation();
        if (e.key === ' ') e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open]);

  if (!info) return null;

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="pointer-events-auto inline-flex h-4 min-w-4 cursor-pointer items-center justify-center whitespace-nowrap border border-[color:var(--line-data)] px-[3px] font-mono text-[10px] font-bold leading-none tracking-tight text-[color:var(--ink)] hover:border-[color:var(--ink)] hover:text-[color:var(--ink)]"
        aria-label={`CROPS property: ${info.property}`}
        title={info.property}
      >
        {info.letter}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[color:var(--paper)]/85 p-4"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={info.property}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="brackets brackets-ink relative w-full max-w-md border border-[color:var(--hairline)] bg-[color:var(--paper)] px-6 py-5 outline-none"
          >
            <SectionHeader index={info.letter} title={info.property} subtitle="values" accent className="mb-3" />
            {context && <p className="micro mb-2 text-[color:var(--ink-faint)]">{context.toUpperCase()}</p>}
            <p className="text-sm leading-relaxed text-[color:var(--ink-soft)]">{info.why}</p>
            <div className="mt-4 flex items-center justify-between">
              <a href="/about#crops" className="micro underline hover:text-[color:var(--ink)]">
                ALL FOUR PROPERTIES → ABOUT
              </a>
              <button onClick={() => setOpen(false)} className="cmd-chip">
                <kbd>ESC</kbd>
                <span>CLOSE</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
