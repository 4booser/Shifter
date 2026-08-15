/** A calendar month. Deliberately not a Date: a month has no instant. */
export interface YearMonth {
  year: number;
  /** 1-12, not the 0-based month of Date. */
  month: number;
}

export interface CalendarDay {
  /** 'YYYY-MM-DD' — stable, comparable, and usable as a Map key. */
  key: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

/** Monday-first, matching how shift rotas are usually written. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LABELS_SUNDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function currentMonth(): YearMonth {
  const now = new Date();

  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  // Date normalises overflow for us: month 13 rolls into January of year + 1.
  const shifted = new Date(year, month - 1 + delta, 1);

  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 };
}

export function monthLabel({ year, month }: YearMonth): string {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));
}

export function todayKey(): string {
  return toKey(new Date());
}

export function formatDayLabel(key: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(fromKey(key));
}

/**
 * Always six weeks, so the grid keeps its height when the month changes and
 * the layout below it does not jump.
 */
export function buildMonthGrid(
  { year, month }: YearMonth,
  mondayFirst = true,
): CalendarDay[][] {
  const firstOfMonth = new Date(year, month - 1, 1);

  // getDay() is Sunday-based; shift it when the week starts on Monday.
  const offset = mondayFirst
    ? (firstOfMonth.getDay() + 6) % 7
    : firstOfMonth.getDay();
  const today = todayKey();

  const weeks: CalendarDay[][] = [];

  for (let week = 0; week < 6; week++) {
    const days: CalendarDay[] = [];

    for (let weekday = 0; weekday < 7; weekday++) {
      // Day-of-month arithmetic rolls over month and year boundaries by itself.
      const date = new Date(year, month - 1, 1 - offset + week * 7 + weekday);
      const key = toKey(date);

      days.push({
        key,
        dayOfMonth: date.getDate(),
        inCurrentMonth: date.getMonth() === month - 1,
        isToday: key === today,
      });
    }

    weeks.push(days);
  }

  return weeks;
}

/**
 * Built from local components on purpose. toISOString() converts to UTC first,
 * which turns the 1st into the 31st for anyone east of Greenwich.
 */
function toKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Parsed field by field for the same reason: new Date('2026-03-14') is UTC. */
export function fromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);

  return new Date(year, month - 1, day);
}

export function keyOf(date: Date): string {
  return toKey(date);
}

/** Every key from one end to the other, inclusive, in ascending order. */
export function keysBetween(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const cursor = fromKey(from);
  const last = fromKey(to);
  const keys: string[] = [];

  while (cursor <= last) {
    keys.push(toKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

/**
 * A rotating rota: `on` days worked, then `off` days free, repeating from the
 * start date for the given number of days.
 */
export function rotationKeys(start: string, on: number, off: number, span: number): string[] {
  const cycle = on + off;

  if (on < 1 || off < 0 || cycle < 1) return [];

  const cursor = fromKey(start);
  const keys: string[] = [];

  for (let index = 0; index < span; index++) {
    if (index % cycle < on) keys.push(toKey(cursor));

    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

/** First and last day of the month a key falls in. */
export function monthBounds(key: string): { from: string; to: string } {
  const date = fromKey(key);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return { from: toKey(first), to: toKey(last) };
}

/** Monday-to-Sunday week containing the key. */
export function weekBounds(key: string): { from: string; to: string } {
  const date = fromKey(key);
  const offset = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

  return { from: toKey(monday), to: toKey(sunday) };
}

/** Steps a key by whole days, letting Date roll month and year boundaries. */
export function shiftDays(key: string, days: number): string {
  const date = fromKey(key);

  date.setDate(date.getDate() + days);

  return toKey(date);
}

/** The single week containing a key, as one row of the same cell shape. */
export function buildWeekGrid(key: string, mondayFirst = true): CalendarDay[][] {
  const date = fromKey(key);
  const offset = mondayFirst ? (date.getDay() + 6) % 7 : date.getDay();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  const today = todayKey();
  const month = date.getMonth();

  const days: CalendarDay[] = [];

  for (let index = 0; index < 7; index++) {
    const cell = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const cellKey = toKey(cell);

    days.push({
      key: cellKey,
      dayOfMonth: cell.getDate(),
      inCurrentMonth: cell.getMonth() === month,
      isToday: cellKey === today,
    });
  }

  return [days];
}

/** Twelve compact months, for scanning a year at a glance. */
export function buildYearGrid(year: number, mondayFirst = true): {
  month: number;
  label: string;
  weeks: CalendarDay[][];
}[] {
  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: new Intl.DateTimeFormat('en', { month: 'short' })
      .format(new Date(year, index, 1)),
    weeks: buildMonthGrid({ year, month: index + 1 }, mondayFirst),
  }));
}
