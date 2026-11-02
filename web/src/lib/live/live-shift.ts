'use client';

import { create } from 'zustand';

import { todayKey } from '../calendar/calendar-date';
import { DayShiftEntry, DaySave, ShiftTemplate } from '../calendar/models';
import { hoursOn } from '../calendar/shift-hours';
import { rewriteDay, useCalendar } from '../store/calendar';
import { FORGOTTEN_AFTER, clockOf, clockStanding, liveWindow, outForCover, planCloses, startSettled } from './auto-clock';
import { remember } from '@/lib/api/http';

/** A shift being worked right now. */

const STORAGE_KEY = 'shifter.liveShift';

export interface LiveShift {
  shiftId: number;
  /** The calendar day the shift belongs to — the day it started. */
  date: string;
  /** Epoch milliseconds. */
  startedAt: number;
  /** Unpaid time already banked by finished pauses, in milliseconds. */
  breakMs: number;
  /** Epoch of the pause running right now; null while on the clock. */
  pausedAt: number | null;
  /** When a timed break is due to end, in epoch milliseconds. */
  breakUntil?: number | null;
  /** Whether the day held this shift when the clock started. One that never did has no placement to lose. */
  placed?: boolean;
  /** Whether it counted on the close when it started. One started by hand on a shift told to keep out does not. */
  autoClock?: boolean;
}

interface LiveState {
  live: LiveShift | null;
}

function read(): LiveShift | null {
  if (typeof localStorage === 'undefined') return null;

  const raw = localStorage.getItem(STORAGE_KEY);

  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as { shiftId: number; date: string; startedAt: number } & Partial<LiveShift>;

    // A shift forgotten for over a day is stale, not live.
    if (Date.now() - parsed.startedAt > 26 * 3600_000) {
      localStorage.removeItem(STORAGE_KEY);

      return null;
    }

    // A shift stored by the pre-pause build gains the fields it lacked.
    return {
      shiftId: parsed.shiftId,
      date: parsed.date,
      startedAt: parsed.startedAt,
      breakMs: parsed.breakMs ?? 0,
      pausedAt: parsed.pausedAt ?? null,
      breakUntil: parsed.breakUntil ?? null,
      placed: parsed.placed ?? false,
      autoClock: parsed.autoClock ?? false,
    };
  } catch {
    return null;
  }
}

export const useLive = create<LiveState>(() => ({ live: read() }));

function write(live: LiveShift | null): void {
  if (live === null) localStorage.removeItem(STORAGE_KEY);
  else remember(STORAGE_KEY, JSON.stringify(live));

  useLive.setState({ live });
}

/** Takes in what another tab did to the clock: two tabs each closing it on their own memory of it would undo a discard. */
export function syncLive(): void {
  useLive.setState({ live: read() });
}

/** The placement a running clock belongs to, where the day is held. */
export function liveEntry(live: LiveShift): DayShiftEntry | undefined {
  return useCalendar
    .getState()
    .days.get(live.date)
    ?.shifts.find((entry) => entry.shift_id === live.shiftId);
}

/** Changes one placement on a fresh read of its day, for the writes the clock makes on its own. `change` answers null to leave the day as it is. */
async function amend(
  date: string,
  shiftId: number,
  change: (entry: DaySave['shifts'][number]) => DaySave['shifts'][number] | null,
): Promise<void> {
  await rewriteDay(date, (payload) => {
    const entry = payload.shifts.find((item) => item.shift_id === shiftId);
    const changed = entry === undefined ? null : change(entry);

    if (changed === null) return false;

    payload.shifts = payload.shifts.map((item) => (item === entry ? changed : item));

    return true;
  });
}

export interface StartAt {
  /** The day the shift belongs to, which for a night shift can be yesterday. */
  date?: string;
  /** Where the clock starts, for a shift that opened before anybody looked. Left out, it starts now and by hand. */
  startedAt?: number;
}

