import { useCallback, useEffect, useRef, useState } from 'react';
import { renderShare, themeFromCss, type ShareData, type Template, type Size } from '../lib/share-render';
import SectionHeader from './SectionHeader';

/**
 * Share as PNG: the templates live in lib/share-render.ts (shared with the
 * build-time OG card generator); this modal drives them after
 * document.fonts.ready so Departure Mono actually lands in the bitmap.
 * Square (1080) and landscape (1200x630) renders; download, copy-text, and
 * the Web Share API where available.
 */

export type { ShareData };

const TEMPLATES: { id: Template; name: string }[] = [
  { id: 'disc', name: 'DISC' },
  { id: 'dial', name: 'DIAL' },
  { id: 'minimal', name: 'MINIMAL' },
];

interface Props {
  data: ShareData;
  onClose: () => void;
}

export default function ShareModal({ data, onClose }: Props) {
  const [template, setTemplate] = useState<Template>(data.motif ? 'motif' : 'disc');
  const [size, setSize] = useState<Size>('square');
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void document.fonts.ready.then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !canvasRef.current) return;
    renderShare(canvasRef.current, data, template, size, themeFromCss());
  }, [ready, data, template, size]);

  // Esc closes; stage keys stay quiet while open
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      } else if (['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) {
        e.stopImmediatePropagation();
        if (e.key === ' ') e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  const filename = `ethereum-beat-${data.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${size}.png`;

  const download = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = filename;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }, [filename]);

  const copyText = useCallback(() => {
    void navigator.clipboard.writeText(`${data.label}: ${data.value} · ${data.url}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }, [data]);

  const webShare = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        void navigator.share({ files: [file], text: `${data.label}: ${data.value}`, url: data.url });
      } else {
        void navigator.share?.({ text: `${data.label}: ${data.value}`, url: data.url });
      }
    });
  }, [data, filename]);

  const bracket = 'pointer-events-none absolute h-3 w-3 border-[color:var(--ink)]';
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[color:var(--paper)]/85 p-4" onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Share this number"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto border border-[color:var(--hairline)] bg-[color:var(--paper)] px-5 py-4 outline-none"
      >
        <span className={`${bracket} left-[-1px] top-[-1px] border-l border-t`} />
        <span className={`${bracket} right-[-1px] top-[-1px] border-r border-t`} />
        <span className={`${bracket} bottom-[-1px] left-[-1px] border-b border-l`} />
        <span className={`${bracket} bottom-[-1px] right-[-1px] border-b border-r`} />

        <SectionHeader index="↗" title={data.label} subtitle="share" accent className="mb-4" />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {data.motif && (
            <button onClick={() => setTemplate('motif')} className={`cmd-chip ${template === 'motif' ? 'cmd-active' : ''}`}>
              <span>MOTIF</span>
            </button>
          )}
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => setTemplate(t.id)} className={`cmd-chip ${template === t.id ? 'cmd-active' : ''}`}>
              <span>{t.name}</span>
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-[color:var(--hairline)]" />
          {(['square', 'wide'] as Size[]).map((s) => (
            <button key={s} onClick={() => setSize(s)} className={`cmd-chip ${size === s ? 'cmd-active' : ''}`}>
              <span>{s === 'square' ? '1080²' : '1200×630'}</span>
            </button>
          ))}
        </div>

        <canvas ref={canvasRef} className="block w-full border border-[color:var(--hairline)]" aria-label="Share image preview" />
        {!ready && <p className="micro py-4 text-center">LOADING FONTS…</p>}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button onClick={download} className="cmd-chip">
              <kbd>↓</kbd>
              <span>DOWNLOAD PNG</span>
            </button>
            <button onClick={copyText} className="cmd-chip">
              <span>{copied ? 'COPIED' : 'COPY TEXT'}</span>
            </button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button onClick={webShare} className="cmd-chip">
                <span>SHARE…</span>
              </button>
            )}
          </div>
          <button onClick={onClose} className="cmd-chip">
            <kbd>ESC</kbd>
            <span>CLOSE</span>
          </button>
        </div>
      </div>
    </div>
  );
}
