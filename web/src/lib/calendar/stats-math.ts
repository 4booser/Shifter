/**
 * The statistics page's arithmetic, extracted pure so the page stays layout.
 * Ported 1:1 from the previous client — every block mirrors a server rule or
 * answers one question the totals alone cannot.
 */

import { keysBetween, weekBounds } from './calendar-date';
import { CalendarDayData, DaysResponse, Goal } from './models';

export function delta(now: number, before: number): number | null {
  if (before === 0) return null;

  return ((now - before) / before) * 100;
}

/** Whole calendar months spanned, or 0. Mirrors GoalCalculator.WholeMonths. */
export function wholeMonths(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);

  if (fd !== 1) return 0;
  if (td !== new Date(ty, tm, 0).getDate()) return 0;

  return (ty - fy) * 12 + tm - fm + 1;
}

export function wholeYears(from: string, to: string): number {
  if (!from.endsWith('-01-01') || !to.endsWith('-12-31')) return 0;

  return Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1;
}

/** One pinned to a period inside the range wins, else the standing one. */
export function resolveGoal(
  goals: Goal[],
  period: Goal['period'],
  from: string,
  to: string,
): Goal | null {
  const ofPeriod = goals.filter((goal) => goal.period === period);
  const pinned = ofPeriod.find((goal) => goal.anchor !== null && goal.anchor >= from && goal.anchor <= to);

  return pinned ?? ofPeriod.find((goal) => goal.anchor === null) ?? null;
}

/**
 * The goal that governs a range, and what it asks for over it. Only whole
 * periods get a figure: half a month against a monthly goal is not half the
 * target in any sense a reader would accept.
 */
export function activeGoalFor(
  goals: Goal[],
  from: string,
  to: string,
): { goal: Goal; target: number } | null {
  if (goals.length === 0) return null;

  const days = keysBetween(from, to).length;

  if (days === 0 || days > 400) return null;

  const candidates: { period: Goal['period']; multiple: number }[] = [
    { period: 'day', multiple: days },
    { period: 'week', multiple: days % 7 === 0 ? days / 7 : 0 },
    { period: 'month', multiple: wholeMonths(from, to) },
    { period: 'year', multiple: wholeYears(from, to) },
  ];

  for (const candidate of [...candidates].reverse()) {
    if (candidate.multiple <= 0) continue;

    const goal = resolveGoal(goals, candidate.period, from, to);

    if (goal !== null) return { goal, target: goal.amount * candidate.multiple };
  }

  return null;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** Earnings bucketed by day/week/month, granularity following range length. */
export function earningsBuckets(
  summary: DaysResponse,
  from: string,
  to: string,
): { grain: 'day' | 'week' | 'month'; data: { label: string; earned: number; planned: number; hours: number }[] } {
  const span = keysBetween(from, to).length;
  const grain = span <= 62 ? 'day' : span <= 240 ? 'week' : 'month';

  if (grain === 'day') {
    const byDate = new Map(summary.days.map((day) => [day.date, day]));

    return {
      grain,
      data: keysBetween(from, to).map((key) => {
        const day = byDate.get(key);

        return { label: key.slice(8), earned: day?.earned ?? 0, planned: day?.planned ?? 0, hours: day?.hours ?? 0 };
      }),
    };
  }

  const buckets = new Map<string, { label: string; earned: number; planned: number; hours: number }>();

  for (const day of summary.days) {
    const label = grain === 'week' ? weekBounds(day.date).from.slice(5) : day.date.slice(0, 7);
    const bucket = buckets.get(label) ?? { label, earned: 0, planned: 0, hours: 0 };

    bucket.earned += day.earned;
    bucket.planned += day.planned;
    bucket.hours += day.hours;
    buckets.set(label, bucket);
  }

  return { grain, data: [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label)) };
}

/** Weekday totals, Monday-first. */
export function weekdayTotals(days: readonly CalendarDayData[]): { name: string; value: number; share: number }[] {
  const totals = new Array(7).fill(0) as number[];

  for (const day of days) {
    const [year, month, dayOfMonth] = day.date.split('-').map(Number);

    totals[(new Date(year, month - 1, dayOfMonth).getDay() + 6) % 7] += day.earned;
  }

  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const top = Math.max(1, ...totals);

  return totals.map((value, index) => ({ name: names[index], value, share: (value / top) * 100 }));
}
