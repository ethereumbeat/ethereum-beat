/**
 * Pass 14: the one shared section header. A left-aligned two-part lockup —
 * a large grotesk index numeral (the anchor) beside a two-line lowercase
 * grotesk block (name / descriptor). Replaces every tracked-out uppercase
 * "_NN NAME" eyebrow across the site. Works server-rendered in Astro pages
 * and inside React islands alike.
 *
 * Type rule (pass 14): pixel (Departure) is for live data only; every
 * human label and header speaks in lowercase grotesk.
 */
interface Props {
  /** the anchor glyph: a number ("02"), a CROPS letter ("CR"), or a mark ("?") */
  index: string;
  /** line 1 — section / category name (rendered lowercase) */
  title: string;
  /** line 2 — short descriptor (rendered lowercase) */
  subtitle?: string;
  /** colour the index red */
  accent?: boolean;
  /** smaller variant for the docked channel identity */
  size?: 'sm' | 'md';
  className?: string;
}

export default function SectionHeader({ index, title, subtitle, accent, size = 'md', className = '' }: Props) {
  return (
    <div className={`section-header section-header--${size} ${className}`}>
      <span className={`section-index${accent ? ' section-index--accent' : ''}`}>{index}</span>
      <span className="section-header-text">
        <span className="section-title">{title}</span>
        {subtitle && <span className="section-sub">{subtitle}</span>}
      </span>
    </div>
  );
}
