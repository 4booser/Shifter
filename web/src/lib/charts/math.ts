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

/** Rounds up to 1, 2 or 5 times a power of ten, so axis values read clean. */
export function niceCeiling(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));

  for (const step of [1, 2, 5, 10]) {
    if (value <= step * power) return step * power;
  }

  return 10 * power;
}
