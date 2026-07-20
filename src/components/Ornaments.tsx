import { dateStamp } from '../lib/format';

/**
 * The print grammar: corner brackets, registration marks, connector arcs
 * from the margins toward the disc, and a date stamp. Pure decoration,
 * aria-hidden, zero interaction.
 */

function Bracket({ pos }: { pos: string }) {
  const base = 'pointer-events-none fixed z-10 h-5 w-5 border-[color:var(--hairline)]';
  const map: Record<string, string> = {
    tl: 'left-3 top-3 border-l border-t',
    tr: 'right-3 top-3 border-r border-t',
    bl: 'left-3 bottom-3 border-l border-b',
    br: 'right-3 bottom-3 border-r border-b',
  };
  return <div className={`${base} ${map[pos]}`} aria-hidden="true" />;
}

/** print crop marks: two hairlines just outside each corner */
function CropMark({ pos }: { pos: string }) {
  const v: Record<string, string> = {
    tl: 'left-8 top-0 h-6 w-px', tr: 'right-8 top-0 h-6 w-px',
    bl: 'left-8 bottom-0 h-6 w-px', br: 'right-8 bottom-0 h-6 w-px',
  };
  const h: Record<string, string> = {
    tl: 'left-0 top-8 h-px w-6', tr: 'right-0 top-8 h-px w-6',
    bl: 'left-0 bottom-8 h-px w-6', br: 'right-0 bottom-8 h-px w-6',
  };
  return (
    <>
      <div className={`pointer-events-none fixed z-10 bg-[color:var(--hairline)] ${v[pos]}`} aria-hidden="true" />
      <div className={`pointer-events-none fixed z-10 bg-[color:var(--hairline)] ${h[pos]}`} aria-hidden="true" />
    </>
  );
}

function RegistrationMark({ className }: { className: string }) {
  return (
    <svg
      className={`pointer-events-none fixed z-10 ${className}`}
      width="26"
      height="26"
      viewBox="0 0 26 26"
      aria-hidden="true"
    >
      <circle cx="13" cy="13" r="8" fill="none" stroke="var(--hairline)" strokeWidth="1" />
      <line x1="13" y1="0" x2="13" y2="26" stroke="var(--hairline)" strokeWidth="1" />
      <line x1="0" y1="13" x2="26" y2="13" stroke="var(--hairline)" strokeWidth="1" />
    </svg>
  );
}

/** slot-phase-locked negative delay so the arc draw starts on the systole */
function slotPhaseDelay(): string {
  const tSlot = ((Date.now() / 1000 - 1_606_824_023) % 12 + 12) % 12;
  return `-${tSlot.toFixed(3)}s`;
}

export default function Ornaments({ pageIndex = '_00' }: { pageIndex?: string }) {
  const delay = slotPhaseDelay();
  const arc = { fill: 'none', strokeWidth: 0.75, pathLength: 1 } as const;
  return (
    <>
      <Bracket pos="tl" />
      <Bracket pos="tr" />
      <Bracket pos="bl" />
      <Bracket pos="br" />
      <CropMark pos="tl" />
      <CropMark pos="tr" />
      <CropMark pos="bl" />
      <CropMark pos="br" />
      <RegistrationMark className="right-10 top-16 hidden xl:block" />
      <RegistrationMark className="bottom-20 left-10 hidden xl:block" />

      {/* a 1px scanline sweeps the viewport top to bottom */}
      <div
        className="scanline pointer-events-none fixed inset-x-0 top-0 z-40 h-px bg-[color:var(--ink)] opacity-[0.07]"
        aria-hidden="true"
      />

      {/* connector arcs draw from the margins toward the disc on each systole */}
      <svg
        className="pointer-events-none fixed left-6 top-1/2 z-10 hidden -translate-y-1/2 xl:block"
        width="120"
        height="220"
        viewBox="0 0 120 220"
        aria-hidden="true"
      >
        <path {...arc} className="arc-draw" style={{ animationDelay: delay }} d="M6,10 C60,30 100,80 112,110" stroke="var(--ink)" opacity="0.4" />
        <circle cx="6" cy="10" r="2.5" fill="var(--ink)" />
        <path {...arc} className="arc-draw" style={{ animationDelay: delay }} d="M10,210 C55,195 95,150 112,118" stroke="var(--hairline)" />
        <circle cx="10" cy="210" r="2" fill="var(--ink)" opacity="0.6" />
      </svg>
      <svg
        className="pointer-events-none fixed right-6 top-1/2 z-10 hidden -translate-y-1/2 xl:block"
        width="120"
        height="220"
        viewBox="0 0 120 220"
        aria-hidden="true"
      >
        <path {...arc} className="arc-draw" style={{ animationDelay: delay }} d="M114,10 C60,30 20,80 8,110" stroke="var(--hairline)" />
        <circle cx="114" cy="10" r="2" fill="var(--ink)" opacity="0.6" />
        <path {...arc} className="arc-draw" style={{ animationDelay: delay }} d="M110,210 C65,195 25,150 8,118" stroke="var(--ink)" opacity="0.4" />
        <circle cx="110" cy="210" r="2.5" fill="var(--ink)" />
      </svg>

      {/* stamp + page index, like a printed sheet's footer marks */}
      <div
        className="micro pointer-events-none fixed bottom-44 left-1 z-10 hidden -rotate-90 items-center gap-3 lg:flex"
        style={{ transformOrigin: 'left bottom' }}
        aria-hidden="true"
      >
        <span>{dateStamp(new Date())}</span>
        <span className="font-bold">{pageIndex}</span>
      </div>
    </>
  );
}
