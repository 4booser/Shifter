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
    // A day with no set time has no hours to hold ready.
    if (shift.start_time === null || shift.end_time === null) continue;

    pairs.set(`${shift.start_time}-${shift.end_time}`, { start: shift.start_time, end: shift.end_time });
  }

  for (const brush of made) pairs.set(`${brush.start}-${brush.end}`, brush);

  return [...pairs.values()].sort(
    (one, two) => one.start.localeCompare(two.start) || one.end.localeCompare(two.end),
  );
}

/** What a click puts in a cell: the person's usual time, a day with no set time, or one pair of hours. */
export type Tool = { kind: 'usual' } | { kind: 'bare' } | { kind: 'hours'; brush: Brush };

export const USUAL: Tool = { kind: 'usual' };
export const BARE: Tool = { kind: 'bare' };

/** The same tool: one kind, and for hours the same pair. */
export const sameTool = (one: Tool | null, two: Tool): boolean =>
  one !== null &&
  one.kind === two.kind &&
  (one.kind !== 'hours' || two.kind !== 'hours' || sameBrush(one.brush, two.brush));

/** The tool a click uses. Until the owner picks one, the usual time when something gives somebody a time; otherwise none, and a click opens the cell. */
export const toolInUse = (picked: Tool | null | undefined, usualReady: boolean): Tool | null =>
  picked !== undefined ? picked : usualReady ? USUAL : null;

/** Pressing the tool in hand puts it down. */
export const toggleTool = (active: Tool | null, tool: Tool): Tool | null => (sameTool(active, tool) ? null : tool);
