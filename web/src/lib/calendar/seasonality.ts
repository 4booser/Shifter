import { CalendarDayData } from './models';

/** The year's shape, from somebody's own months. */

export interface MonthShape {
  /** 1..12. */
  month: number;
  /** How many years there is a record for. */
  years: number;
  /** Average earned in this month, across those years. */
  average: number;
  /** Against a typical month of the same years. */
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

/** How each month of the year compares with a typical one. */
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

/** The same month a year ago, and the same part of it. */
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

/** The seasonal correction for a month, or null where there is not enough history to make one. */
export function seasonalIndex(shape: MonthShape[], month: number): number | null {
  const found = shape.find((row) => row.month === month);

  if (found === undefined) return null;

  // A correction beyond a half in either direction is almost always one freakish month rather than a season, and…
  return Math.min(1.5, Math.max(0.5, found.index));
}

export interface Cushion {
  /** Months that usually run above the typical one, with the surplus share. */
  fat: { month: number; surplus: number }[];
  /** Months that usually run under, with the shortfall. */
  lean: { month: number; shortfall: number }[];
  /** Set aside this share of a fat month's earnings and the lean months even out to the typical level. */
  saveShare: number | null;
}

/** The seasonal cushion: what to put aside in December so January is livable. */
export function seasonalCushion(shape: MonthShape[]): Cushion | null {
  if (shape.length < 6) return null;

  const typical = shape.reduce((sum, row) => sum + row.average, 0) / shape.length;

  if (typical <= 0) return null;

  const fat = shape
    .filter((row) => row.average > typical * 1.08)
    .map((row) => ({ month: row.month, surplus: row.average - typical }));

  const lean = shape
    .filter((row) => row.average < typical * 0.92)
    .map((row) => ({ month: row.month, shortfall: typical - row.average }));

  if (fat.length === 0 || lean.length === 0) return null;

  const surplusTotal = fat.reduce((sum, row) => sum + row.surplus, 0);
  const shortfallTotal = lean.reduce((sum, row) => sum + row.shortfall, 0);
  const fatEarnings = fat.reduce((sum, row) => sum + row.surplus + typical, 0);

  // The share of a fat month's whole take that covers the lean months' whole gap — capped where the gap is deeper…
  const needed = Math.min(shortfallTotal, surplusTotal);

  return {
    fat,
    lean,
    saveShare: Math.round((needed / fatEarnings) * 100) / 100,
  };
}