export function startLiveShift(template: ShiftTemplate, at: StartAt = {}): void {
  const date = at.date ?? todayKey();
  const startedAt = at.startedAt ?? Date.now();
  const placed = useCalendar.getState().days.get(date)?.shifts.find((entry) => entry.shift_id === template.id);

  // Out for cover it is not this person's to start, and no close would ever
  // record a clock left running on it.
  if (placed !== undefined && outForCover(placed)) return;

  write({
    shiftId: template.id,
    date,
    startedAt,
    breakMs: 0,
    pausedAt: null,
    breakUntil: null,
    placed: placed !== undefined,
    autoClock: template.auto_clock && !(placed?.auto_closed === true && !placed.worked),
  });

  // A start by hand is a fact the plan cannot know: written straight away,
  // alone, so the other devices and the server's close have the real time.
  if (at.startedAt === undefined) {
    void amend(date, template.id, (entry) => ({ ...entry, actual_start: clockOf(startedAt) }));
  }
}

/** Moves a running clock's start, when the day says it began at another time. */
export function moveLiveShift(startedAt: number): void {
  const live = useLive.getState().live;

  if (live !== null) write({ ...live, startedAt });
}

/** Stops the clock and records nothing: what it was timing is no longer there to record. */
export function dropLiveShift(): void {
  write(null);
}

/** The kettle break: the clock stops, the shift does not. */
export function pauseLiveShift(): void {
  const live = useLive.getState().live;

  if (live === null || live.pausedAt !== null) return;

  write({ ...live, pausedAt: Date.now(), breakUntil: null });
}

/** A break of a stated length, counted down. */
export function startTimedBreak(minutes: number): void {
  const live = useLive.getState().live;

  if (live === null || minutes <= 0) return;

  const now = Date.now();

  write({
    ...live,
    // Already paused stays paused: restarting the pause would give back the
    // minutes already taken, which is the wrong direction to be wrong in.
    pausedAt: live.pausedAt ?? now,
    breakUntil: now + minutes * 60_000,
  });
}

/** Milliseconds left of a timed break; null when there is not one running. */
export function breakLeft(live: LiveShift | null, now: number): number | null {
  if (live?.pausedAt == null || live.breakUntil == null) return null;

  return live.breakUntil - now;
}

export function resumeLiveShift(): void {
  const live = useLive.getState().live;

  if (live === null || live.pausedAt === null) return;

  write({
    ...live,
    breakMs: live.breakMs + (Date.now() - live.pausedAt),
    pausedAt: null,
    breakUntil: null,
  });
}

/** Milliseconds actually on the clock, pauses out. */
export function workedMs(live: LiveShift, now: number): number {
  const paused = live.breakMs + (live.pausedAt === null ? 0 : now - live.pausedAt);

  return Math.max(0, now - live.startedAt - paused);
}

/** Lays a change on a placement at once, ahead of the save carrying it, so the clock watching the store does not act on the old one meanwhile. */
function patchEntry(date: string, shiftId: number, change: Partial<DayShiftEntry>): void {
  useCalendar.setState((state) => {
    const day = state.days.get(date);

    if (day === undefined) return state;

    return {
      days: new Map(state.days).set(date, {
        ...day,
        shifts: day.shifts.map((entry) => (entry.shift_id === shiftId ? { ...entry, ...change } : entry)),
      }),
    };
  });
}

/** Hands a running shift over: the clock stops, nothing of it is recorded, and the start it wrote comes off the day. */
export function coverLiveShift(): void {
  const live = useLive.getState().live;

  if (live === null) return;

  write(null);

  const started = clockOf(live.startedAt);

  // On the store at once, or the next look opens the clock again meanwhile.
  patchEntry(live.date, live.shiftId, { cover_asked: true });
  void amend(live.date, live.shiftId, (entry) =>
    entry.worked
      ? null
      : { ...entry, needs_cover: true, actual_start: entry.actual_start === started ? null : entry.actual_start },
  );
}

/**
 * Throws the clock away, and takes back what it wrote on the day. On a shift
 * that closes itself the entry is stamped, so it neither reopens nor gets closed
 * as worked by the server. A shift already worked is not the clock's to undo,
 * however it got there: the clock just stops, and it can still be flipped on its
 * day. That can only be known from the server, which may have closed the shift
 * under a stale screen, so a press it cannot answer writes nothing. Where the
 * shift closes itself the clock then stays, since the close would still mark it
 * worked, and false says so; better that than to pretend it stopped.
 */
