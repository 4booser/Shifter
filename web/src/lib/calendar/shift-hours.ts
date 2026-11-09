import { fromKey, shiftDays, todayKey } from './calendar-date';
import { ShiftTemplate, WeekHours } from './models';

/** When a shift runs: a template's hours on a given date, and the window a placed shift opens and closes in. */

const DAY = 24 * 60;
const HALF_DAY = 12 * 60;

const minutesOf = (time: string): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const pad = (value: number): string => `${value}`.padStart(2, '0');

/** ISO, the numbering week_hours is written in: Monday is 1, Sunday is 7. */
export const isoWeekday = (key: string): number => ((fromKey(key).getDay() + 6) % 7) + 1;

export interface DayHours {
  /** "HH:mm". */
  start_time: string;
  end_time: string;
  /** Paid hours, the break already out. */
  hours: number;
}

/** Paid hours of a span, rounded the way the server rounds them. */
const paidHours = (start: string, end: string, breakMinutes: number): number => {
  const span = (minutesOf(end) - minutesOf(start) + DAY) % DAY;

  return Math.round((Math.max(0, span - breakMinutes) / 60) * 100) / 100;
};

/** What a template runs on one date: its weekday's own hours where it has them, its usual ones otherwise. */
export function hoursOn(template: ShiftTemplate, key: string): DayHours {
  const weekday = isoWeekday(key);
  const own = template.week_hours.find((entry) => entry.weekday === weekday);

  if (own === undefined) {
    return { start_time: template.start_time, end_time: template.end_time, hours: template.hours };
  }

  return {
    start_time: own.start_time,
    end_time: own.end_time,
    hours: paidHours(own.start_time, own.end_time, template.break_minutes),
  };
}

/** A template's usual time for a label, marked where it does not hold every day. */
export function hoursLabel(template: ShiftTemplate, t: (key: string) => string): string {
  const usual = `${template.start_time}–${template.end_time}`;

  return template.week_hours.length === 0 ? usual : `${usual} · ${t('varies by day')}`;
}

/** One row of the weekday editor: several days sharing one set of hours. */
export interface WeekRow {
  weekdays: number[];
  /** "HH:mm". */
  start: string;
  end: string;
}

/** Stored hours as rows: identical times share a row, earliest weekday first. */
export function rowsOf(hours: WeekHours[]): WeekRow[] {
  const rows = new Map<string, WeekRow>();

  for (const entry of [...hours].sort((one, two) => one.weekday - two.weekday)) {
    const shared = `${entry.start_time}-${entry.end_time}`;
    const row = rows.get(shared);

    if (row === undefined) {
      rows.set(shared, { weekdays: [entry.weekday], start: entry.start_time, end: entry.end_time });
    } else {
      row.weekdays.push(entry.weekday);
    }
  }

  return [...rows.values()];
}

/** Rows back as the flat list the server stores; a row with no days says nothing. */
export function flatOf(rows: WeekRow[]): WeekHours[] {
  return rows
    .flatMap((row) =>
      row.weekdays.map((weekday) => ({ weekday, start_time: row.start, end_time: row.end })),
    )
    .sort((one, two) => one.weekday - two.weekday);
}

/** Whether a row was left with no days, which saved as it stands would vanish without a word and leave those days on the main time. */
export const hasEmptyRow = (rows: WeekRow[]): boolean => rows.some((row) => row.weekdays.length === 0);

/** Flips a weekday in one row. A day runs one set of hours, so picking it here takes it from any other row. */
export function toggleWeekday(rows: WeekRow[], index: number, weekday: number): WeekRow[] {
  return rows.map((row, at) => {
    if (at !== index) return { ...row, weekdays: row.weekdays.filter((day) => day !== weekday) };

    return row.weekdays.includes(weekday)
      ? { ...row, weekdays: row.weekdays.filter((day) => day !== weekday) }
      : { ...row, weekdays: [...row.weekdays, weekday].sort((one, two) => one - two) };
  });
}

/** What the time rule needs of a placed shift. */
export interface ShiftPlan {
  start_time: string;
  end_time: string;
  actual_start?: string | null;
  actual_end?: string | null;
}

/** Wall-clock edges as 'YYYY-MM-DDTHH:mm', comparable as text. */
export interface ShiftWindow {
  opens: string;
  closes: string;
}

/** The occurrence of a clock time closest to the plan: an edge typed as 00:30 on a night shift means the 00:30 inside that night. */
const nearest = (time: string, anchor: number): number => {
  const found = Math.floor(anchor / DAY) * DAY + minutesOf(time);
  const off = found - anchor;

  // Exactly twelve hours either way is a tie, and the later one takes it.
  if (off <= -HALF_DAY) return found + DAY;
  if (off > HALF_DAY) return found - DAY;

  return found;
};

/** Minutes from midnight of a date, as wall-clock text; a day and a half on lands on the right date. */
const wallAt = (date: string, minutes: number): string => {
  const days = Math.floor(minutes / DAY);
  const within = minutes - days * DAY;

  return `${shiftDays(date, days)}T${pad(Math.floor(within / 60))}:${pad(within % 60)}`;
};

// The server and the phone carry this same rule, with the same vectors in
// their tests: a client watching a shift close and the server closing it have
// to agree to the minute, so a change here is a change in all three.
/** When a shift placed on a date opens and closes. An overnight shift belongs to the date it starts on. */
export function shiftWindow(date: string, plan: ShiftPlan): ShiftWindow {
  const planStart = minutesOf(plan.start_time);
  const planEnd = minutesOf(plan.end_time) + (minutesOf(plan.end_time) <= planStart ? DAY : 0);

  const opens = plan.actual_start == null ? planStart : nearest(plan.actual_start, planStart);
  const ends = plan.actual_end == null ? planEnd : nearest(plan.actual_end, planEnd);

  return { opens: wallAt(date, opens), closes: wallAt(date, ends <= opens ? ends + DAY : ends) };
}

/** The moment a start with no end beside it fell after its plan was over, or null for any other placement. The server draws the same line, so its stop and a clock's land on one end: the shared rule above reads a start against the plan's start alone, which puts 22:00 on a plan of 09:00 to 17:00 on the evening before and pushes the close round from 18:00. */
export function startedAfterPlan(date: string, plan: ShiftPlan): string | null {
  if (plan.actual_start == null || plan.actual_end != null) return null;

  const planStart = minutesOf(plan.start_time);
  const planEnd = minutesOf(plan.end_time) + (minutesOf(plan.end_time) <= planStart ? DAY : 0);
  const onClose = Math.floor(planEnd / DAY) * DAY + minutesOf(plan.actual_start);
  const after = onClose < planEnd ? onClose + DAY : onClose;
  const before = after - DAY;

  if (before >= planStart) return null;

  // Exactly between the two is a tie, and the later one takes it.
  return after - planEnd <= planStart - before ? wallAt(date, after) : null;
}

/** A wall-clock edge as an instant here. Read as the server reads it, so neither calls a shift over first: a time the clocks skip lands past the jump, and a time they repeat is the later one. */
export function atLocal(wall: string): number {
  const [date, time] = wall.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  const first = new Date(year, month - 1, day, hours, minutes).getTime();
  const again = new Date(first + 3_600_000);

  return again.getHours() === hours && again.getMinutes() === minutes ? again.getTime() : first;
}

/** Matches the server's rule: a shift that closes itself stays planned until it is over; any other is worked from its date on. */
export function workedByDefault(template: ShiftTemplate, key: string, now: number): boolean {
  if (!template.auto_clock) return key <= todayKey();

  return atLocal(shiftWindow(key, hoursOn(template, key)).closes) <= now;
}
