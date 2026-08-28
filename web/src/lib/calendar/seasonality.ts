import { CalendarDayData } from './models';

/**
 * The year's shape, from somebody's own months.
 *
 * "December is always plus forty" is knowledge everybody with two years in the
 * trade has and nobody with one year does — and the app has been giving both
 * of them the same flat forecast. It is the single most useful thing a second
 * year of records contains, and it was sitting there unread.
 *
 * Everything here is that person's own history. No industry averages, no
 * assumptions about hospitality in general: a bar on a ski slope and a canteen
 * in an office block have opposite Decembers, and only their own records know
 * which is which.
 */

export interface MonthShape {
  /** 1..12. */
  month: number;
  /** How many years there is a record for. */
  years: number;
  /** Average earned in this month, across those years. */
  average: number;
  /**
   * Against a typical month of the same years. 1.4 is "forty per cent better
   * than usual"; 1 is unremarkable.
   */
  index: number;
}

/** Complete months only: a December half-recorded is not a December. */
const monthlyTotals = (days: CalendarDayData[], upTo: string): Map<string, number> => {
  const totals = new Map<string, number>();

  for (const day of days) {
    if (day.earned <= 0) continue;

    const key = day.date.slice(0, 7);

    totals.set(key, (totals.get(key) ?? 0) + day.earned);
  }

  // The month in progress is dropped: it is a partial figure and would drag
  // its own month's average down every time somebody looks at it.
  totals.delete(upTo.slice(0, 7));

  return totals;
};

/**
 * How each month of the year compares with a typical one.
 *
 * Only months with at least <paramref name="leastYears" /> years behind them.
 * One December is a December, not a pattern, and calling it one would turn a
 * good Christmas into a promise.
 */
export function yearShape(
  days: CalendarDayData[],
  today: string,
  leastYears = 2,
): MonthShape[] {
  const totals = monthlyTotals(days, today);

  if (totals.size === 0) return [];

  const overall = [...totals.values()].reduce((sum, value) => sum + value, 0) / totals.size;

  if (overall <= 0) return [];

  const byMonth = new Map<number, number[]>();

  for (const [key, value] of totals) {
    const month = Number(key.slice(5, 7));

    byMonth.set(month, [...(byMonth.get(month) ?? []), value]);
  }

  return [...byMonth.entries()]
    .filter(([, values]) => values.length >= leastYears)
    .map(([month, values]) => {
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;

      return {
        month,
        years: values.length,
        average,
        index: average / overall,
      };
    })
    .sort((one, two) => one.month - two.month);
}

export interface SameMonthLastYear {
  /** 'YYYY-MM' of the month a year before. */
  month: string;
  earned: number;
  /** The same fraction of that month, so a comparison mid-month is fair. */
  earnedByNow: number;
  daysWorked: number;
}

/**
 * The same month a year ago, and the same part of it.
 *
 * Comparing a half-finished March against a whole one says nothing except that
 * March is not over. So the earlier month is cut at the same day of the month
 * the current one has reached, and both figures are given: the whole of it,
 * and the part that matches.
 */
export function sameMonthLastYear(
  days: CalendarDayData[],
  today: string,
): SameMonthLastYear | null {
  const year = Number(today.slice(0, 4)) - 1;
  const month = today.slice(5, 7);
  const dayOfMonth = Number(today.slice(8, 10));
  const key = `${year}-${month}`;

  const inMonth = days.filter((day) => day.date.startsWith(key) && day.earned > 0);

  if (inMonth.length === 0) return null;

  const byNow = inMonth.filter((day) => Number(day.date.slice(8, 10)) <= dayOfMonth);

  return {
    month: key,
    earned: inMonth.reduce((sum, day) => sum + day.earned, 0),
    earnedByNow: byNow.reduce((sum, day) => sum + day.earned, 0),
    daysWorked: inMonth.length,
  };
}

/**
 * The seasonal correction for a month, or null where there is not enough
 * history to make one.
 *
 * Returning null rather than 1 is the point: a caller has to decide what to do
 * without a correction, and cannot accidentally present a flat forecast as a
 * seasonal one.
 */
export function seasonalIndex(shape: MonthShape[], month: number): number | null {
  const found = shape.find((row) => row.month === month);

  if (found === undefined) return null;

  // A correction beyond a half in either direction is almost always one
  // freakish month rather than a season, and applying it would turn a
  // forecast into a rumour.
  return Math.min(1.5, Math.max(0.5, found.index));
}
