import { DaysResponse } from '../calendar/calendar.models';

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
    hours: string;
    days: string;
    perHour: string;
    byDay: string;
  };
}

const W = 1200;
const H = 630;

/**
 * Draws the period's numbers onto a canvas and hands back a PNG. Painted
 * directly rather than screenshotting the DOM: an SVG lifted out of the page
 * loses every CSS variable it was coloured with, and a canvas gives a fixed,
 * predictable frame to share.
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

  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, W, H);

  // Accent band along the top edge.
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, W, 6);

  ctx.fillStyle = theme.muted;
  ctx.font = font(20, '600');
  ctx.fillText(data.title, 64, 84);

  ctx.fillStyle = theme.faint;
  ctx.font = font(18);
  ctx.fillText(data.period, 64, 114);

  // The one number the card exists for.
  ctx.fillStyle = theme.accent;
  ctx.font = font(88, '700');
  ctx.fillText(data.format(data.summary.total_earned), 64, 218);

  ctx.fillStyle = theme.faint;
  ctx.font = font(18);
  ctx.fillText(data.labels.earned, 64, 250);

  const perHour =
    data.summary.hours === 0 ? 0 : data.summary.shifts_earned / data.summary.hours;

  const stats: [string, string][] = [
    [`${data.summary.hours}`, data.labels.hours],
    [`${data.summary.days_worked}`, data.labels.days],
    [data.format(perHour), data.labels.perHour],
  ];

  stats.forEach(([value, label], index) => {
    const x = 64 + index * 240;

    ctx.fillStyle = theme.text;
    ctx.font = font(38, '650');
    ctx.fillText(value, x, 330);

    ctx.fillStyle = theme.faint;
    ctx.font = font(16);
    ctx.fillText(label, x, 356);
  });

  // A small column chart of the period's days, same marks as the app.
  const days = data.summary.days;
  const chartTop = 400;
  const chartHeight = 150;
  const chartLeft = 64;
  const chartWidth = W - 128;

  ctx.fillStyle = theme.faint;
  ctx.font = font(16);
  ctx.fillText(data.labels.byDay, chartLeft, chartTop - 14);

  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(chartLeft, chartTop + chartHeight + 0.5);
  ctx.lineTo(chartLeft + chartWidth, chartTop + chartHeight + 0.5);
  ctx.stroke();

  if (days.length > 0) {
    const peak = Math.max(1, ...days.map((day) => day.earned));
    const slot = chartWidth / days.length;
    const width = Math.max(2, Math.min(24, slot - 3));

    ctx.fillStyle = theme.accent;

    days.forEach((day, index) => {
      const height = (day.earned / peak) * chartHeight;

      if (height < 1) return;

      const x = chartLeft + slot * index + (slot - width) / 2;
      const y = chartTop + chartHeight - height;
      const r = Math.min(4, width / 2, height);

      // Rounded at the data end, square at the baseline.
      ctx.beginPath();
      ctx.moveTo(x, y + height);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height);
      ctx.closePath();
      ctx.fill();
    });
  }

  ctx.fillStyle = theme.faint;
  ctx.font = font(15, '600');
  ctx.fillText('Shifter', chartLeft, H - 34);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not render the card.'))),
      'image/png',
    );
  });
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
    accent: read('--accent', '#1f3a5f'),
    border: read('--border', '#e6eaef'),
  };
}
