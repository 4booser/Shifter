import { api, ApiError } from '@/lib/api';
import { clockOf } from '@/lib/calendar';
import { inTurn, tellDay } from '@/lib/day-writes';
import { shiftWindow, thrownAway, toldNo } from '@/lib/shift-window';
import { CalendarDayData, DaySave, DaysResponse, DayShiftEntry, toSavePayload } from '@/lib/types';
import { LiveShift, breakSeconds } from '@/store/live';
import { useOutbox } from '@/store/outbox';

/** Writing what a live clock did into its day. */

/**
 * Reads a day, changes it, writes it back. `change` answers false to leave the
 * day as it is. A day that moved between the read and the write, as a server
 * closing the shift would move it, is read once more rather than given up on:
 * nobody is looking at this write to notice it failed.
 */
const rewriteDay = (
  date: string,
  change: (payload: DaySave, day: CalendarDayData | undefined) => boolean,
): Promise<boolean> =>
  inTurn(date, async () => {
    // Whatever is held for this day first: this write would move the version
    // out from under it.
    await useOutbox.getState().settle(date);

    for (let attempt = 0; ; attempt += 1) {
      const summary = await api<DaysResponse>(`/shifter/v1/days?from=${date}&to=${date}`);
      const day: CalendarDayData | undefined = summary.days[0];
      const payload = toSavePayload(day);

      if (!change(payload, day)) return false;

      try {
        const answer = await api<CalendarDayData>(`/shifter/v1/days/${date}`, {
          method: 'PUT',
          body: payload,
        });

        tellDay(date, answer);

        return true;
      } catch (caught) {
        if (attempt > 0 || !(caught instanceof ApiError) || caught.status !== 409) throw caught;
      }
    }
  });

const offClock = (edge: string | null, clock: string): boolean =>
  edge !== null && edge.slice(0, 5) !== clock.slice(0, 5);

/** A start somebody said, worked or still planned: anything but this clock's own, or the plan a close copied in. Only a stamped entry can be holding that: where no close has been, the plan's own hour is as good a word as any. */
const startSaid = (placed: DayShiftEntry, live: LiveShift): boolean =>
  offClock(placed.actual_start, clockOf(new Date(live.startedAt)))
  && !(placed.auto_closed === true && !offClock(placed.actual_start, placed.start_time));

/** The start a finished clock goes by: what somebody said over what it counted itself. */
const startOf = (live: LiveShift, placed: DayShiftEntry | undefined) =>
  placed !== undefined && startSaid(placed, live)
    ? placed.actual_start
    : clockOf(new Date(live.startedAt));

/** What a finished clock says about its shift. */
const stampOf = (
  live: LiveShift,
  ended: Date,
  placed: DayShiftEntry | undefined,
  closing: boolean,
) => {
  const paused = breakSeconds(live, ended.getTime());

  return {
    actual_start: startOf(live, placed),
    actual_end: clockOf(ended),
    worked: true,
    // Minutes, because that is what the server prices in. No pause of its own
    // says nothing about the break, so the placement's stands: the server
    // would read a null as the template's, and a stray tap is not a break.
    ...(paused > 30 ? { break_minutes: Math.round(paused / 60) } : {}),
    // Nobody saw this happen, so the entry says so, and a save from a screen
    // that has not heard of it cannot undo it by accident.
    ...(closing ? { auto_closed: true } : {}),
  };
};

/** What came of asking a finished clock to write itself down. */
export type FinishOutcome =
  /** Its shift is recorded. */
  | 'written'
  /** The shift is not the clock's to record any more: off the day, handed over, discarded, or its times settled. The clock stops. */
  | 'gone'
  /** The day says the shift is not over after all, or to leave it alone. The clock stays. */
  | 'wait';

