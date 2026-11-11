import type { RosterShift } from '@/lib/api/roster';
import { YearMonth, fromKey, keysBetween, monthBounds, todayKey } from '@/lib/calendar/calendar-date';

/** One column of a roster: a date and what the page has to know to draw it. */
export interface RosterDay {
  /** 'YYYY-MM-DD'. */
  key: string;
  dayOfMonth: number;
  /** Monday is 0, the order of WEEKDAY_LABELS. */
  weekday: number;
  weekend: boolean;
  isToday: boolean;
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
export function rosterDays(month: YearMonth, today = todayKey()): RosterDay[] {
  const { from, to } = monthBounds(`${monthKey(month)}-01`);

  return keysBetween(from, to).map((key) => {
    const weekday = (fromKey(key).getDay() + 6) % 7;

    return {
      key,
      dayOfMonth: Number(key.slice(8)),
      weekday,
      weekend: weekday >= 5,
      isToday: key === today,
    };
  });
}

/** A cell's address: one person, one date, which is also what the server keeps unique. */
export function cellKey(personId: number, date: string): string {
  return `${personId}:${date}`;
}

/** The shifts by cell, built once rather than searched for every cell of the table. */
export function cellsOf(shifts: RosterShift[]): Map<string, RosterShift> {
  return new Map(shifts.map((shift) => [cellKey(shift.person_id, shift.date), shift]));
}
