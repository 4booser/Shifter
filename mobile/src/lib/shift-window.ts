import { dayKeyOf } from './calendar';
import { hoursOn, WeekHours } from './types';

/**
 * When one placed shift opens and closes on the wall clock.
 *
 * The server and the web carry this same rule, with the same vectors in their
 * tests: a phone watching a shift close and the server closing it have to
 * agree to the minute, so a change here is a change in all three. An overnight
 * shift belongs to the date it starts on.
 *
 * The arithmetic runs on a clock with no zones, as the server's does, and only
 * the answer becomes an instant: the twelve-hour tie must not move on the two
 * nights a year that are not twenty-four hours long.
 */
export interface ShiftWindow {
  opens: Date;
  closes: Date;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Sixteen hours on the clock is a forgotten shift, not a worked one: the line the web draws too. */
export const FORGOTTEN_AFTER = 16 * 3600_000;

const parse = (time: string | null | undefined, pattern: RegExp): number | null => {
  const match = pattern.exec(time ?? '');

  if (match === null) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
};

/** Minutes past midnight, or null for anything that is not a time. */
const minutesOf = (time: string | null | undefined): number | null =>
  parse(time, /^(\d{1,2}):(\d{2})/);

/** Whether a typed box holds a whole time rather than the start of one. */
export const isClock = (text: string): boolean => parse(text, /^(\d{1,2}):(\d{2})$/) !== null;

/** A whole time the way the server writes it: "9:30" is "09:30". */
export const tidyClock = (text: string): string => text.padStart(5, '0');

const wall = (date: string, minutes: number): number => {
  const [year, month, day] = date.split('-').map(Number);

  return Date.UTC(year, month - 1, day) + minutes * MINUTE;
};

/**
 * A wall clock as a real instant in the phone's zone, read as the server reads
 * it so neither calls a shift over first: a time the clocks skip lands just
 * past the gap, and a time they repeat is the later one.
 */
const instant = (at: number): Date => {
  const clock = new Date(at);
  const first = new Date(
    clock.getUTCFullYear(),
    clock.getUTCMonth(),
    clock.getUTCDate(),
    clock.getUTCHours(),
    clock.getUTCMinutes(),
  );
  const again = new Date(first.getTime() + 60 * MINUTE);

  return again.getHours() === clock.getUTCHours() && again.getMinutes() === clock.getUTCMinutes()
    ? again
    : first;
};

/** The occurrence of a clock time closest to the plan: 00:30 on a night shift is the one inside that night. */
const nearest = (minutes: number, anchor: number): number => {
  const found = Math.floor(anchor / DAY) * DAY + minutes * MINUTE;
  const off = found - anchor;

  // Exactly twelve hours either way is a tie, and the later one takes it.
  if (off <= -DAY / 2) return found + DAY;
  if (off > DAY / 2) return found - DAY;

  return found;
};

export const shiftWindow = (
  date: string,
  start: string,
  end: string,
  actualStart?: string | null,
  actualEnd?: string | null,
): ShiftWindow => {
  const from = minutesOf(start) ?? 0;
  const to = minutesOf(end) ?? 0;
  const planStart = wall(date, from);
  const planEnd = wall(date, to) + (to <= from ? DAY : 0);
  const began = minutesOf(actualStart);
  const ended = minutesOf(actualEnd);
  const opens = began === null ? planStart : nearest(began, planStart);
  const closes = ended === null ? planEnd : nearest(ended, planEnd);

  return { opens: instant(opens), closes: instant(closes <= opens ? closes + DAY : closes) };
};

/** A placed shift's window: its own hours, as placed, and whatever the clock really said. */
export const entryWindow = (
  date: string,
  entry: {
    start_time: string;
    end_time: string;
    actual_start: string | null;
    actual_end: string | null;
  },
): ShiftWindow =>
  shiftWindow(date, entry.start_time, entry.end_time, entry.actual_start, entry.actual_end);

/**
 * The moment a start with no end beside it fell after its plan was over, or
 * null for any other placement. The server draws the same line, so its stop and
 * a clock's land on one end. The shared rule reads a start against the plan's
 * start alone, which suits one typed a little early or late and nothing else:
 * on a plan of 09:00 to 17:00 it puts 22:00 on the evening before and pushes the
 * close round from 18:00. So this reads it against the whole plan, on whichever
 * side it sits closer to.
 */
export const startedAfterPlan = (
  date: string,
  start: string,
  end: string,
  actualStart: string | null | undefined,
  actualEnd: string | null | undefined,
): Date | null => {
  const began = minutesOf(actualStart);

  if (began === null || minutesOf(actualEnd) !== null) return null;

  const from = minutesOf(start) ?? 0;
  const to = minutesOf(end) ?? 0;
  const planStart = wall(date, from);
  const planEnd = wall(date, to) + (to <= from ? DAY : 0);
  const onClose = Math.floor(planEnd / DAY) * DAY + began * MINUTE;
  const after = onClose < planEnd ? onClose + DAY : onClose;
  const before = after - DAY;

  if (before >= planStart) return null;

  // Exactly between the two is a tie, and the later one takes it.
  return after - planEnd <= planStart - before ? instant(after) : null;
};

/** The window a clock goes by. A start past its plan has only the limit left to stop it, which is where the server stops it too. */
export const clockWindow = (date: string, entry: Parameters<typeof entryWindow>[1]): ShiftWindow => {
  const late = startedAfterPlan(date, entry.start_time, entry.end_time, entry.actual_start, entry.actual_end);

  return late === null
    ? entryWindow(date, entry)
    : { opens: late, closes: new Date(late.getTime() + FORGOTTEN_AFTER) };
};

interface Clocked {
  start_time: string;
  end_time: string;
  week_hours?: WeekHours[];
  auto_clock: boolean;
}

/**
 * Whether a shift put on a date counts as worked from the start, the line the
 * server draws for a painted stroke. With the clock on, a shift painted on
 * today stays planned until it is over.
 */
export const placedWorked = (template: Clocked, date: string, now = new Date()): boolean => {
  if (!template.auto_clock) return date <= dayKeyOf(now);

  const { start_time, end_time } = hoursOn(template, date);

  return shiftWindow(date, start_time, end_time).closes.getTime() <= now.getTime();
};

/** Whether Фактически belongs on a shift still only planned: it is under way, or due today. */
export const clockDue = (
  date: string,
  entry: Parameters<typeof entryWindow>[1],
  now = new Date(),
): boolean => {
  if (date === dayKeyOf(now)) return true;

  const { opens, closes } = entryWindow(date, entry);

  return opens.getTime() <= now.getTime() && now.getTime() < closes.getTime();
};

interface Answered {
  worked: boolean;
  auto_closed: boolean;
}

/** Back on Planned with the close told to keep out: a person's answer, and nothing automatic overrules it. */
export const toldNo = (entry: Answered | undefined): boolean =>
  entry?.auto_closed === true && !entry.worked;

/** Whether a clock on this entry will be ended by the close, which is what it may promise. */
export const closesItself = (
  template: { auto_clock: boolean; archived: boolean } | undefined,
  entry: Answered | undefined,
): boolean => template?.auto_clock === true && !template.archived && !toldNo(entry);

/**
 * Whether a clock counting on the close finds its shift discarded elsewhere:
 * told no, with nothing left written on it. A clock started by hand since that
 * answer does not count on the close, and is whoever started it's to finish.
 */
export const thrownAway = (
  entry: (Answered & { actual_start: string | null; actual_end: string | null }) | undefined,
  autoClock: boolean | undefined,
): boolean =>
  autoClock === true
  && toldNo(entry)
  && entry?.actual_start === null
  && entry.actual_end === null;

/**
 * Whether turning a worked shift back to Planned has to tell the close to keep
 * out of it. Past its close the job would only mark it worked again, so the
 * flip goes out as an answer; a shift still running closes as usual.
 */
export const flipNeedsAnswer = (
  template: { auto_clock: boolean; archived: boolean } | undefined,
  date: string,
  entry: Parameters<typeof entryWindow>[1],
  now = new Date(),
): boolean =>
  template !== undefined
  && template.auto_clock
  && !template.archived
  && entryWindow(date, entry).closes.getTime() <= now.getTime();
