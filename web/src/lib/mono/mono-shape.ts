import { MonoStatementItem, dayOf, fromMinor, spent } from './mono';

/*
 * The shape of a month's money: curves, weekdays, heat and deltas.
 *
 * Everything here is drawing-ready arithmetic over the statement — no fetch,
 * no state, no guesses. Where the statement cannot support an answer, the
 * answer is null rather than a smaller lie, in the same voice as the rest of
 * the analysis: an estimate never mixes with a fact.
 */

export interface BalancePoint {
  /** 'YYYY-MM-DD'. */
  day: string;
  /** Major units, after the day's last transaction. */
  balance: number;
}

/**
 * The balance, day by day, read rather than reconstructed.
 *
 * monobank stamps the running balance onto every transaction, so the curve is
 * the bank's own record — the one figure on this page nobody has to trust us
 * about. Days with no transactions carry the previous day forward, which is
 * not an estimate: a balance that nothing touched did not move.
 *
 * Null with fewer than two days of statement in range — a curve with one
 * point is a dot wearing a chart's clothes.
 */
export function balanceCurve(
  items: MonoStatementItem[],
  from: string,
  to: string,
): BalancePoint[] | null {
  const inRange = items
    .filter((item) => !item.hold)
    .filter((item) => {
      const day = dayOf(item);

      return day >= from && day <= to;
    })
    // Oldest first, and within a day the later transaction wins.
    .sort((one, two) => one.time - two.time);

  if (inRange.length === 0) return null;

  const byDay = new Map<string, number>();

  for (const item of inRange) byDay.set(dayOf(item), fromMinor(item.balance));

  const days = [...byDay.keys()].sort();

  if (days.length < 2) return null;

  // Carried forward across the gaps, so the curve spans the whole stretch
  // between the first and last day that moved.
  const points: BalancePoint[] = [];
  let at = days[0];
  let carried = byDay.get(at)!;

  while (at <= days[days.length - 1]) {
    carried = byDay.get(at) ?? carried;
    points.push({ day: at, balance: carried });

    const next = new Date(`${at}T12:00:00`);

    next.setDate(next.getDate() + 1);
    at = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  }

  return points;
}

export interface WeekdayShape {
  /** 0 is Monday — the week as this trade counts it. */
  weekday: number;
  /** Average spent on that weekday, over the weeks in range. */
  average: number;
  days: number;
}

/**
 * Which day of the week the money leaves on.
 *
 * Averages, not totals: a month holds five Saturdays and four Mondays, and
 * totals would crown Saturday for the calendar's sake rather than the
 * spending's.
 */
export function weekdayShape(
  items: MonoStatementItem[],
  from: string,
  to: string,
): WeekdayShape[] {
  const totals = new Map<number, number>();
  const seen = new Map<number, Set<string>>();

  for (const item of items) {
    if (item.hold || item.amount >= 0) continue;

    const day = dayOf(item);

    if (day < from || day > to) continue;

    // getUTCDay puts Sunday first; the trade's week starts on Monday.
    const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

    totals.set(weekday, (totals.get(weekday) ?? 0) + spent(item));

    const days = seen.get(weekday) ?? new Set<string>();

    days.add(day);
    seen.set(weekday, days);
  }

  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const days = seen.get(weekday)?.size ?? 0;

    return {
      weekday,
      average: days === 0 ? 0 : (totals.get(weekday) ?? 0) / days,
      days,
    };
  });
}

export interface HeatDay {
  day: string;
  spent: number;
  /** 0..1 against the heaviest day in range. */
  heat: number;
}

/** Spending as a heat map over the days, for a calendar strip. */
export function spendingHeat(
  items: MonoStatementItem[],
  from: string,
  to: string,
): HeatDay[] {
  const byDay = new Map<string, number>();

  for (const item of items) {
    if (item.hold || item.amount >= 0) continue;

    const day = dayOf(item);

    if (day < from || day > to) continue;

    byDay.set(day, (byDay.get(day) ?? 0) + spent(item));
  }

  const peak = Math.max(1, ...byDay.values());

  return [...byDay.entries()]
    .map(([day, total]) => ({ day, spent: total, heat: total / peak }))
    .sort((one, two) => one.day.localeCompare(two.day));
}

export interface BigDay {
  day: string;
  spent: number;
  /** What most of it was: the largest single transaction's description. */
  mostly: string;
  mostlyAmount: number;
}

/**
 * The days that carried the month.
 *
 * Spending is lumpy: three days usually hold a third of a month, and knowing
 * which three answers "куда всё делось" better than any category chart.
 */
export function biggestDays(
  items: MonoStatementItem[],
  from: string,
  to: string,
  keep = 3,
): BigDay[] {
  const byDay = new Map<string, { total: number; top: MonoStatementItem }>();

  for (const item of items) {
    if (item.hold || item.amount >= 0) continue;

    const day = dayOf(item);

    if (day < from || day > to) continue;

    const row = byDay.get(day);

    if (row === undefined) {
      byDay.set(day, { total: spent(item), top: item });
    } else {
      row.total += spent(item);

      if (spent(item) > spent(row.top)) row.top = item;
    }
  }

  return [...byDay.entries()]
    .map(([day, row]) => ({
      day,
      spent: row.total,
      mostly: row.top.description,
      mostlyAmount: spent(row.top),
    }))
    .sort((one, two) => two.spent - one.spent)
    .slice(0, keep);
}

export interface MonthDelta {
  /** Spent this range and the one before it. */
  now: number;
  before: number;
  /** The categories that moved most, biggest absolute move first. */
  moves: { name: string; now: number; before: number }[];
}

/**
 * This month against the one before, by category.
 *
 * The question behind every "почему так дорого" is which category moved.
 * Totals answer whether; this answers where.
 *
 * Null when the earlier range has nothing in it — against an empty month
 * every figure is an infinite increase, and that is a chart, not a finding.
 */
export function monthDelta(
  items: MonoStatementItem[],
  categoriseItem: (item: MonoStatementItem) => string,
  nowFrom: string,
  nowTo: string,
  beforeFrom: string,
  beforeTo: string,
): MonthDelta | null {
  const sumBy = (from: string, to: string): Map<string, number> => {
    const by = new Map<string, number>();

    for (const item of items) {
      if (item.hold || item.amount >= 0) continue;

      const day = dayOf(item);

      if (day < from || day > to) continue;

      const name = categoriseItem(item);

      by.set(name, (by.get(name) ?? 0) + spent(item));
    }

    return by;
  };

  const now = sumBy(nowFrom, nowTo);
  const before = sumBy(beforeFrom, beforeTo);

  if (before.size === 0) return null;

  const names = new Set([...now.keys(), ...before.keys()]);

  const moves = [...names]
    .map((name) => ({
      name,
      now: now.get(name) ?? 0,
      before: before.get(name) ?? 0,
    }))
    .sort((one, two) =>
      Math.abs(two.now - two.before) - Math.abs(one.now - one.before))
    .slice(0, 5);

  return {
    now: [...now.values()].reduce((sum, value) => sum + value, 0),
    before: [...before.values()].reduce((sum, value) => sum + value, 0),
    moves,
  };
}

/**
 * What the standing payments cost per year.
 *
 * A subscription is priced per month to sound small. Twelve of everything is
 * the honest figure, and it is the one that gets things cancelled.
 */
export const yearOfStanding = (monthly: number): number => Math.round(monthly * 12);
