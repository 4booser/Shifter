import { create } from 'zustand';

import { calendarApi } from '@/lib/api/calendar';
import { todayKey } from '@/lib/calendar/calendar-date';
import { ShiftTemplate, toSavePayload } from '@/lib/calendar/models';

/**
 * A shift being worked right now.
 *
 * It lives in the browser, not on the server: until somebody clocks out
 * nothing has been earned, and the calendar only records days that happened.
 * The storage key is the one the previous client used, on purpose — a shift
 * started there is still running when this front opens.
 */

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
  /** When a timed break is due to end; null during an untimed pause. */
  breakUntil?: number | null;
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

    return {
      shiftId: parsed.shiftId,
      date: parsed.date,
      startedAt: parsed.startedAt,
      breakMs: parsed.breakMs ?? 0,
      pausedAt: parsed.pausedAt ?? null,
      breakUntil: parsed.breakUntil ?? null,
    };
  } catch {
    return null;
  }
}

export const useLive = create<LiveState>(() => ({ live: read() }));

function write(live: LiveShift | null): void {
  if (live === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(live));

  useLive.setState({ live });
}

export function startLiveShift(template: ShiftTemplate): void {
  write({
    shiftId: template.id,
    date: todayKey(),
    startedAt: Date.now(),
    breakMs: 0,
    pausedAt: null,
    breakUntil: null,
  });
}

/** The kettle break: the clock stops, the shift does not. */
export function pauseLiveShift(): void {
  const live = useLive.getState().live;

  if (live === null || live.pausedAt !== null) return;

  write({ ...live, pausedAt: Date.now(), breakUntil: null });
}

/**
 * A break of a stated length, counted down. A break nobody started on time is
 * a break nobody takes; a break nobody ended on time is one somebody gets
 * shouted at for.
 */
export function startTimedBreak(minutes: number): void {
  const live = useLive.getState().live;

  if (live === null || minutes <= 0) return;

  const now = Date.now();

  write({
    // Already paused stays paused: restarting the pause would hand back the
    // minutes already taken, which is the wrong direction to be wrong in.
    ...live,
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

export function cancelLiveShift(): void {
  write(null);
}

/**
 * Clocks out: the shift lands on its day as worked, with the clock it was
 * actually worked to. The day is re-read first and sent back whole, because
 * a save replaces the day rather than patching it.
 */
export async function finishLiveShift(): Promise<{ date: string; elapsed: number } | null> {
  const live = useLive.getState().live;

  if (live === null) return null;

  // A pause never closed rolls into the break on the way out.
  const now = Date.now();
  const breakMs = live.breakMs + (live.pausedAt === null ? 0 : now - live.pausedAt);
  const elapsed = workedMs(live, now);

  const recorded = {
    worked: true,
    actual_start: clock(live.startedAt),
    actual_end: clock(now),
    break_minutes: Math.round(breakMs / 60_000),
  };

  const summary = await calendarApi.days(live.date, live.date);
  const payload = toSavePayload(summary.days.find((day) => day.date === live.date));

  payload.shifts = payload.shifts.some((entry) => entry.shift_id === live.shiftId)
    ? payload.shifts.map((entry) =>
        entry.shift_id === live.shiftId ? { ...entry, ...recorded } : entry,
      )
    : [...payload.shifts, { shift_id: live.shiftId, needs_cover: false, ...recorded }];

  await calendarApi.saveDay(live.date, payload);
  write(null);

  return { date: live.date, elapsed };
}

function clock(at: number): string {
  const stamp = new Date(at);

  return `${`${stamp.getHours()}`.padStart(2, '0')}:${`${stamp.getMinutes()}`.padStart(2, '0')}`;
}

export interface LiveTick {
  /** Milliseconds on the clock. */
  elapsed: number;
  /** Earned so far, or null where the pay period cannot be metered live. */
  earned: number | null;
  /** 0..1 of the template's planned hours; can pass 1 on a long day. */
  progress: number;
  /** Paid milliseconds the template plans, for the ring and the ETA. */
  planned: number;
}

/**
 * What the counter shows at a moment in time. Hourly pay meters by the clock
 * with pauses taken out; a fixed day rate fills in proportionally to the
 * planned hours; a weekly or monthly wage cannot honestly tick per-minute, so
 * it does not.
 */
export function liveTick(template: ShiftTemplate, live: LiveShift, now: number): LiveTick {
  const elapsed = workedMs(live, now);
  const hours = elapsed / 3600_000;
  const planned = Math.max(1, template.hours) * 3600_000;
  const amount = template.salary_amount ?? 0;

  let earned: number | null = null;

  if (template.salary_period === 'hour') earned = amount * hours;
  else if (template.salary_period === 'day') earned = amount * Math.min(1, elapsed / planned);

  return { elapsed, earned, progress: elapsed / planned, planned };
}

/** "3:07:42" — hours unpadded, the rest on the clock. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return `${hours}:${`${minutes}`.padStart(2, '0')}:${`${seconds}`.padStart(2, '0')}`;
}
