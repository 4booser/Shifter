/**
 * The break that gets taken because something counted it.
 *
 * A break nobody started on time is a break nobody takes at all — the shift
 * absorbs it, and at the end of the month the hours say one thing and the body
 * says another. A countdown is the cheapest fix there is.
 *
 * What it records is what happened, never what was meant to happen. Come back
 * after forty-seven minutes of a thirty-minute break and it writes forty-seven.
 * A timer that quietly recorded the planned figure would be the app keeping
 * somebody's timesheet for them, which is the one thing it must not do.
 *
 * One break at a time, because a person can only be on one.
 */

export interface BreakRun {
  /** The day and the placement it belongs to. */
  dayKey: string;
  shiftId: number;
  /** Epoch milliseconds. */
  startedAt: number;
  /** What was planned for it, in minutes — the countdown, not the record. */
  planned: number;
}

export const BREAK_KEY = 'shifter.break';

/** Seconds left. Negative once the break has run over, which is not hidden. */
export const remaining = (run: BreakRun, now: number): number =>
  Math.round((run.startedAt + run.planned * 60_000 - now) / 1000);

/**
 * Minutes to write down.
 *
 * Rounded up, and never zero: a break somebody started and ended twenty
 * seconds later still happened, and rounding it away would leave a button that
 * appears to do nothing.
 */
export const taken = (run: BreakRun, now: number): number =>
  Math.max(1, Math.ceil((now - run.startedAt) / 60_000));

/**
 * A break left running past any plausible length.
 *
 * Somebody shut the laptop and went home. Writing six hours into their paid
 * hours because a tab stayed open would be the worst kind of wrong number —
 * one that arrives by itself and reads as a fact.
 */
export const RUNAWAY_MINUTES = 180;

export const runaway = (run: BreakRun, now: number): boolean =>
  now - run.startedAt > RUNAWAY_MINUTES * 60_000;

/** "12:04" from a count of seconds, minus sign and all. */
export function clock(seconds: number): string {
  const sign = seconds < 0 ? '−' : '';
  const whole = Math.abs(seconds);

  return `${sign}${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The break stored in the browser, if it is still one this page should show.
 *
 * Kept outside React because a countdown that dies with a refresh is a
 * countdown nobody trusts, and somebody on a break has certainly closed the
 * tab. A run belonging to another day is dropped rather than resumed: coming
 * back tomorrow to a running break from yesterday would write yesterday's
 * hours wrong.
 */
export function readRun(raw: string | null, dayKey: string): BreakRun | null {
  if (raw === null) return null;

  try {
    const run = JSON.parse(raw) as BreakRun;

    if (typeof run.startedAt !== 'number' || typeof run.shiftId !== 'number') return null;
    if (run.dayKey !== dayKey) return null;

    return run;
  } catch {
    return null;
  }
}
