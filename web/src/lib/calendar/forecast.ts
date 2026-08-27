import { CalendarDayData } from './models';
import { keysBetween, todayKey } from './calendar-date';

export interface Forecast {
  /** Days in the period that have already passed, inclusive of today. */
  elapsed: number;
  remaining: number;
  /** Earned so far, from days up to and including today. */
  earnedSoFar: number;
  /** Money already on the calendar as planned shifts still ahead. */
  plannedAhead: number;
  /** Straight-line projection from the pace so far. */
  runRate: number;
  /** Earned so far plus what is already booked in — the conservative figure. */
  withPlanned: number;
  /** The two combined: booked shifts plus pace on the days still empty. */
  projected: number;
  /** Average per elapsed calendar day. */
  perDay: number;
  /** Whether the period is still running; a finished one has no forecast. */
  live: boolean;
}

/**
 * Projects a period forward. Two honest numbers rather than one guess: what is
 * already booked, and what the pace so far suggests. The blend fills only the
 * days that have nothing on them yet, so booked work is never double-counted.
 */
export function forecastFor(
  days: CalendarDayData[],
  from: string,
  to: string,
  /** Days covered by leave or sickness — outside the pace in both directions. */
  awayDays: ReadonlySet<string> = new Set(),
): Forecast {
  const today = todayKey();
  const everything = keysBetween(from, to);
  const byDate = new Map(days.map((day) => [day.date, day]));

  // A fortnight of leave is not a fortnight of laziness: counting it as a
  // zero-earning day would slander the pace, and projecting the pace onto
  // it would promise money nobody will earn. It leaves both sums.
  const all = everything.filter((key) => !awayDays.has(key) || (byDate.get(key)?.earned ?? 0) > 0);

  const past = all.filter((key) => key <= today);
  const future = all.filter((key) => key > today);

  const earnedSoFar = past.reduce(
    (total, key) => total + (byDate.get(key)?.earned ?? 0),
    0,
  );

  // Today counts as still ahead for anything booked on it. A shift happening
  // this evening has earned nothing yet, so it is not in earnedSoFar; before
  // this it was not in plannedAhead either, because that started at tomorrow —
  // and the shift simply vanished from the forecast on the day it mattered
  // most. Earned and planned never overlap on one day, so counting today in
  // both sets cannot double anything.
  const ahead = all.filter((key) => key >= today);

  const plannedAhead = ahead.reduce(
    (total, key) => total + (byDate.get(key)?.planned ?? 0),
    0,
  );

  const elapsed = past.length;
  const remaining = future.length;
  const perDay = elapsed === 0 ? 0 : earnedSoFar / elapsed;

  // Only days with nothing booked get the pace applied; the rest already have
  // a real number attached to them.
  const emptyAhead = future.filter((key) => {
    const day = byDate.get(key);

    return day === undefined || (day.planned === 0 && day.earned === 0);
  }).length;

  return {
    elapsed,
    remaining,
    earnedSoFar,
    plannedAhead,
    runRate: perDay * all.length,
    withPlanned: earnedSoFar + plannedAhead,
    projected: earnedSoFar + plannedAhead + perDay * emptyAhead,
    perDay,
    // A period with work booked on its last day is still live: there is
    // something left to happen, even if no whole day remains after it.
    live: (remaining > 0 || plannedAhead > 0) && elapsed > 0,
  };
}

export interface PaceToGoal {
  /** Still needed to reach the goal. */
  needed: number;
  /** Per remaining day, to land exactly on it. */
  perDay: number;
  /** How the current pace compares with the pace required. */
  ahead: boolean;
  reachable: boolean;
}

export function paceToGoal(forecast: Forecast, goal: number | null): PaceToGoal | null {
  if (goal === null || goal <= 0 || forecast.remaining === 0) return null;

  const needed = Math.max(0, goal - forecast.earnedSoFar);

  return {
    needed,
    perDay: needed / forecast.remaining,
    ahead: forecast.projected >= goal,
    // A day cannot realistically carry more than a couple of full shifts.
    reachable: needed / forecast.remaining <= forecast.perDay * 3,
  };
}

/** Cumulative points for the days already past, then the projected tail. */
export function projectionSeries(
  days: CalendarDayData[],
  from: string,
  to: string,
  forecast: Forecast,
): { label: string; value: number }[] {
  const today = todayKey();
  const byDate = new Map(days.map((day) => [day.date, day]));
  const all = keysBetween(from, to);

  let running = forecast.earnedSoFar;
  const points: { label: string; value: number }[] = [];

  for (const key of all) {
    if (key < today) continue;

    const day = byDate.get(key);

    if (key === today) {
      // The line starts at today, and it starts with whatever is still booked
      // for tonight. Without this the first point sat below the last recorded
      // day and the curve dipped on the day the shift was actually being
      // worked. The pace is not applied here: most of today is already gone.
      running += day?.planned ?? 0;

      points.push({ label: key.slice(8), value: running });

      continue;
    }

    // A booked shift contributes its own amount; an empty day gets the pace.
    running += day?.planned ? day.planned : forecast.perDay;

    points.push({ label: key.slice(8), value: running });
  }

  return points;
}
