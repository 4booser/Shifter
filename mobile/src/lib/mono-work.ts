import { CalendarDayData } from './types';
import { MonoStatementItem, dayOf, kindForMcc, spent } from './mono';

/**
 * The questions only this app can answer.
 *
 * A bank app knows what left the account on Tuesday. A rota app knows Tuesday
 * was a twelve-hour close. Neither of them can tell somebody what an hour of
 * their work is actually worth, or what going to work costs before it pays
 * anything, because each holds exactly half of the arithmetic.
 *
 * Everything here is a pure function of the two halves. Nothing goes to a
 * server, and nothing is written back without somebody saying so.
 */

/** The days with a shift somebody actually worked. */
export const workedDays = (days: CalendarDayData[]): Set<string> =>
  new Set(
    days
      .filter((day) => day.shifts.some((entry) => entry.worked))
      .map((day) => day.date),
  );

const inRange = (item: MonoStatementItem, from: string, to: string): boolean => {
  const day = dayOf(item);

  return !item.hold && item.amount < 0 && day >= from && day <= to;
};

export interface DayKindSpending {
  /** Average spend on a day with a worked shift. */
  onShift: number;
  /** Average spend on a day without one. */
  off: number;
  onShiftDays: number;
  offDays: number;
  /** Categories where the two differ most, biggest gap first. */
  differences: { kind: string; onShift: number; off: number }[];
}

/**
 * What a working day costs before it has paid anything.
 *
 * Going to work is expensive in a way that never shows up in a wage: the
 * lunch bought because there was no time to make one, the taxi because the
 * shift ended after the last tram. Comparing the two kinds of day is the only
 * way to see it, and it needs both halves of the data.
 *
 * Returns nothing where there is not enough of either kind. Two shifts is not
 * a sample, and an average of two numbers presented as a habit is a lie with
 * a decimal point in it.
 */
export const spendingByDayKind = (
  items: MonoStatementItem[],
  days: CalendarDayData[],
  from: string,
  to: string,
  /** How many days of each kind before it is worth saying anything. */
  least = 5,
): DayKindSpending | null => {
  const worked = workedDays(days);
  const known = new Set(days.filter((day) => day.date >= from && day.date <= to).map((day) => day.date));

  const onShiftDays = [...known].filter((day) => worked.has(day)).length;
  const offDays = known.size - onShiftDays;

  if (onShiftDays < least || offDays < least) return null;

  let onShift = 0;
  let off = 0;
  const byKind = new Map<string, { onShift: number; off: number }>();

  for (const item of items) {
    if (!inRange(item, from, to)) continue;

    const day = dayOf(item);

    if (!known.has(day)) continue;

    const size = spent(item);
    const kind = kindForMcc(item.mcc)?.kind ?? 'other';
    const row = byKind.get(kind) ?? { onShift: 0, off: 0 };

    if (worked.has(day)) {
      onShift += size;
      row.onShift += size;
    } else {
      off += size;
      row.off += size;
    }

    byKind.set(kind, row);
  }

  const differences = [...byKind.entries()]
    .map(([kind, row]) => ({
      kind,
      onShift: row.onShift / onShiftDays,
      off: row.off / offDays,
    }))
    .filter((row) => row.onShift > row.off)
    .sort((one, two) => two.onShift - two.off - (one.onShift - one.off));

  return {
    onShift: onShift / onShiftDays,
    off: off / offDays,
    onShiftDays,
    offDays,
    differences,
  };
};

export interface RealRate {
  earned: number;
  hours: number;
  /** What the rota says an hour paid. */
  headline: number;
  /** What going to work took, on the days it was gone to. */
  costs: number;
  /** What is left of the hour once that is out. */
  real: number;
}

/**
 * What an hour is actually worth, once getting there has been paid for.
 *
 * Only spending that lands on a day somebody worked, and only in the
 * categories that can plausibly be about work at all — a supermarket run on a
 * shift day is not a work cost, and counting it would make every job look
 * ruinous. The list of plausible categories is the one the expense matcher
 * already uses, so the two cannot disagree.
 *
 * Null where there are no hours: an hourly rate of nothing divided by nothing
 * is not a figure to print.
 */
export const realHourly = (
  items: MonoStatementItem[],
  days: CalendarDayData[],
  from: string,
  to: string,
): RealRate | null => {
  const within = days.filter((day) => day.date >= from && day.date <= to);
  const worked = workedDays(within);

  const hours = within.reduce(
    (sum, day) => sum + day.shifts.filter((entry) => entry.worked).reduce((h, entry) => h + entry.hours, 0),
    0,
  );

  if (hours <= 0) return null;

  const earned = within.reduce((sum, day) => sum + day.earned, 0);

  let costs = 0;

  for (const item of items) {
    if (!inRange(item, from, to)) continue;
    if (!worked.has(dayOf(item))) continue;

    // "sure" is the matcher's own word for a category that really does mean
    // work when it lands on a working day. The unsure ones are offered to a
    // person for confirmation elsewhere; they are not quietly counted here.
    if (kindForMcc(item.mcc)?.sure !== true) continue;

    costs += spent(item);
  }

  return {
    earned,
    hours,
    headline: earned / hours,
    costs,
    real: (earned - costs) / hours,
  };
};

export interface ClosingCost {
  closings: number;
  /** Spent on getting home after them. */
  ride: number;
  /** What those shifts earned, from the rota, so the two can be looked at together. */
  earned: number;
}

/** Transport, in the codes the card writes for it. */
const RIDE_HOME_HOURS = 3;

/**
 * What closing costs.
 *
 * A close ends after the last tram, so it ends in a taxi. The venue pays the
 * night premium and the person pays the fare, and nobody has ever put the two
 * numbers next to each other because they live in different applications.
 */
