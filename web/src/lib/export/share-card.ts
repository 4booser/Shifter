import { DaysResponse } from '../calendar/models';

export interface CardTheme {
  surface: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  border: string;
}

export interface CardData {
  title: string;
  period: string;
  summary: DaysResponse;
  /** Money already formatted with the user's currency. */
  format: (value: number) => string;
  labels: {
    earned: string;
    net: string;
    hours: string;
    days: string;
    perHour: string;
    byDay: string;
    shifts: string;
    salary: string;
    sales: string;
    tips: string;
    overtime: string;
    planned: string;
    places: string;
    worked: string;
  };
}

const W = 1200;
const H = 630;
const PAD = 64;

/** Where the composition's rows begin. Named so the layout reads top to bottom. */
const HEADER_Y = 76;
const HERO_Y = 208;
const TILES_Y = 268;
const SPLIT_Y = 396;
const CHART_Y = 470;
const CHART_H = 96;

/**
 * One slice of where the money came from. Kept out of the theme because these
 * have to stay distinguishable from each other rather than match the accent.
 */
const SPLIT_COLOURS = ['#4F46E5', '#0D9488', '#F59E0B', '#EC4899'];

interface Slice {
  label: string;
  value: number;
  colour: string;
}

/**
 * Draws the period's numbers onto a canvas and hands back a PNG. Painted
 * directly rather than screenshotting the DOM: an SVG lifted out of the page
 * loses every CSS variable it was coloured with, and a canvas gives a fixed,
 * predictable frame to share.
 *
 * The card carries what someone actually wants to show or check later — what
 * came in, what is left after tax, where it came from, and which days it was
 * earned on — rather than only the one headline figure it used to.
 */
