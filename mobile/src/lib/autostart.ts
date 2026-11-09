import { clockWindow, FORGOTTEN_AFTER } from './shift-window';
import { CalendarDayData, ShiftTemplate } from './types';

export { FORGOTTEN_AFTER };

/** Starting and stopping the shift by itself: at the hours somebody chose, or by the template's own window. */

export interface AutoStartRule {
  /** The template it belongs to. */
  shiftId: number;
  /** "18:00" — the hour it starts by itself. Null: only the stop is set. */
  at: string | null;
  /** "10:45" — the hour the running shift closes itself, anchored to the plan's own end rather than to the clock's… */
  stopAt?: string | null;
}

/** One planned shift the clock could start for. */
export interface PlannedClock {
  shiftId: number;
  /** The date it sits on. Today's unless said otherwise: last night's shift can still be running. */
  date?: string;
  /** Milliseconds, from the time rule. Absent where the template does not open by itself. */
  window?: { opens: number; closes: number } | null;
  /** True where a chosen start hour has no say on this date. */
  unruled?: boolean;
}

export interface AutoStartDecision {
  shiftId: number;
  /** ISO instant the clock should read as the start — the chosen hour, today. */
  startedAt: string;
  /** The date the shift sits on, which past midnight is not today. */
  date: string;
  /** Whether an hour somebody chose started it, rather than the plan. */
  ruled: boolean;
}

/**
 * Whether an hour somebody chose speaks for a shift on its date. A rule has no
 * weekday and was set against the template's usual hours, so an entry on other
 * hours is a day it cannot have meant, and that day goes by its own. Without
 * weekday rows there is only the one set of hours and the rule stands whatever
 * the entry says. A template not heard from yet could be either, and waiting
 * for it costs less than a shift clocked at the wrong hour.
 */
const ruleMeant = (
  template: ShiftTemplate | undefined,
  edge: 'start_time' | 'end_time',
  own: string,
): boolean =>
  template !== undefined
  && ((template.week_hours ?? []).length === 0 || own.slice(0, 5) === template[edge].slice(0, 5));

/** The chosen hour a running shift stops at, where the rule speaks for the hours it is on. */
export const stopHourFor = (
  rule: AutoStartRule | undefined,
  template: ShiftTemplate | undefined,
  plannedEnd: string,
): string | null =>
  rule?.stopAt != null && ruleMeant(template, 'end_time', plannedEnd) ? rule.stopAt : null;

/** The planned shifts that may still start, each with its window where the template opens by itself. */
export function plannedClocks(
  days: (CalendarDayData | undefined)[],
  templates: ShiftTemplate[],
): PlannedClock[] {
  return days.flatMap((day) => {
    if (day === undefined) return [];

    return (
      day.shifts
        // Worked, handed to somebody else, or told to stay shut: nothing to start.
        .filter((entry) => !entry.worked && !entry.needs_cover && !entry.auto_closed)
        .map((entry) => {
          const template = templates.find((known) => known.id === entry.shift_id);
          const unruled = !ruleMeant(template, 'start_time', entry.start_time);

          if (template === undefined || !template.auto_clock || template.archived) {
            return { shiftId: entry.shift_id, date: day.date, unruled };
          }

          const { opens, closes } = clockWindow(day.date, entry);

          return {
            shiftId: entry.shift_id,
            date: day.date,
            unruled,
            window: { opens: opens.getTime(), closes: closes.getTime() },
          };
        })
    );
  });
}

/** Whether an auto-start is due right now. */
export function dueAutoStart(input: {
  rules: AutoStartRule[];
  /** Today's planned-and-not-worked shifts, by template id, and last night's if it can still be running. */
  planned: PlannedClock[];
  /** A shift already running: nothing may start over it, ever. */
  liveRunning: boolean;
  /** Template ids already auto-started today, so a stop stays stopped. */
  firedToday: number[];
  /** The same for yesterday's date: a night shift stopped after midnight stays stopped too. */
  firedYesterday?: number[];
  /** Milliseconds since epoch. */
  now: number;
  /** 'YYYY-MM-DD', the phone's own day. */
  today: string;
}): AutoStartDecision | null {
  if (input.liveRunning) return null;

  const onToday = (plan: PlannedClock) => plan.date === undefined || plan.date === input.today;
  const heeds = (plan: PlannedClock) => plan.unruled !== true;
  const chosen = new Set<number>();

  for (const rule of input.rules) {
    if (rule.at === null || rule.at === undefined) continue;

    // Somebody's own hour outranks the template's window, due or not.
    chosen.add(rule.shiftId);

    if (
      !input.planned.some(
        (plan) => plan.shiftId === rule.shiftId && onToday(plan) && heeds(plan),
      )
    ) {
      continue;
    }

    // Fired once per day.
    if (input.firedToday.includes(rule.shiftId)) continue;

    const startAt = new Date(`${input.today}T${rule.at}:00`).getTime();

    if (Number.isNaN(startAt)) continue;

    // Due, and not absurdly stale: an auto-start discovered ten hours late is most of a shift long gone, and…
    const age = input.now - startAt;

    if (age < 0 || age > 4 * 60 * 60 * 1000) continue;

    return {
      shiftId: rule.shiftId,
      startedAt: new Date(startAt).toISOString(),
      date: input.today,
      ruled: true,
    };
  }

  for (const plan of input.planned) {
    if (plan.window === null || plan.window === undefined) continue;
    if (chosen.has(plan.shiftId) && heeds(plan)) continue;

    const fired = onToday(plan) ? input.firedToday : (input.firedYesterday ?? []);

    if (fired.includes(plan.shiftId)) continue;

    // The window is the whole shift rather than a few hours after its start:
    // a phone that comes out of the locker at nine still owes the clock from
    // eleven, and once the close has passed there is nothing left to open.
    if (input.now < plan.window.opens || input.now >= plan.window.closes) continue;

    return {
      shiftId: plan.shiftId,
      startedAt: new Date(plan.window.opens).toISOString(),
      date: plan.date ?? input.today,
      ruled: false,
    };
  }

  return null;
}