export const closingCosts = (
  items: MonoStatementItem[],
  days: CalendarDayData[],
  from: string,
  to: string,
  /** A shift ending at or after this hour counts as a close. */
  after = 23,
): ClosingCost => {
  const closings: { day: string; endsAt: number }[] = [];

  for (const day of days) {
    if (day.date < from || day.date > to) continue;

    for (const shift of day.shifts) {
      if (!shift.worked) continue;

      const end = shift.actual_end ?? shift.end_time;
      const hour = Number(end.slice(0, 2));
      const minute = Number(end.slice(3, 5));

      // An end before the start is the next morning, which is the case this
      // is looking for; "02:00" is a close, not a two-in-the-afternoon finish.
      const start = Number((shift.actual_start ?? shift.start_time).slice(0, 2));
      const overnight = hour < start;

      if (!overnight && hour < after) continue;

      const at = new Date(`${day.date}T00:00:00`).getTime() / 1000
        + (overnight ? 24 : 0) * 3600
        + hour * 3600
        + minute * 60;

      closings.push({ day: day.date, endsAt: at });
    }
  }

  let ride = 0;

  for (const item of items) {
    if (item.hold || item.amount >= 0) continue;
    if (kindForMcc(item.mcc)?.kind !== 'transport') continue;

    const near = closings.some(
      (closing) =>
        item.time >= closing.endsAt - 30 * 60
        && item.time <= closing.endsAt + RIDE_HOME_HOURS * 3600,
    );

    if (near) ride += spent(item);
  }

  // What those nights brought, so the fare has something to be read against.
  // Not the night premium alone: the day's earnings are what the rota is sure
  // of, and a premium split out per shift is not.
  const nights = new Set(closings.map((closing) => closing.day));
  const earned = days
    .filter((day) => nights.has(day.date))
    .reduce((sum, day) => sum + day.earned, 0);

  return { closings: closings.length, ride, earned };
};

export interface UntilPayday {
  /** Days to the next money, from the rota's own reckoning. */
  days: number;
  /** On the account now. */
  left: number;
  /** Known standing charges still to come before then. */
  committed: number;
  /** What is left per day once those are out. */
  perDay: number;
  /** What the same person usually spends in a day. */
  usual: number;
}

/**
 * How much there is per day until the next money lands.
 *
 * The calendar knows when the wage comes and roughly how much. The bank knows
 * what is left and what still has to leave. Neither application computes this
 * on its own, and it is the question people actually ask on the 22nd.
 *
 * No advice attached. Somebody who is told they have three hundred a day for
 * nine days already knows what to do with that sentence.
 */
export const untilPayday = (
  balance: number,
  daysToPay: number,
  committed: number,
  usualPerDay: number,
): UntilPayday | null => {
  if (daysToPay <= 0) return null;

  const spendable = balance - committed;

  return {
    days: daysToPay,
    left: balance,
    committed,
    perDay: spendable / daysToPay,
    usual: usualPerDay,
  };
};

/** What a day usually costs, over the days there is a record for. */
export const usualDay = (
  items: MonoStatementItem[],
  from: string,
  to: string,
): number => {
  const days = new Set<string>();
  let total = 0;

  for (const item of items) {
    if (!inRange(item, from, to)) continue;

    total += spent(item);
    days.add(dayOf(item));
  }

  return days.size === 0 ? 0 : total / days.size;
};

export interface Punctuality {
  locationId: number;
  place: string;
  /** Periods that have actually been settled, so there is something to judge. */
  settled: number;
  /** Average days between the promised day and the money arriving. */
  averageLate: number;
  /** The worst one, because an average of 2 hides a 14. */
  worstLate: number;
  /** How the last three went, newest first. Negative is early. */
  recent: { period: string; late: number }[];
  /** Periods where less arrived than was owed. A different complaint entirely. */
  short: number;
}

/**
 * Whether a place pays when it says it will.
 *
 * The promised day is in the place's own settings. The day the money arrived
 * is in the payouts. Between them is the whole history of somebody's
 * relationship with an employer, and nobody keeps it — so the argument is
 * always about the last time, which the manager remembers differently.
 *
 * Lateness and shortfall are counted apart. They are different complaints and
 * different conversations, and rolling them together makes a number that
 * supports neither.
 */
export const punctuality = (
  periods: {
    location_id: number;
    location_name: string;
    due_on: string;
    period_to: string;
    expected: number;
    paid: number;
    days_late: number;
  }[],
): Punctuality[] => {
  const byPlace = new Map<number, Punctuality>();

  for (const row of periods) {
    // Only periods where money has actually arrived. A period still open is
    // not a place being late, it is a place whose turn has not come.
    if (row.paid <= 0) continue;

    const found = byPlace.get(row.location_id) ?? {
      locationId: row.location_id,
      place: row.location_name,
      settled: 0,
      averageLate: 0,
      worstLate: 0,
      recent: [],
      short: 0,
    };

    found.settled += 1;
    found.worstLate = Math.max(found.worstLate, row.days_late);
    found.recent.push({ period: row.period_to, late: row.days_late });
    if (row.paid + 0.01 < row.expected) found.short += 1;

    byPlace.set(row.location_id, found);
  }

  for (const row of byPlace.values()) {
    const total = row.recent.reduce((sum, one) => sum + one.late, 0);

    row.averageLate = row.settled === 0 ? 0 : total / row.settled;
    row.recent = row.recent
      .sort((one, two) => two.period.localeCompare(one.period))
      .slice(0, 3);
  }

  // Three settled periods before it is worth saying anything. One late wage
  // is a story about one month, not about an employer.
  return [...byPlace.values()]
    .filter((row) => row.settled >= 3)
    .sort((one, two) => two.averageLate - one.averageLate);
};