export async function cancelLiveShift(): Promise<boolean> {
  const live = useLive.getState().live;

  if (live === null) return true;

  const closesItself = useCalendar.getState().templates.find((item) => item.id === live.shiftId)?.auto_clock === true;
  const started = clockOf(live.startedAt);

  const outcome = await rewriteDay(
    live.date,
    (payload) => {
      const entry = payload.shifts.find((item) => item.shift_id === live.shiftId);

      if (entry === undefined || entry.worked) return false;

      if (closesItself) {
        Object.assign(entry, { worked: false, actual_start: null, actual_end: null, auto_closed: true });

        return true;
      }

      // Only the edge it wrote: a time somebody typed in is still theirs.
      if (entry.actual_start !== started) return false;

      entry.actual_start = null;

      return true;
    },
    { freshOnly: true },
  );

  if (closesItself && outcome !== 'landed' && outcome !== 'queued' && outcome !== 'left') return false;

  write(null);

  return true;
}

/** What the clock-out hands to whoever wants to celebrate it. */
export interface ShiftDone {
  shiftId: number;
  date: string;
  name: string;
  /** Milliseconds actually on the clock. */
  elapsed: number;
  /** What the server priced the shift at, once the day came back. */
  earned: number;
  hours: number;
}

/** Fired on window after a live shift lands on its day. */
export const SHIFT_DONE_EVENT = 'shifter:shift-done';

export interface FinishAt {
  /** Where the clock stops; now, when left out. */
  endAt?: number;
  /** The plan stopped it rather than the person: no overlay, the entry says so, and the day just read has the last word. */
  byItself?: boolean;
  /** With `byItself`, the forgotten-shift limit stopped it and not the plan. That end is a guess, so it overrules no answer on the day: a worked shift just stops the clock, and one told to keep out leaves it running. */
  atLimit?: boolean;
}

/** What came of asking a clock to finish. */
export type FinishOutcome =
  /** Its shift is recorded, and the clock has stopped. */
  | 'written'
  /** The shift is not the clock's to record any more: the clock has stopped, with nothing written. */
  | 'gone'
  /** Nothing landed, because the day said not yet or could not be reached. The clock runs on. */
  | 'wait';

let finishing: Promise<FinishOutcome> | null = null;

/** Clocks out: the shift lands on its day as worked, on top of whatever the day already holds. */
export function finishLiveShift(template: ShiftTemplate, at: FinishAt = {}): Promise<FinishOutcome> {
  // The button and the clock can both get here, and a second run would save the day twice.
  finishing ??= land(template, at).finally(() => {
    finishing = null;
  });

  return finishing;
}

/** A pause this short is a stray tap, not a break. */
const STRAY_PAUSE = 30_000;

/** Everything the clock counted as paused, a pause still open rolled in up to the end. */
const pausedBy = (live: LiveShift, end: number): number =>
  live.breakMs + (live.pausedAt === null ? 0 : Math.max(0, end - live.pausedAt));