export interface AutoStopDecision {
  /** ISO instant the clock should read as the end — the chosen hour. */
  endsAt: string;
  /** Whether the end is the shift's own close, which a later edit of it moves, rather than an hour somebody chose. */
  closing: boolean;
  /** The forgotten-shift limit standing in for a close the plan cannot give, so the end is a guess. */
  atLimit?: boolean;
}

/** Whether the running shift should close itself now. */
export function dueAutoStop(input: {
  /** The rule for the running shift's template, where there is one. */
  stopAt: string | null | undefined;
  /** Milliseconds: when the running shift says it began. */
  startedMs: number;
  /** Milliseconds: the instant the plan says this shift ends. */
  plannedEndMs: number;
  /** Milliseconds: the shift's own close, where its template closes by itself. */
  closesMs?: number | null;
  /** Milliseconds since epoch. */
  now: number;
}): AutoStopDecision | null {
  const clock = input.stopAt;
  const chosen = clock !== null && clock !== undefined && clock !== '';

  // A plan over before the clock began: the hour was set against a shift that
  // is not this one, and the next time it comes round would be most of a day
  // away. This clock goes the way of any with no plan left to stop it.
  const missed = chosen && input.plannedEndMs <= input.startedMs;

  if (!chosen || missed) {
    const closes = input.closesMs ?? (missed ? input.plannedEndMs : null);

    if (closes === null) return null;

    // A clock started after its close has no plan left to stop it: closing it
    // there would record a shift that ended before it began. The limit keeps
    // it instead, and stops it at the limit, because when this was noticed is
    // not when the shift ended.
    if (closes <= input.startedMs) {
      const limit = input.startedMs + FORGOTTEN_AFTER;

      return input.now < limit
        ? null
        : { endsAt: new Date(limit).toISOString(), closing: true, atLimit: true };
    }

    if (input.now < closes) return null;

    return { endsAt: new Date(closes).toISOString(), closing: true };
  }

  const [hour, minute] = clock.split(':').map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const planned = new Date(input.plannedEndMs);
  const candidate = new Date(planned);

  candidate.setHours(hour, minute, 0, 0);

  // Nearest occurrence to the plan's end: 10:45 against an 11:00 end is the
  // same morning; against a 23:00 end it is the next.
  const half = 12 * 60 * 60 * 1000;

  if (candidate.getTime() - planned.getTime() > half) candidate.setDate(candidate.getDate() - 1);
  if (planned.getTime() - candidate.getTime() > half) candidate.setDate(candidate.getDate() + 1);

  // Never before it began: a stop earlier than the start is a rule somebody
  // set for tomorrow's version of this shift.
  while (candidate.getTime() <= input.startedMs) candidate.setDate(candidate.getDate() + 1);

  if (input.now < candidate.getTime()) return null;

  return { endsAt: candidate.toISOString(), closing: false };
}

/** Which templates started on which date. Dated by the entry, because a night shift outlives its day. */
export type FiredDays = Record<string, number[]>;

/** Two days back is as far as a shift can still be running, so older records are dropped. */
export const noteFired = (fired: FiredDays, shiftId: number, day: string): FiredDays => {
  const ids = fired[day] ?? [];
  const next = { ...fired, [day]: ids.includes(shiftId) ? ids : [...ids, shiftId] };
  const keep = Object.keys(next).sort().slice(-3);

  return Object.fromEntries(keep.map((key) => [key, next[key]]));
};

/** What storage holds, including the single-day record older installs wrote. */
export const readFired = (raw: string | null): FiredDays => {
  if (raw === null) return {};

  const stored = JSON.parse(raw);

  return Array.isArray(stored.shiftIds) ? { [stored.day]: stored.shiftIds } : stored;
};
