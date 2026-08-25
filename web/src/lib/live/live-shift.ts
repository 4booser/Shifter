'use client';

import { create } from 'zustand';

import { todayKey } from '../calendar/calendar-date';
import { ShiftTemplate, toSavePayload } from '../calendar/models';
import { saveDay, useCalendar } from '../store/calendar';

/**
 * A shift being worked right now. It lives in the browser, not on the server:
 * until the person clocks out nothing has been earned yet, and the calendar
 * only records days that happened. Surviving a reload matters more than
 * syncing across devices — a shift is worked on one phone.
 */

const STORAGE_KEY = 'shifter.liveShift';

export interface LiveShift {
  shiftId: number;
  /** The calendar day the shift belongs to — the day it started. */
  date: string;
  /** Epoch milliseconds. */
  startedAt: number;
}

interface LiveState {
  live: LiveShift | null;
}

function read(): LiveShift | null {
  if (typeof localStorage === 'undefined') return null;

  const raw = localStorage.getItem(STORAGE_KEY);

  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as LiveShift;

    // A shift forgotten for over a day is stale, not live.
    if (Date.now() - parsed.startedAt > 26 * 3600_000) {
      localStorage.removeItem(STORAGE_KEY);

      return null;
    }

    return parsed;
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
  write({ shiftId: template.id, date: todayKey(), startedAt: Date.now() });
}

export function cancelLiveShift(): void {
  write(null);
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

/**
 * Clocks out: the shift lands on its day as worked, on top of whatever the
 * day already holds. The server then prices it — the live counter was only
 * ever a preview — and the result goes out as an event for the done-card.
 */
export async function finishLiveShift(template: ShiftTemplate): Promise<void> {
  const live = useLive.getState().live;

  if (live === null) return;

  const day = useCalendar.getState().days.get(live.date);
  const payload = toSavePayload(day);

  if (!payload.shifts.some((entry) => entry.shift_id === live.shiftId)) {
    payload.shifts.push({ shift_id: live.shiftId, worked: true, needs_cover: false });
  } else {
    payload.shifts = payload.shifts.map((entry) =>
      entry.shift_id === live.shiftId ? { ...entry, worked: true } : entry,
    );
  }

  const elapsed = Date.now() - live.startedAt;

  await saveDay(live.date, payload);

  const saved = useCalendar
    .getState()
    .days.get(live.date)
    ?.shifts.find((entry) => entry.shift_id === live.shiftId);

  const done: ShiftDone = {
    shiftId: live.shiftId,
    date: live.date,
    name: template.name,
    elapsed,
    earned: saved?.earned ?? liveTick(template, live.startedAt, Date.now()).earned ?? 0,
    hours: saved?.hours ?? template.hours,
  };

  write(null);
  dispatchEvent(new CustomEvent<ShiftDone>(SHIFT_DONE_EVENT, { detail: done }));
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
 * What the counter shows at a moment in time. Hourly pay meters by the
 * clock; a fixed day rate fills in proportionally to the planned hours; a
 * weekly or monthly wage cannot honestly tick per-minute, so it does not.
 */
export function liveTick(template: ShiftTemplate, startedAt: number, now: number): LiveTick {
  const elapsed = Math.max(0, now - startedAt);
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
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return `${hours}:${`${minutes}`.padStart(2, '0')}:${`${seconds}`.padStart(2, '0')}`;
}