async function land(
  template: ShiftTemplate,
  { endAt, byItself = false, atLimit = false }: FinishAt,
): Promise<FinishOutcome> {
  const live = useLive.getState().live;

  if (live === null) return 'wait';

  let end = endAt ?? Date.now();
  let outcome = 'written' as FinishOutcome;

  // Written on what the server holds now, on the version it says: another
  // device may have saved tips or a note since this tab last read the day.
  // Never closed by itself over a day it could not read: the server's close
  // loses nothing by waiting, and the clock asks again on its next look.
  const saved = await rewriteDay(
    live.date,
    (payload, day, built) => {
      // The times come from `built`, an end queued from this device counting
      // like any other; whether the shift is still the clock's, from the read.
      const entry = built?.shifts.find((item) => item.shift_id === live.shiftId);

      if (byItself) {
        const standing = clockStanding(live, day?.shifts ?? []);
        const { closes } = liveWindow(template, live, entry);
        const planEnd = planCloses(template, live, entry);

        // The day just read has the last word over the copy that sent the clock
        // here: the close may not be its to make any more, and a later end typed
        // since this tab last looked means the shift is simply not over yet.
        const notOver = !atLimit && (closes > Date.now() || planEnd <= live.startedAt);

        // Worked is an answer, whoever gave it. A close can write over one, its
        // end being the plan's; the limit's end is only a guess, so the shift
        // counts as finished, the times it holds included.
        const finished =
          atLimit && [entry, day?.shifts.find((item) => item.shift_id === live.shiftId)].some((held) => held?.worked);

        if (standing !== 'free' || notOver || finished) {
          outcome = standing === 'gone' || finished ? 'gone' : 'wait';

          return false;
        }

        // When this was noticed is not when the shift ended: a laptop asleep
        // overnight would record the morning, and past a day the hours wrap
        // round and price as next to nothing. A shift planned longer than the
        // limit gets to the end of its plan, and an end said on the day beats
        // the guess, unless it is from before this clock began.
        const said = entry?.actual_end != null && planEnd > live.startedAt;
        const cap = said ? planEnd : Math.max(live.startedAt + FORGOTTEN_AFTER, planEnd);

        end = atLimit ? Math.min(end, cap) : closes;
      }

      const breakMs = pausedBy(live, end);

      const recorded = {
        worked: true,
        actual_start: entry !== undefined && startSettled(entry, live) ? entry.actual_start : clockOf(live.startedAt),
        actual_end: clockOf(end),
        // A clock nobody paused says nothing about the break, whoever stopped
        // it: the placement's stands, as it would had the server closed this.
        break_minutes:
          breakMs > STRAY_PAUSE ? Math.round(breakMs / 60_000) : (entry?.break_minutes ?? template.break_minutes),
        ...(byItself ? { auto_closed: true } : {}),
      };

      if (entry === undefined) {
        payload.shifts.push({ shift_id: live.shiftId, needs_cover: false, ...recorded });
      } else {
        payload.shifts = payload.shifts.map((item) =>
          item.shift_id === live.shiftId ? { ...item, ...recorded } : item,
        );
      }

      return true;
    },
    { undoable: !byItself, freshOnly: byItself },
  );

  if (outcome === 'gone') write(null);
  if (outcome !== 'written') return outcome;

  // Refused, or asked of a day that could not be read: the clock is all that
  // holds the real times and the pauses, so it runs on and asks again.
  if (saved !== 'landed' && saved !== 'queued') return 'wait';

  const stopped = { ...live, breakMs: pausedBy(live, end), pausedAt: null };
  const landed = liveEntry(live);

  const done: ShiftDone = {
    shiftId: live.shiftId,
    date: live.date,
    name: template.name,
    elapsed: workedMs(stopped, end),
    earned: landed?.earned ?? liveTick(template, stopped, end).earned ?? 0,
    hours: landed?.hours ?? plannedHours(template, live),
  };

  write(null);

  if (!byItself) dispatchEvent(new CustomEvent<ShiftDone>(SHIFT_DONE_EVENT, { detail: done }));

  return 'written';
}

/** Paid hours the running shift plans: its own placement's, else what the template runs on that date. */
function plannedHours(template: ShiftTemplate, live: LiveShift): number {
  return liveEntry(live)?.hours ?? hoursOn(template, live.date).hours;
}

export interface LiveTick {
  /** Milliseconds on the clock. */
  elapsed: number;
  /** Earned so far, or null where the pay period cannot be metered live. */
  earned: number | null;
  /** 0..1 of the planned hours; can pass 1 on a long day. */
  progress: number;
  /** Paid milliseconds planned, for the ring and the ETA. */
  planned: number;
}

/** What the counter shows at a moment in time. */
export function liveTick(template: ShiftTemplate, live: LiveShift | number, now: number): LiveTick {
  const elapsed =
    typeof live === 'number' ? Math.max(0, now - live) : workedMs(live, now);
  const hours = elapsed / 3600_000;
  const planned =
    Math.max(1, typeof live === 'number' ? template.hours : plannedHours(template, live)) * 3600_000;
  const amount = template.salary_amount ?? 0;

  let earned: number | null = null;

  if (template.salary_period === 'hour') earned = amount * hours;
  else if (template.salary_period === 'day') earned = amount * Math.min(1, elapsed / planned);

  return { elapsed, earned, progress: elapsed / planned, planned };
}

/** "3:07:42" — hours unpadded, the rest on the clock. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return `${hours}:${`${minutes}`.padStart(2, '0')}:${`${seconds}`.padStart(2, '0')}`;
}
