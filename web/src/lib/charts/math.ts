/** Shared geometry for the SVG column charts. */

export const CHART_W = 640;
export const CHART_H = 190;
/* The left gutter holds the money labels of the y axis. Compact notation keeps
   them short, but a currency mark still follows the number, so the gutter is
   wider than the bare digits need. */
export const PAD = { top: 12, right: 6, bottom: 22, left: 60 };
export const PLOT_W = CHART_W - PAD.left - PAD.right;
export const PLOT_H = CHART_H - PAD.top - PAD.bottom;

export interface Column {
  x: number;
  width: number;
  /** Solid part: money already earned. */
  earnedY: number;
  earnedHeight: number;
  /** Wash above it: still planned. */
  plannedY: number;
  plannedHeight: number;
  label: string;
  centre: number;
  earned: number;
  planned: number;
  hours: number;
}

export interface Tick {
  y: number;
  value: number;
}

export interface ColumnDatum {
  label: string;
  earned: number;
  planned: number;
  hours: number;
}

/**
 * Solid earned from the baseline, planned wash above with a 2px surface gap.
 *
 * `maxWidth` caps the thickness. The default suits a month of days; a chart of
 * six months over the same plot leaves slots four times as wide, and a 24px
 * column stranded in the middle of one reads as a missing bar rather than a
 * deliberately thin mark.
 */
export function buildColumns(data: ColumnDatum[], maxWidth = 30): Column[] {
  if (data.length === 0) return [];

  const max = niceCeiling(
    Math.max(1, ...data.map((entry) => entry.earned + entry.planned)),
  );
  const slot = PLOT_W / data.length;
  // Capped thickness with the slot's leftover as air, per the mark spec.
  const width = Math.min(maxWidth, Math.max(3, slot - 2));
  const baseline = PAD.top + PLOT_H;

  return data.map((entry, index) => {
    const x = PAD.left + slot * index + (slot - width) / 2;
    const earnedHeight = (entry.earned / max) * PLOT_H;
    const plannedHeight = (entry.planned / max) * PLOT_H;

    return {
      x,
      width,
      earnedY: baseline - earnedHeight,
      earnedHeight,
      plannedY:
        baseline - earnedHeight - (plannedHeight > 0 ? 2 : 0) - plannedHeight,
      plannedHeight,
      label: entry.label,
      centre: x + width / 2,
      earned: entry.earned,
      planned: entry.planned,
      hours: entry.hours,
    };
  });
}

export function buildTicks(data: ColumnDatum[]): Tick[] {
  const max = niceCeiling(
    Math.max(1, ...data.map((entry) => entry.earned + entry.planned)),
  );

  return [0, max / 2, max].map((value) => ({
    value,
    y: PAD.top + PLOT_H - (value / max) * PLOT_H,
  }));
}

/**
 * The same rounding, downwards, for a scale that has to reach below zero.
 *
 * A month can close in the red — deductions outrunning a short shift is an
 * ordinary week in this trade — and a floor pinned at zero drew that month
 * twelve thousand units below its own canvas while labelling the axis «₴0 ·
 * ₴0.5 · ₴1». Money that went the wrong way still has to be drawable.
 */
export function niceFloor(value: number): number {
  if (value >= 0) return 0;

  return -niceCeiling(-value);
}

/** Rounds up to 1, 2 or 5 times a power of ten, so axis values read clean. */
export function niceCeiling(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));

  for (const step of [1, 2, 5, 10]) {
    if (value <= step * power) return step * power;
  }

  return 10 * power;
}

/**
 * A monotone curve through the points: smooth to read, honest to the data —
 * cubic segments whose slopes never overshoot a value they pass through
 * (Fritsch–Carlson), so the curve cannot invent a peak the month never had.
 */
export function smoothPath(list: { x: number; y: number }[]): string {
  if (list.length < 2) return '';
  if (list.length === 2) return `M ${list[0].x} ${list[0].y} L ${list[1].x} ${list[1].y}`;

  const n = list.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const slope: number[] = [];

  for (let i = 0; i < n - 1; i += 1) {
    dx.push(list[i + 1].x - list[i].x);
    dy.push(list[i + 1].y - list[i].y);
    slope.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }

  const tangent: number[] = [slope[0]];

  for (let i = 1; i < n - 1; i += 1) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);

  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }

    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const size = Math.hypot(a, b);

    if (size > 3) {
      tangent[i] = (3 * a * slope[i]) / size;
      tangent[i + 1] = (3 * b * slope[i]) / size;
    }
  }

  let d = `M ${list[0].x} ${list[0].y}`;

  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3;

    d += ` C ${list[i].x + third} ${list[i].y + tangent[i] * third}, ${list[i + 1].x - third} ${
      list[i + 1].y - tangent[i + 1] * third
    }, ${list[i + 1].x} ${list[i + 1].y}`;
  }

  return d;
}
