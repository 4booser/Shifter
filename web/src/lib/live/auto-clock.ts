import { shiftDays } from '../calendar/calendar-date';
import { CalendarDayData, DayShiftEntry, ShiftTemplate } from '../calendar/models';
import { atLocal, hoursOn, shiftWindow, startedAfterPlan } from '../calendar/shift-hours';
import type { LiveShift } from './live-shift';

/** What the clock should do by itself, decided from a moment and the store's contents. Nothing here touches either. */

/** Sixteen hours on the clock is a forgotten shift, not a worked one. */
export const FORGOTTEN_AFTER = 16 * 3600_000;

export interface ClockInput {
  /** Epoch milliseconds. */
  now: number;
  /** 'YYYY-MM-DD', the viewer's own. */
  today: string;
  days: ReadonlyMap<string, CalendarDayData>;
  templates: ShiftTemplate[];
  live: LiveShift | null;
}

export type ClockStep =
  | { kind: 'open'; template: ShiftTemplate; date: string; startedAt: number }
  | { kind: 'close'; template: ShiftTemplate; endAt: number }
  | { kind: 'follow'; startedAt: number }
  | { kind: 'drop' };

/** "HH:mm" of an instant, on this device's clock. */
export function clockOf(at: number): string {
  const stamp = new Date(at);

  return `${`${stamp.getHours()}`.padStart(2, '0')}:${`${stamp.getMinutes()}`.padStart(2, '0')}`;
}

const offClock = (edge: string | null, clock: string): boolean => edge !== null && edge !== clock;

/** A start somebody said, which outranks the clock's own, on a shift still planned as much as on a worked one: anything but this clock's own, or the plan a close copied in. Only a stamped entry can be holding that: where no close has been, the plan's own hour is as good a word as any. */
export function startSettled(entry: DayShiftEntry, live: LiveShift): boolean {
  return (
    offClock(entry.actual_start, clockOf(live.startedAt)) &&
    !(entry.auto_closed && entry.actual_start === entry.start_time)
  );
}

/** Discarded elsewhere while this clock counted on the close: told to keep out, with nothing left written on it. There is nothing to record and no close coming to end it, and running on it would hold up the next shift. */
export const thrownAway = (entry: DayShiftEntry, live: LiveShift): boolean =>
  live.autoClock === true &&
  entry.auto_closed &&
  !entry.worked &&
  entry.actual_start === null &&
  entry.actual_end === null;

/**
 * Where a running clock stands with its day. `free` is the close's to make.
 * `gone` has nothing left to record: the shift left the day, went out for
 * cover, was thrown away, or had its times settled by somebody. `told` is back
 * on Planned with the close told to keep out, which somebody answered, perhaps
 * by starting this very clock, and it is theirs to finish.
 */
export type ClockStanding = 'free' | 'gone' | 'told';

/** Out for cover, on the server's word or on a press still on its way to it. */
export const outForCover = (entry: DayShiftEntry): boolean => entry.needs_cover || entry.cover_asked === true;

/** Reads `shifts` as the day's whole list; undefined is a day nobody has read, which says nothing either way. */
export function clockStanding(live: LiveShift, shifts: DayShiftEntry[] | undefined): ClockStanding {
  const entry = shifts?.find((item) => item.shift_id === live.shiftId);

  // A clock started from the palette never had a placement to lose.
  if (entry === undefined) return shifts !== undefined && live.placed === true ? 'gone' : 'free';

  if (entry.needs_cover || (entry.worked && startSettled(entry, live)) || thrownAway(entry, live)) return 'gone';
  if (entry.worked && offClock(entry.actual_end, entry.end_time)) return 'gone';

  return entry.auto_closed && !entry.worked ? 'told' : 'free';
}

/** A placement's window as instants. A start past its plan has only the limit left to stop it, which is where the server stops it too. */
function windowOf(date: string, entry: DayShiftEntry): { opens: number; closes: number } {
  const late = startedAfterPlan(date, entry);

  if (late !== null) return { opens: atLocal(late), closes: atLocal(late) + FORGOTTEN_AFTER };

  const { opens, closes } = shiftWindow(date, entry);

  return { opens: atLocal(opens), closes: atLocal(closes) };
}

