import { useEffect, useRef, useState } from 'react';
import SectionHeader from './SectionHeader';

/**
 * The [?] chip: every module's plain-language text lives behind one of
 * these instead of on the screen. Esc or click-outside closes; stage keys
 * are swallowed while open, like every modal in the system.
 */

interface Props {
  title: string;
  text: string | string[];
}

export default function ExplainChip({ title, text }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const paragraphs = Array.isArray(text) ? text : [text];

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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key.toLowerCase() === 'e' && setOpen(true)}
        className="cmd-chip !px-1.5"
        aria-label={`Explain: ${title}`}
      >
        <kbd>?</kbd>
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
            aria-label={title}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="brackets brackets-ink relative max-h-[85dvh] w-full max-w-md overflow-y-auto border border-[color:var(--hairline)] bg-[color:var(--paper)] px-6 py-5 outline-none"
          >
            <SectionHeader index="?" title={title} subtitle="explain" accent className="mb-4" />
            {paragraphs.map((p, i) => (
              <p key={i} className="mb-3 text-sm leading-relaxed text-[color:var(--ink-soft)] last:mb-0">
                {p}
              </p>
            ))}
            <div className="mt-4 flex justify-end">
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
