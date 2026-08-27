import { CardTheme } from './share-card';

export interface StoryCardData {
  /** "Август" or "Неделя 24–30.08" — the period in the person's words. */
  period: string;
  /** Already formatted with the person's currency. */
  earned: string;
  /**
   * The line under the money — "19 смен · 153 ч". Built by the caller because
   * only it knows the language: counting words decline, and "ч" is not what
   * an hour is called in English.
   */
  meta: string;
  /** Up to three lines of bragging: "Лучший день — ₴2 615", … */
  lines: string[];
  /** 0..1 per weekday, Monday first — the little rhythm strip. */
  rhythm: number[];
  /** Shown small at the bottom; the app's own name. */
  brand: string;
}

const W = 1080;
const H = 1920;

/**
 * The month as a story: 9:16, big numbers, the week's rhythm as a row of
 * bars. Hospitality lives on Instagram, and a screenshot of a dashboard is
 * not something anybody posts — this is.
 */
export function drawStoryCard(data: StoryCardData, theme: CardTheme): Promise<Blob> {
  const canvas = document.createElement('canvas');

  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');

  if (ctx === null) return Promise.reject(new Error('canvas'));

  // A soft vertical wash of the accent over the surface: enough personality
  // to survive a feed, quiet enough to read.
  const wash = ctx.createLinearGradient(0, 0, W * 0.4, H);

  wash.addColorStop(0, mix(theme.accent, '#000000', 0.18));
  wash.addColorStop(0.5, theme.accent);
  wash.addColorStop(1, mix(theme.accent, theme.surface, 0.42));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // A ring of light behind the headline, the way a poster has one.
  const glow = ctx.createRadialGradient(W / 2, H * 0.34, 40, W / 2, H * 0.34, 620);

  glow.addColorStop(0, 'rgba(255,255,255,0.22)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '600 44px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.period.toUpperCase(), W / 2, 430);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 168px system-ui, -apple-system, sans-serif';
  fitText(ctx, data.earned, W - 140, 168, (size) => `800 ${size}px system-ui, -apple-system, sans-serif`);
  ctx.fillText(data.earned, W / 2, 620);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 48px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.meta, W / 2, 712);

  // The rhythm strip: seven bars, Monday first, tall where the money was.
  const barWidth = 96;
  const gap = 26;
  const stripWidth = 7 * barWidth + 6 * gap;
  const left = (W - stripWidth) / 2;
  const base = 1080;
  const maxHeight = 220;

  data.rhythm.slice(0, 7).forEach((value, index) => {
    const height = Math.max(10, value * maxHeight);
    const x = left + index * (barWidth + gap);

    ctx.fillStyle = value > 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.28)';
    roundRect(ctx, x, base - height, barWidth, height, 18);
    ctx.fill();
  });

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '600 30px system-ui, -apple-system, sans-serif';
  ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].forEach((name, index) => {
    ctx.fillText(name, left + index * (barWidth + gap) + barWidth / 2, base + 52);
  });

  // The brag lines, on their own cards so they read at thumbnail size.
  data.lines.slice(0, 3).forEach((line, index) => {
    const y = 1260 + index * 136;

    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(ctx, 90, y, W - 180, 104, 32);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 40px system-ui, -apple-system, sans-serif';
    fitText(ctx, line, W - 260, 40, (size) => `600 ${size}px system-ui, -apple-system, sans-serif`);
    ctx.fillText(line, W / 2, y + 68);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '700 40px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.brand, W / 2, H - 190);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob === null ? reject(new Error('png')) : resolve(blob)), 'image/png');
  });
}

/** Shrinks the font until the text fits; a clipped number is worse than a small one. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  font: (size: number) => string,
): void {
  let size = startSize;

  ctx.font = font(size);

  while (ctx.measureText(text).width > maxWidth && size > 18) {
    size -= 4;
    ctx.font = font(size);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** Blends two CSS colours; falls back to the first when either is exotic. */
function mix(a: string, b: string, amount: number): string {
  const parse = (colour: string) => {
    const hex = colour.trim();

    if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;

    return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  };

  const left = parse(a);
  const right = parse(b);

  if (left === null || right === null) return a;

  const blended = left.map((value, index) => Math.round(value * (1 - amount) + right[index] * amount));

  return `rgb(${blended.join(',')})`;
}
