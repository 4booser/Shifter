/** The break that gets taken because something counted it. */

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

/** Placements whose break the timer has already spoken for today. */
export const TIMED_KEY = 'shifter.break.timed';

export interface Timed {
  dayKey: string;
  shiftIds: number[];
}

/** The placements already timed today, dropping any other day's record. */
export function readTimed(raw: string | null, dayKey: string): number[] {
  if (raw === null) return [];

  try {
    const timed = JSON.parse(raw) as Timed;

    if (timed.dayKey !== dayKey || !Array.isArray(timed.shiftIds)) return [];

    return timed.shiftIds.filter((id) => typeof id === 'number');
  } catch {
    return [];
  }
}

/** What the placement's break minutes become after a timed break. */
export const foldBreak = (had: number, minutes: number, alreadyTimed: boolean): number =>
  alreadyTimed ? had + minutes : minutes;

/** Seconds left. Negative once the break has run over, which is not hidden. */
export const remaining = (run: BreakRun, now: number): number =>
  Math.round((run.startedAt + run.planned * 60_000 - now) / 1000);

/** Minutes to write down. */
export const taken = (run: BreakRun, now: number): number =>
  Math.max(1, Math.ceil((now - run.startedAt) / 60_000));

/** A break left running past any plausible length. */
export const RUNAWAY_MINUTES = 180;

export const runaway = (run: BreakRun, now: number): boolean =>
  now - run.startedAt > RUNAWAY_MINUTES * 60_000;

/** "12:04" from a count of seconds, minus sign and all. */
export function clock(seconds: number): string {
  const sign = seconds < 0 ? '−' : '';
  const whole = Math.abs(seconds);

  return `${sign}${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The break stored in the browser, if it is still one this page should show. */
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
