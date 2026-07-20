/** 30-point mini path for KPI cards. No axes, one hairline, one red dot. */

interface Props {
  values: number[];
  width?: number;
  height?: number;
}

export function sparkPath(values: number[], width: number, height: number, pad = 3): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (width - pad * 2);
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join('');
}

export default function Sparkline({ values, width = 120, height = 28 }: Props) {
  if (values.length < 2) return null;
  const d = sparkPath(values, width, height);
  const last = d.slice(d.lastIndexOf('L') + 1).split(',');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block">
      <path d={d} fill="none" stroke="var(--ink-ghost)" strokeWidth="1.2" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill="var(--ink)" />
    </svg>
  );
}
