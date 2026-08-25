import { CalendarDayData, DaysResponse } from '../calendar/models';
import { shiftDays } from '../calendar/calendar-date';

/**
 * The arithmetic behind the report visualisations, kept pure: a waterfall
 * that must sum exactly to what the server said, and a punchcard of when
 * work actually happens. Pixels are the components' problem.
 */

export interface WaterfallStep {
  key: string;
  value: number;
  kind: 'plus' | 'minus' | 'total';
  /** Where the bar starts, running from the left. */
  from: number;
  to: number;
}

/**
 * How the period's money assembled itself: each source stacks up, each
 * deduction steps down, with a landing at the gross and at the net. Zero
 * components stay out — a five-step story beats nine columns of nothing.
 */
export function waterfall(summary: DaysResponse): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let running = 0;

  const push = (key: string, value: number, kind: WaterfallStep['kind']) => {
    if (kind === 'total') {
      steps.push({ key, value, kind, from: 0, to: value });

      return;
    }

    const from = running;

    running += kind === 'plus' ? value : -value;
    steps.push({ key, value, kind, from: Math.min(from, running), to: Math.max(from, running) });
  };

  if (summary.shifts_earned > 0) push('Shifts', summary.shifts_earned, 'plus');
  if (summary.period_earned > 0) push('Wages', summary.period_earned, 'plus');
  if (summary.sales_earned > 0) push('Sales', summary.sales_earned, 'plus');
  if (summary.tips_earned > 0) push('Tips', summary.tips_earned, 'plus');
  if (summary.tip_out > 0) push('Tip-out', summary.tip_out, 'minus');
  if (summary.deductions > 0) push('Deductions', summary.deductions, 'minus');

  if (steps.length === 0) return [];

  push('Earned', summary.total_earned, 'total');

  if (summary.tax > 0) {
    running = summary.total_earned;
    push('Tax', summary.tax, 'minus');
    push('Net', summary.net_earned, 'total');
  }

  return steps;
}

export interface PunchCell {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  hour: number;
  count: number;
  hours: number;
  earned: number;
  perHour: number;
}

export interface Punchcard {
  cells: PunchCell[];
  hourFrom: number;
  hourTo: number;
  maxCount: number;
  maxPerHour: number;
}

/**
 * Worked shifts bucketed by weekday and starting hour — the shape of a
 * working life. Size will say how often, colour how well it pays.
 */
export function punchcard(days: readonly CalendarDayData[]): Punchcard | null {
  const buckets = new Map<string, PunchCell>();

  for (const day of days) {
    const weekday = (new Date(`${day.date}T00:00:00`).getDay() + 6) % 7;

    for (const entry of day.shifts) {
      if (!entry.worked) continue;

      const hour = Number(entry.start_time.slice(0, 2));
      const key = `${weekday}:${hour}`;
      const cell =
        buckets.get(key) ?? { weekday, hour, count: 0, hours: 0, earned: 0, perHour: 0 };

      cell.count += 1;
      cell.hours += entry.hours;
      cell.earned += entry.earned;
      buckets.set(key, cell);
    }
  }

  if (buckets.size === 0) return null;

  const cells = [...buckets.values()].map((cell) => ({
    ...cell,
    perHour: cell.hours > 0 ? cell.earned / cell.hours : 0,
  }));

  return {
    cells,
    hourFrom: Math.min(...cells.map((cell) => cell.hour)),
    hourTo: Math.max(...cells.map((cell) => cell.hour)),
    maxCount: Math.max(...cells.map((cell) => cell.count)),
    maxPerHour: Math.max(...cells.map((cell) => cell.perHour)),
  };
}

/** Money attributed to each hour of the clock, spread across shift spans. */
export function hourDial(days: readonly CalendarDayData[]): number[] {
  const hours = new Array<number>(24).fill(0);

  for (const day of days) {
    for (const entry of day.shifts) {
      if (!entry.worked || entry.hours <= 0 || entry.earned <= 0) continue;

      const start = Number(entry.start_time.slice(0, 2));
      const end = Number(entry.end_time.slice(0, 2));
      // Overnight shifts wrap: 22 → 06 spans eight clock hours, not minus.
      const span = end > start ? end - start : end + 24 - start;

      if (span <= 0) continue;

      const perHour = entry.earned / span;

      for (let offset = 0; offset < span; offset += 1) {
        hours[(start + offset) % 24] += perHour;
      }
    }
  }

  return hours;
}

export interface RatePoint {
  /** Monday of the week. */
  week: string;
  perHour: number;
  hours: number;
}

/** The paying hour, week by week — the line a raise (or a quiet cut) shows up on. */
export function rateTrend(days: readonly CalendarDayData[]): RatePoint[] {
  const weeks = new Map<string, { earned: number; hours: number }>();

  for (const day of days) {
    if (day.hours <= 0) continue;

    const weekday = (new Date(`${day.date}T00:00:00`).getDay() + 6) % 7;
    const monday = shiftDays(day.date, -weekday);
    const bucket = weeks.get(monday) ?? { earned: 0, hours: 0 };

    bucket.earned += day.earned;
    bucket.hours += day.hours;
    weeks.set(monday, bucket);
  }

  return [...weeks.entries()]
    .filter(([, bucket]) => bucket.hours > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, bucket]) => ({ week, perHour: bucket.earned / bucket.hours, hours: bucket.hours }));
}
