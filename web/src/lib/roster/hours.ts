import type { RosterShift } from '@/lib/api/roster';
import type { Brush } from './brushes';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A clock time as a crew writes it: 11, 11:30, 9:30. */
function clock(time: string): string {
  const hour = Number(time.slice(0, 2));
  const minutes = time.slice(3, 5);

  return minutes === '00' ? `${hour}` : `${hour}:${minutes}`;
}

/** Midnight closes a shift as 24, since 18-0 reads as nothing. */
const closing = (end: string): string => (end === '00:00' ? '24' : clock(end));

/** The hours as they sit in a cell: 11-22, 11:30-22. RosterRules.Compact writes the same on the public page. */
export function compactHours(start: string, end: string): string {
  return `${clock(start)}-${closing(end)}`;
}

/** The same hours on two lines, which is what lets every day of a month fit on one picture. */
export function stackedHours(start: string, end: string): [string, string] {
  return [clock(start), closing(end)];
}

/** Two clock times a shift can run between: they must differ, and an end at or before the start runs past midnight. */
export function validHours(start: string, end: string): boolean {
  return TIME.test(start) && TIME.test(end) && start !== end;
}

/** Whether a shift ends on the day after it starts, where it still belongs to its start date. */
export function runsOvernight(start: string, end: string): boolean {
  return validHours(start, end) && end < start;
}

/** Whether a shift is a day with no set time: they work, and nobody said when. */
export const isBare = (shift: Pick<RosterShift, 'start_time' | 'end_time'>): boolean =>
  shift.start_time === null || shift.end_time === null;

/** A shift's hours as a brush, or null for a day with no set time. */
export const pairOf = (shift: Pick<RosterShift, 'start_time' | 'end_time'>): Brush | null =>
  shift.start_time === null || shift.end_time === null ? null : { start: shift.start_time, end: shift.end_time };

/** Two cells' worth of hours alike: both no time, or the same pair. */
export const sameHours = (one: Brush | null, two: Brush | null): boolean =>
  one === null || two === null ? one === two : one.start === two.start && one.end === two.end;

/** What a cell says: its hours, or null for a day with no set time, which the cell shows as a dot. */
export function cellText(shift: Pick<RosterShift, 'start_time' | 'end_time'>): string | null {
  const pair = pairOf(shift);

  return pair === null ? null : compactHours(pair.start, pair.end);
}
