import { CalendarDayData, DaysResponse } from './models';
import { keysBetween, shiftDays } from './calendar-date';

/**
 * The per-unit numbers. Totals answer "how much"; these answer "how much is a
 * day of my life worth", which is the question people actually carry around.
 */
export interface Averages {
  /** Days that had at least one shift marked worked. */
  daysWorked: number;
  shifts: number;
  perDay: number;
  hoursPerDay: number;
  tipsPerDay: number;
  salesPerDay: number;
  /**
   * What an hour was worth, or null where there is no honest answer.
   *
   * Null rather than nought, because nought is a figure and every screen
   * printed it as one: «В час 0 ₴» beside «↓ 100%» on the comparison table,
   * on the report, and in the month's share text — all of them saying the
   * hour had collapsed, when the truth was that under an hour of work there
   * was nothing to divide.
   */
  perHour: number | null;
  tipsPerHour: number | null;
  perShift: number;
  hoursPerShift: number;
  /** Share of everything earned that arrived as tips, in percent. */
  tipShare: number;
}

const EMPTY: Averages = {
  daysWorked: 0,
  shifts: 0,
  perDay: 0,
  hoursPerDay: 0,
  tipsPerDay: 0,
  salesPerDay: 0,
  perHour: null,
  tipsPerHour: null,
  perShift: 0,
  hoursPerShift: 0,
  tipShare: 0,
};

/** Zero rather than Infinity when there is nothing to divide by. */
function per(total: number, count: number): number {
  return count === 0 ? 0 : total / count;
}

export function countShifts(days: readonly CalendarDayData[]): number {
  return days.reduce(
    (total, day) => total + day.shifts.filter((entry) => entry.worked).length,
    0,
  );
}

export function averagesFor(summary: DaysResponse): Averages {
  const worked = summary.days_worked;
  const shifts = countShifts(summary.days);

  if (worked === 0 && shifts === 0) return EMPTY;

  return {
    daysWorked: worked,
    shifts,
    perDay: per(summary.total_earned, worked),
    hoursPerDay: per(summary.hours, worked),
    tipsPerDay: per(summary.tips_earned, worked),
    salesPerDay: per(summary.sales_earned, worked),
    // An hourly rate divided out of minutes is not a rate. A shift closed
    // after fifty seconds priced the hour at −₴3 805 on the statistics page,
    // beside a card that said nought hours had been worked. Under an hour
    // there is nothing to quote.
    perHour: summary.hours < 1 ? null : per(summary.total_earned, summary.hours),
    tipsPerHour: summary.hours < 1 ? null : per(summary.tips_earned, summary.hours),
    perShift: per(summary.total_earned, shifts),
    hoursPerShift: per(summary.hours, shifts),
    tipShare: per(summary.tips_earned, summary.total_earned) * 100,
  };
}

/**
 * Percent change, or null when there is no baseline to compare against —
 * "+100%" from nothing is noise, and an arrow pointing up from zero lies.
 */
export function change(now: number, before: number): number | null {
  if (before === 0) return null;

  return ((now - before) / Math.abs(before)) * 100;
}

export interface Highlight {
  date: string;
  value: number;
}

export function bestDay(days: readonly CalendarDayData[]): Highlight | null {
  let best: Highlight | null = null;

  for (const day of days) {
    if (day.earned <= 0) continue;
    if (best === null || day.earned > best.value) best = { date: day.date, value: day.earned };
  }

  return best;
}

export interface Streak {
  length: number;
  from: string;
  to: string;
}

/**
 * The longest run of consecutive calendar days with work on them. Walks the
 * dates rather than the array so a gap in the data is still a gap in the run.
 */
export function longestStreak(days: readonly CalendarDayData[]): Streak | null {
  const worked = days
    .filter((day) => day.shifts.some((entry) => entry.worked))
    .map((day) => day.date)
    .sort();

  if (worked.length === 0) return null;

  let best: Streak = { length: 1, from: worked[0], to: worked[0] };
  let start = worked[0];
  let run = 1;

  for (let index = 1; index < worked.length; index += 1) {
    const previous = worked[index - 1];
    const current = worked[index];

    if (shiftDays(previous, 1) === current) {
      run += 1;
    } else {
      start = current;
      run = 1;
    }

    if (run > best.length) best = { length: run, from: start, to: current };
  }

  return best;
}

export interface WeekTotal {
  from: string;
  to: string;
  value: number;
}

/** The seven-day window that earned the most, aligned to Monday. */
export function bestWeek(days: readonly CalendarDayData[]): WeekTotal | null {
  const totals = new Map<string, number>();

  for (const day of days) {
    if (day.earned <= 0) continue;

    // Monday of that day's week, used as the bucket key.
    const weekday = (new Date(`${day.date}T00:00:00`).getDay() + 6) % 7;
    const monday = shiftDays(day.date, -weekday);

    totals.set(monday, (totals.get(monday) ?? 0) + day.earned);
  }

  let best: WeekTotal | null = null;

  for (const [monday, value] of totals) {
    if (best === null || value > best.value) {
      best = { from: monday, to: shiftDays(monday, 6), value };
    }
  }

  return best;
}

/** Calendar days in the range that had no work on them at all. */
export function restDays(
  days: readonly CalendarDayData[],
  from: string,
  to: string,
): number {
  const worked = new Set(
    days.filter((day) => day.shifts.some((entry) => entry.worked)).map((day) => day.date),
  );

  return keysBetween(from, to).filter((key) => !worked.has(key)).length;
}
