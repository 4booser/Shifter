import type { RosterShift } from '@/lib/api/roster';
import type { WeekHours } from '@/lib/calendar/models';
import { YearMonth, fromKey, keysBetween, monthBounds, todayKey } from '@/lib/calendar/calendar-date';
import { openOn } from '@/lib/roster/rules';

/** One column of a roster: a date and what the page has to know to draw it. */
export interface RosterDay {
  /** 'YYYY-MM-DD'. */
  key: string;
  dayOfMonth: number;
  /** Monday is 0, the order of WEEKDAY_LABELS. */
  weekday: number;
  weekend: boolean;
  isToday: boolean;
  /** The venue does not open that day. Never with no opening hours set. */
  closed: boolean;
}

/** yyyy-MM, the way the server names a month. */
export function monthKey({ year, month }: YearMonth): string {
  return `${year}-${`${month}`.padStart(2, '0')}`;
}

/** The month a yyyy-MM names. */
export function monthOfKey(key: string): YearMonth {
  const [year, month] = key.split('-').map(Number);

  return { year, month };
}

/** Every day of a month, the first to the last. */
export function rosterDays(month: YearMonth, today = todayKey(), venueHours: WeekHours[] = []): RosterDay[] {
  const { from, to } = monthBounds(`${monthKey(month)}-01`);

  return keysBetween(from, to).map((key) => {
    const weekday = (fromKey(key).getDay() + 6) % 7;

    return {
      key,
      dayOfMonth: Number(key.slice(8)),
      weekday,
      weekend: weekday >= 5,
      isToday: key === today,
      closed: !openOn(venueHours, key),
    };
  });
}

/** Where filling a month starts, as the server decides it: today in the current month, the 1st in a later one, and nowhere in one already over. */
export function fillFrom(month: YearMonth, today = todayKey()): string | null {
  const { from, to } = monthBounds(`${monthKey(month)}-01`);

  if (today > to) return null;

  return today > from ? today : from;
}

/** A month as weeks, Monday first, with null where the week runs into the months either side. */
export function monthWeeks(month: YearMonth): (string | null)[][] {
  const { from, to } = monthBounds(`${monthKey(month)}-01`);
  const keys: (string | null)[] = [
    ...Array.from({ length: (fromKey(from).getDay() + 6) % 7 }, () => null),
    ...keysBetween(from, to),
  ];

  while (keys.length % 7 !== 0) keys.push(null);

  return Array.from({ length: keys.length / 7 }, (_, week) => keys.slice(week * 7, week * 7 + 7));
}

/** A cell's address: one person, one date, which is also what the server keeps unique. */
export function cellKey(personId: number, date: string): string {
  return `${personId}:${date}`;
}

/** The shifts by cell, built once rather than searched for every cell of the table. */
export function cellsOf(shifts: RosterShift[]): Map<string, RosterShift> {
  return new Map(shifts.map((shift) => [cellKey(shift.person_id, shift.date), shift]));
}