export function drawShareCard(data: CardData, theme: CardTheme): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const scale = 2; // Retina-sharp without depending on the current screen.

  canvas.width = W * scale;
  canvas.height = H * scale;

  const ctx = canvas.getContext('2d');

  if (ctx === null) return Promise.reject(new Error('Canvas is unavailable.'));

  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  const font = (size: number, weight = '400') =>
    `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  const text = (value: string, x: number, y: number, size: number, weight: string, fill: string) => {
    ctx.fillStyle = fill;
    ctx.font = font(size, weight);
    ctx.fillText(value, x, y);
  };

  const summary = data.summary;

  // ==== Frame ====

  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, W, H);

  // A wash behind the hero rather than a flat field: it separates the headline
  // from the detail below without drawing a line across the card.
  const wash = ctx.createLinearGradient(0, 0, W, HERO_Y + 60);
  wash.addColorStop(0, withAlpha(theme.accent, 0.1));
  wash.addColorStop(1, withAlpha(theme.accent, 0));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, HERO_Y + 60);

  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, W, 6);

  // ==== Header ====

  text(data.title, PAD, HEADER_Y, 22, '650', theme.muted);
  text(data.period, PAD, HEADER_Y + 30, 18, '400', theme.faint);

  ctx.textAlign = 'right';
  text('Shifter', W - PAD, HEADER_Y, 18, '700', theme.faint);
  ctx.textAlign = 'left';

  // ==== Hero ====

  text(data.format(summary.total_earned), PAD, HERO_Y, 84, '700', theme.accent);
  text(data.labels.earned, PAD, HERO_Y + 30, 17, '400', theme.faint);

  // Net sits beside the headline, not under it: what reaches a pocket is the
  // second question everyone asks and it should not need scrolling for.
  if (summary.net_earned !== summary.total_earned) {
    const heroWidth = measure(ctx, data.format(summary.total_earned), font(84, '700'));

    text(
      data.format(summary.net_earned),
      PAD + heroWidth + 32,
      HERO_Y,
      34,
      '650',
      theme.text,
    );
    text(data.labels.net, PAD + heroWidth + 32, HERO_Y + 30, 15, '400', theme.faint);
  }

  // ==== Tiles ====

  // Under a whole hour there is no rate to put on a card somebody posts.
  const perHour = summary.hours < 1 ? 0 : summary.shifts_earned / summary.hours;

  const tiles: [string, string][] = [
    [`${round(summary.hours)}`, data.labels.hours],
    [`${summary.days_worked}`, data.labels.days],
    [data.format(perHour), data.labels.perHour],
    [data.format(summary.tips_earned), data.labels.tips],
  ];

  if (summary.planned_earned > 0) {
    tiles.push([data.format(summary.planned_earned), data.labels.planned]);
  } else if (summary.overtime_hours > 0) {
    tiles.push([`${round(summary.overtime_hours)}`, data.labels.overtime]);
  }

  const tileWidth = (W - PAD * 2 - 16 * (tiles.length - 1)) / tiles.length;

  tiles.forEach(([value, label], index) => {
    const x = PAD + index * (tileWidth + 16);

    roundRect(ctx, x, TILES_Y, tileWidth, 88, 14);
    ctx.fillStyle = withAlpha(theme.border, 0.5);
    ctx.fill();

    text(value, x + 18, TILES_Y + 46, 32, '650', theme.text);
    text(label, x + 18, TILES_Y + 70, 15, '400', theme.faint);
  });

  // ==== Where it came from ====

  const slices: Slice[] = [
    { label: data.labels.shifts, value: summary.shifts_earned, colour: SPLIT_COLOURS[0] },
    { label: data.labels.salary, value: summary.period_earned, colour: SPLIT_COLOURS[1] },
    { label: data.labels.sales, value: summary.sales_earned, colour: SPLIT_COLOURS[2] },
    { label: data.labels.tips, value: summary.tips_earned, colour: SPLIT_COLOURS[3] },
  ].filter((slice) => slice.value > 0);

  const sliceTotal = slices.reduce((total, slice) => total + slice.value, 0);

  if (sliceTotal > 0) {
    const barWidth = W - PAD * 2;
    let x = PAD;

    slices.forEach((slice, index) => {
      // The last slice takes the remainder, so rounding never leaves a sliver
      // of background showing at the right-hand end.
      const width =
        index === slices.length - 1
          ? PAD + barWidth - x
          : (slice.value / sliceTotal) * barWidth;

      ctx.fillStyle = slice.colour;
      ctx.fillRect(x, SPLIT_Y, Math.max(0, width), 12);

      x += width;
    });

    // Rounded ends, drawn by clipping the bar rather than by rounding each
    // segment: the joins between segments must stay square.
    roundRect(ctx, PAD, SPLIT_Y, barWidth, 12, 6);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    let legendX = PAD;

    slices.forEach((slice) => {
      ctx.fillStyle = slice.colour;
      ctx.beginPath();
      ctx.arc(legendX + 5, SPLIT_Y + 38, 5, 0, Math.PI * 2);
      ctx.fill();

      const label = `${slice.label} ${data.format(slice.value)}`;

      text(label, legendX + 18, SPLIT_Y + 43, 15, '500', theme.muted);

      legendX += 18 + measure(ctx, label, font(15, '500')) + 28;
    });
  }

  // ==== By day ====

  const days = summary.days;

  text(data.labels.byDay, PAD, CHART_Y - 12, 15, '600', theme.faint);

  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, CHART_Y + CHART_H + 0.5);
  ctx.lineTo(W - PAD, CHART_Y + CHART_H + 0.5);
  ctx.stroke();

  if (days.length > 0) {
    const chartWidth = W - PAD * 2;
    const peak = Math.max(1, ...days.map((day) => Math.max(day.earned, day.planned)));
    const slot = chartWidth / days.length;
    const width = Math.max(2, Math.min(24, slot - 3));

    days.forEach((day, index) => {
      const value = Math.max(day.earned, day.planned);
      const height = (value / peak) * CHART_H;

      if (height < 1) return;

      const x = PAD + slot * index + (slot - width) / 2;
      const y = CHART_Y + CHART_H - height;

      // Planned days are drawn hollow, worked ones solid — the same distinction
      // the calendar makes, so the card cannot claim money that has not arrived.
      const isPlanned = day.earned === 0 && day.planned > 0;

      roundRect(ctx, x, y, width, height, Math.min(4, width / 2, height));

      if (isPlanned) {
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = theme.accent;
        ctx.fill();
      }
    });
  }

  // ==== Places ====

  const places = summary.by_location.filter((place) => place.earned > 0).slice(0, 4);

  if (places.length > 0) {
    ctx.textAlign = 'right';

    let chipX = W - PAD;

    for (const place of [...places].reverse()) {
      const label = `${place.name} · ${data.format(place.earned)}`;
      const width = measure(ctx, label, font(15, '500')) + 34;

      roundRect(ctx, chipX - width, H - 58, width, 30, 15);
      ctx.fillStyle = withAlpha(place.colour, 0.14);
      ctx.fill();

      ctx.fillStyle = place.colour;
      ctx.beginPath();
      ctx.arc(chipX - width + 15, H - 43, 5, 0, Math.PI * 2);
      ctx.fill();

      text(label, chipX - 12, H - 38, 15, '500', theme.text);

      chipX -= width + 10;
    }

    ctx.textAlign = 'left';
  }

  text(
    `${data.labels.places}: ${summary.by_location.length}`,
    PAD,
    H - 38,
    15,
    '500',
    theme.faint,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not render the card.'))),
      'image/png',
    );
  });
}

const round = (value: number): string =>
  Number.isInteger(value) ? `${value}` : value.toFixed(1);

function measure(ctx: CanvasRenderingContext2D, value: string, font: string): number {
  const previous = ctx.font;

  ctx.font = font;

  const width = ctx.measureText(value).width;

  ctx.font = previous;

  return width;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * The theme hands back whatever CSS holds — a hex, an rgb(), a colour name.
 * Canvas has no opacity on a fill style, so the alpha goes through a colour
 * the browser parses for us rather than through string surgery on the input.
 */
function withAlpha(colour: string, alpha: number): string {
  const probe = document.createElement('canvas').getContext('2d');

  if (probe === null) return colour;

  probe.fillStyle = colour;

  const parsed = probe.fillStyle;

  if (parsed.startsWith('#') && parsed.length === 7) {
    const r = parseInt(parsed.slice(1, 3), 16);
    const g = parseInt(parsed.slice(3, 5), 16);
    const b = parseInt(parsed.slice(5, 7), 16);

    return `rgb(${r} ${g} ${b} / ${alpha * 100}%)`;
  }

  return parsed;
}

/** Reads the live theme off the document so the card matches what is on screen. */
export function currentCardTheme(): CardTheme {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    surface: read('--surface', '#ffffff'),
    text: read('--text', '#101828'),
    muted: read('--text-muted', '#5b6675'),
    faint: read('--text-faint', '#8d97a5'),
    accent: read('--accent', '#4F46E5'),
    border: read('--border', '#e6eaef'),
  };
}