export async function writeFinishedShift(input: {
  live: LiveShift;
  /** ISO instant of the end. Defaults to now. */
  endAt?: string;
  /** The shift closing itself rather than somebody finishing it, so the day it reads has the last word. */
  closing?: boolean;
  /** Closing at an hour somebody chose, which stands wherever the day says the shift ends. */
  atHour?: boolean;
  /** The forgotten-shift limit closing it. `endAt` is a guess that never overrules the day: a worked entry counts as finished, and the clock stops with nothing written. */
  atLimit?: boolean;
}): Promise<FinishOutcome> {
  const { live, closing = false, atHour = false, atLimit = false } = input;
  let outcome: FinishOutcome = 'written';

  await rewriteDay(live.date, (payload, day) => {
    const entry = payload.shifts.find((row) => row.shift_id === live.shiftId);
    const placed = day?.shifts.find((row) => row.shift_id === live.shiftId);
    let ended = input.endAt === undefined ? new Date() : new Date(input.endAt);

    if (closing) {
      // Off the day or handed to somebody else, nothing is left to record. A
      // worked entry whose times moved off the plan was settled by a person
      // or another clock, and this clock, stale by now, has no word on it.
      if (
        placed === undefined
        || placed.needs_cover
        || (placed.worked
          && (atLimit || startSaid(placed, live) || offClock(placed.actual_end, placed.end_time)))
      ) {
        outcome = 'gone';

        return false;
      }

      // Flipped back to Planned, or discarded on another device: a person's
      // answer, and the close is not there to overrule it. Discarded, the
      // clock has nothing left to do, and running on it would hold up the
      // next shift.
      if (toldNo(placed)) {
        outcome = thrownAway(placed, live.autoClock) ? 'gone' : 'wait';

        return false;
      }

      if (!atHour) {
        const { closes } = shiftWindow(
          live.date,
          placed.start_time,
          placed.end_time,
          startOf(live, placed),
          placed.actual_end,
        );
        const plan = shiftWindow(
          live.date,
          placed.start_time,
          placed.end_time,
          null,
          placed.actual_end,
        );
        // A plan over before this clock began has only a wrapped close to give,
        // and no shift ends there: that one is the limit's. Weighed on the
        // clock's own moment, because a window built from its start can land a
        // day early, where the plan looks still to come. An end somebody said
        // on the day since is a close again, and beats the limit's guess.
        const planned = plan.closes.getTime() > new Date(live.startedAt).getTime();

        // A later end typed since this phone last looked means the shift is
        // simply not over yet.
        if (planned ? Date.now() < closes.getTime() : !atLimit) {
          outcome = 'wait';

          return false;
        }

        if (planned) ended = closes;
      }
    }

    const stamp = stampOf(live, ended, placed, closing);

    if (entry === undefined) {
      payload.shifts.push({
        shift_id: live.shiftId,
        needs_cover: false,
        revenue: null,
        break_minutes: null,
        ...stamp,
      });
    } else {
      // Over whatever is there, the server's own close included: its edges are
      // copied from the plan and these are the ones the clock really measured.
      Object.assign(entry, stamp);
    }

    return true;
  });

  return outcome;
}

/** A clock started by hand tells the day straight away, so other devices and the server's close know the real start. */
export async function writeStartedShift(live: LiveShift): Promise<void> {
  await rewriteDay(live.date, (payload) => {
    const entry = payload.shifts.find((row) => row.shift_id === live.shiftId);

    if (entry === undefined) return false;

    entry.actual_start = clockOf(new Date(live.startedAt));

    return true;
  });
}

/**
 * A running clock thrown away. On a shift that closes itself the entry goes
 * back to Planned with the close told to keep out, so it neither reopens nor
 * gets recorded as worked. Otherwise only the start the clock wrote comes off:
 * nothing else on the day knows there ever was a clock. An entry already
 * worked is not the clock's to undo, however it got there: the clock just
 * stops, and the person can still flip the shift on its day.
 */
export async function writeDiscardedShift(live: LiveShift): Promise<void> {
  await rewriteDay(live.date, (payload) => {
    const entry = payload.shifts.find((row) => row.shift_id === live.shiftId);

    if (entry === undefined || entry.worked) return false;

    if (live.autoClock === true) {
      Object.assign(entry, {
        worked: false,
        actual_start: null,
        actual_end: null,
        auto_closed: true,
      });

      return true;
    }

    if (entry.actual_start !== clockOf(new Date(live.startedAt))) return false;

    entry.actual_start = null;

    return true;
  });
}
