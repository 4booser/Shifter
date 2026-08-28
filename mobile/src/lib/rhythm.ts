import { weekdayOf } from './calendar';

/** What a weekday is worth: hours, money, and the hour's own rate. */
export interface WeekdayRate {
  /** 0 = Monday. */
  weekday: number;
  days: number;
  hours: number;
  earned: number;
  /** Null where nobody has worked that day: an unworked day is not a cheap one. */
  perHour: number | null;
}

/**
 * Which days of the week are actually worth working.
 *
 * The app already says which hour pays best. The more useful question is
 * which day: a Friday close and a Tuesday day shift are the same eight hours
 * and rarely the same money, and choosing between them is a decision people
 * make every week without a number in front of them.
 *
 * Averaged per hour rather than per shift, because a Saturday that pays more
 * only because it is longer is not a better Saturday.
 */
export const byWeekday = (days: { date: string; hours: number; earned: number }[]): WeekdayRate[] => {
  const rows: WeekdayRate[] = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    days: 0,
    hours: 0,
    earned: 0,
    perHour: null,
  }));

  for (const day of days) {
    if (day.hours <= 0) continue;

    const row = rows[weekdayOf(day.date)];

    row.days += 1;
    row.hours += day.hours;
    row.earned += day.earned;
  }

  for (const row of rows) {
    row.perHour = row.hours > 0 ? row.earned / row.hours : null;
  }

  return rows;
};

/** The best and worst day worth naming, or null where there is not enough to compare. */
export const bestWeekday = (rows: WeekdayRate[]): { best: WeekdayRate; worst: WeekdayRate } | null => {
  const worked = rows.filter((row) => row.perHour !== null && row.days >= 2);

  // Two days at the same rate is not a comparison, it is a coincidence.
  if (worked.length < 2) return null;

  const sorted = [...worked].sort((one, two) => (two.perHour ?? 0) - (one.perHour ?? 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return (best.perHour ?? 0) - (worst.perHour ?? 0) < 1 ? null : { best, worst };
};
