/**
 * The share-template renderer: three templates in the site's own visual
 * language, drawn on canvas. Framework-free so it serves two masters:
 * the in-page share modal (ShareModal.tsx) and the build-time OG card
 * generator (scripts/build-og.mjs) — spec §18.5 requires the social
 * cards to reuse this exact renderer.
 */

export interface ShareData {
  value: string;
  label: string;
  index: string; // category index like _04, or CH_03 for channel cards
  url: string;
  /** channel digit for the motif template (non-BEAT pages) */
  motif?: string;
  /** replaces the UTC timestamp line (build-time cards would go stale) */
  stamp?: string;
  /** the numeral's caption line, matte red under the value (dp10c) */
  caption?: string;
}

export type Template = 'disc' | 'dial' | 'minimal' | 'motif';
export type Size = 'square' | 'wide';

export interface ShareTheme {
  paper: string;
  ink: string;
  accent: string;
}

/** the live site's current theme, read from the CSS variables */
export function themeFromCss(): ShareTheme {
  const styles = getComputedStyle(document.documentElement);
  return {
    paper: styles.getPropertyValue('--paper').trim() || '#ededeb',
    ink: styles.getPropertyValue('--ink').trim() || '#141412',
    accent: styles.getPropertyValue('--accent').trim() || '#e10600',
  };
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()} - ${p(d.getUTCMonth() + 1)} - ${p(d.getUTCDate())} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function drawDither(ctx: CanvasRenderingContext2D, w: number, h: number, ink: string) {
  ctx.save();
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.05;
  const cell = 6;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      // denser near the edges, like the site
      const ex = Math.min(x, w - x) / (w / 2);
      const ey = Math.min(y, h - y) / (h / 2);
      const edge = 1 - Math.min(ex, ey);
      if ((x / cell + (y / cell) * 2) % 4 < 1.2 && edge > 0.35) ctx.fillRect(x, y, 2.5, 2.5);
    }
  }
  ctx.restore();
}

export function renderShare(
  canvas: HTMLCanvasElement,
  data: ShareData,
  template: Template,
  size: Size,
  theme?: ShareTheme,
): void {
  const W = size === 'square' ? 1080 : 1200;
  const H = size === 'square' ? 1080 : 630;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const { paper, ink, accent } = theme ?? themeFromCss();
  const mono = (px: number) => `${px}px "Martian Mono Var", monospace`;
  const display = (px: number) => `${px}px "Departure Mono", monospace`;

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  drawDither(ctx, W, H, ink);

  const cx = W / 2;
  const cy = size === 'square' ? H * 0.44 : H * 0.46;

  if (template === 'motif' && data.motif) {
    // the channel numeral as architecture, like the site itself
    ctx.save();
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.07;
    ctx.font = display(H * 0.62);
    ctx.textAlign = 'right';
    ctx.fillText(data.motif, W - 30, H - 40);
    ctx.restore();
  }

  if (template !== 'minimal' && template !== 'motif') {
    // the disc
    const r = size === 'square' ? 380 : 240;
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (template === 'dial') {
    // 32 epoch ticks + a red current tick
    const r = size === 'square' ? 380 : 240;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2 - Math.PI / 2;
      const cur = i === 21;
      ctx.strokeStyle = cur ? accent : ink;
      ctx.globalAlpha = cur ? 1 : i < 21 ? 0.7 : 0.15;
      ctx.lineWidth = cur ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18));
      ctx.lineTo(cx + Math.cos(a) * (r - (cur ? 40 : 32)), cy + Math.sin(a) * (r - (cur ? 40 : 32)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // category index + label
  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  ctx.font = mono(size === 'square' ? 26 : 20);
  ctx.fillText(`${data.index}  ${data.label.toUpperCase()}`, cx, cy - (size === 'square' ? 130 : 90));

  // the number, terminal-sized
  ctx.fillStyle = ink;
  let px = size === 'square' ? 150 : 120;
  ctx.font = display(px);
  while (ctx.measureText(data.value).width > W * 0.86 && px > 40) {
    px -= 6;
    ctx.font = display(px);
  }
  ctx.fillText(data.value, cx, cy + px * 0.36);

  // caption: matte red, under the value — the same line the disc shows
  if (data.caption) {
    ctx.fillStyle = accent;
    ctx.font = mono(size === 'square' ? 24 : 20);
    ctx.fillText(data.caption, cx, cy + px * 0.36 + (size === 'square' ? 70 : 54));
  }

  // stamps
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.6;
  ctx.font = mono(size === 'square' ? 22 : 18);
  ctx.fillText(data.stamp ?? stamp(), cx, H - (size === 'square' ? 96 : 64));
  ctx.globalAlpha = 1;
  ctx.font = mono(size === 'square' ? 24 : 20);
  const urlText = data.url.replace(/^https?:\/\//, '').toUpperCase();
  const urlY = H - (size === 'square' ? 46 : 24);
  const urlW = ctx.measureText(urlText).width;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx - urlW / 2 - 16, urlY - 7, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.fillText(urlText, cx, urlY);

  // corner crop marks
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 2;
  const m = 26;
  for (const [x, y, dx, dy] of [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x + dx * 24, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * 24);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