/** The running clock's window. The clock's own start stands in for an edge the day has not heard about yet. */
export function liveWindow(
  template: ShiftTemplate,
  live: LiveShift,
  entry: DayShiftEntry | undefined,
): { opens: number; closes: number } {
  if (entry !== undefined && startedAfterPlan(live.date, entry) !== null) return windowOf(live.date, entry);

  const plan = entry ?? hoursOn(template, live.date);
  const { opens, closes } = shiftWindow(live.date, {
    start_time: plan.start_time,
    end_time: plan.end_time,
    actual_start: entry?.actual_start ?? clockOf(live.startedAt),
    actual_end: entry?.actual_end,
  });

  return { opens: atLocal(opens), closes: atLocal(closes) };
}

/** When the plan itself has the shift over, the clock's start left out of it: a start past that end only pushes the end round to the next day, which would pass for a plan still to come. */
export function planCloses(
  template: ShiftTemplate,
  live: LiveShift,
  entry: DayShiftEntry | undefined,
): number {
  const plan = entry ?? hoursOn(template, live.date);
  const { closes } = shiftWindow(live.date, {
    start_time: plan.start_time,
    end_time: plan.end_time,
    actual_end: entry?.actual_end,
  });

  return atLocal(closes);
}

/** Whether the plan decides when this clock stops. One started after its shift should have ended has no plan left to follow, and the forgotten-shift limit keeps it. */
export function planEndsClock(
  template: ShiftTemplate,
  live: LiveShift,
  entry: DayShiftEntry | undefined,
): boolean {
  const standing = clockStanding(live, entry === undefined ? undefined : [entry]);

  return template.auto_clock && standing === 'free' && live.startedAt < planCloses(template, live, entry);
}

/** The planned shifts the clock looks after, on the two days a shift running now can belong to. */
function watched({ today, days, templates }: ClockInput) {
  return [shiftDays(today, -1), today].flatMap((date) =>
    (days.get(date)?.shifts ?? []).flatMap((entry) => {
      const template = templates.find((item) => item.id === entry.shift_id);

      if (
        template === undefined ||
        !template.auto_clock ||
        template.archived ||
        entry.worked ||
        outForCover(entry) ||
        entry.auto_closed
      )
        return [];

      return [{ date, entry, template, ...windowOf(date, entry) }];
    }),
  );
}

/** The next thing to do, or null when the clock is right as it stands. */
export function clockStep(input: ClockInput): ClockStep | null {
  const { now, days, templates, live } = input;

  if (live === null) {
    const due = watched(input)
      .filter(({ opens, closes }) => opens <= now && now < closes)
      .sort((one, two) => one.opens - two.opens)[0];

    return due === undefined
      ? null
      : { kind: 'open', template: due.template, date: due.date, startedAt: due.opens };
  }

  const template = templates.find((item) => item.id === live.shiftId);

  if (template === undefined) return null;

  const shifts = days.get(live.date)?.shifts;
  const entry = shifts?.find((item) => item.shift_id === live.shiftId);
  const { opens, closes } = liveWindow(template, live, entry);

  if (entry !== undefined && thrownAway(entry, live)) return { kind: 'drop' };

  // Compared by the minute: an edge has no seconds and a clock started by hand
  // has. A cleared edge is not this path's to read, because one still on its
  // way to the server looks exactly like it, and neither is the edge of a
  // close: that is the plan copied in, and the clock holds the real time. A
  // worked entry says its shift is over, not that the clock began elsewhere.
  if (
    entry?.actual_start != null &&
    !entry.auto_closed &&
    !entry.worked &&
    entry.actual_start !== clockOf(live.startedAt) &&
    opens !== live.startedAt
  ) {
    return { kind: 'follow', startedAt: opens };
  }

  // A plan over by the clock's own start is a window this clock never ran in:
  // nothing it could land on the day would be true, and the limit has it.
  if (template.auto_clock && closes <= now && planCloses(template, live, entry) > live.startedAt) {
    const standing = clockStanding(live, shifts);

    if (standing === 'free') return { kind: 'close', template, endAt: closes };

    return standing === 'gone' ? { kind: 'drop' } : null;
  }

  return null;
}

/** When the newest passed close of a planned shift fell, or null with none outstanding: the server is about to close it and the store has yet to hear. */
export function overdueSince(input: ClockInput): number | null {
  if (input.live !== null) return null;

  const passed = watched(input)
    .map(({ closes }) => closes)
    .filter((closes) => closes <= input.now);

  return passed.length === 0 ? null : Math.max(...passed);
}
