import type { RosterShift } from '@/lib/api/roster';

/** A pair of hours held ready, so a month is stamped rather than typed. */
export interface Brush {
  /** "HH:mm". */
  start: string;
  end: string;
}

export const sameBrush = (one: Brush, two: Brush): boolean => one.start === two.start && one.end === two.end;

/** The pairs this month already uses and the ones made by hand, each once, in clock order. Not by use: a brush that climbed the list as it was stamped would move out from under the pointer. */
export function brushesOf(shifts: RosterShift[], made: Brush[] = []): Brush[] {
  const pairs = new Map<string, Brush>();

  for (const shift of shifts) {
    pairs.set(`${shift.start_time}-${shift.end_time}`, { start: shift.start_time, end: shift.end_time });
  }

  for (const brush of made) pairs.set(`${brush.start}-${brush.end}`, brush);

  return [...pairs.values()].sort(
    (one, two) => one.start.localeCompare(two.start) || one.end.localeCompare(two.end),
  );
}
