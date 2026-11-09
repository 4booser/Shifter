import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { create } from 'zustand';

import { clockOf } from '@/lib/calendar';
import { clockWindow, closesItself, shiftWindow, ShiftWindow } from '@/lib/shift-window';
import { DayShiftEntry, ShiftTemplate } from '@/lib/types';

/** A running shift: which template, on which day, since when. */
export interface LiveShift {
  date: string;
  shiftId: number;
  name: string;
  symbol: string | null;
  /** ISO instant the person pressed start. */
  startedAt: string;
  /** Hourly rate when the template pays by the hour; null otherwise. */
  hourlyRate: number | null;
  plannedEnd: string;
  /** When the shift was meant to start, which is not when it did. */
  plannedStart?: string;
  /** Unpaid stretches inside the shift, as ISO instants. */
  breaks?: { from: string; to: string | null }[];
  /** The forgotten-shift alarm scheduled at start, so ending the shift can cancel it. */
  alarmId?: string | null;
  /** Whether the shift closes itself, as of the last the clock heard from its template. */
  autoClock?: boolean;
  /** The end somebody set under Фактически, which the close follows. */
  actualEnd?: string | null;
}

/** A clock for one entry on one date, whichever of the ways in started it. */
export const liveFrom = (
  date: string,
  entry: Pick<
    DayShiftEntry,
    | 'shift_id'
    | 'name'
    | 'symbol'
    | 'start_time'
    | 'end_time'
    | 'actual_end'
    | 'worked'
    | 'auto_closed'
  >,
  template: ShiftTemplate | undefined,
  startedAt: string,
): LiveShift => ({
  date,
  shiftId: entry.shift_id,
  name: entry.name,
  symbol: entry.symbol,
  startedAt,
  // Only an hourly rate ticks up by the second; anything else would be a
  // number nobody agreed to.
  hourlyRate: template?.salary_period === 'hour' ? template.salary_amount : null,
  plannedStart: entry.start_time,
  plannedEnd: entry.end_time,
  autoClock: closesItself(template, entry),
  actualEnd: entry.actual_end,
});

/** Seconds spent on break up to `now`, counting an open one and nothing taken after it. */
export const breakSeconds = (shift: LiveShift, now: number): number =>
  (shift.breaks ?? []).reduce((sum, entry) => {
    const from = new Date(entry.from).getTime();
    const to = entry.to === null ? now : Math.min(now, new Date(entry.to).getTime());

    return sum + Math.max(0, to - from);
  }, 0) / 1000;

/** True while a break is running. */
export const onBreak = (shift: LiveShift): boolean =>
  (shift.breaks ?? []).some((entry) => entry.to === null);

/** The instant the plan says this shift ends. */
export const plannedEndInstant = (shift: LiveShift): Date => {
  const startClock = (shift.plannedStart ?? shift.startedAt.slice(11, 16)).slice(0, 5);
  const endClock = shift.plannedEnd.slice(0, 5);
  const end = new Date(`${shift.date}T${endClock}:00`);

  if (endClock <= startClock) end.setDate(end.getDate() + 1);

  return end;
};

/**
 * When the running shift opens and closes by the shared rule, the clock's own
 * start standing in for an edge the day has not heard about yet. Not where the
 * plan was over before the clock began: from a start past it the rule pushes
 * the end to the next day, and 18:00 on a plan to 17:00 would close 23 paid
 * hours later. That close stays behind the clock, where it has no say.
 */
export const liveWindow = (shift: LiveShift): ShiftWindow => {
  const started = clockOf(new Date(shift.startedAt));
  const start = (shift.plannedStart ?? started).slice(0, 5);
  const end = shift.plannedEnd.slice(0, 5);
  const plan = shiftWindow(shift.date, start, end, null, shift.actualEnd);

  return new Date(shift.startedAt).getTime() >= plan.closes.getTime()
    ? plan
    : shiftWindow(shift.date, start, end, started, shift.actualEnd);
};

/** Whether the plan decides when this clock stops, which is what the clock may promise. One started after its shift should have ended has no plan left to follow. */
export const planEndsClock = (shift: LiveShift): boolean =>
  shift.autoClock === true
  && new Date(shift.startedAt).getTime() < liveWindow(shift).closes.getTime();

/**
 * The clock after hearing what its day says now. Фактически moves it: an edge
 * somebody set is the start, and the close follows the end, so a shift
 * finished on another device stops this clock too. A cleared edge does not
 * move it, because a day read before a manual start reached it has no edge
 * either, and that clock's own time is the true one. Nor does a worked entry's
 * start: those are what the close copied from the plan, and the clock is about
 * to overwrite them with the real ones. Hands back the same object where
 * nothing moved, so a tick writes nothing.
 */
export const followEntry = (
  shift: LiveShift,
  entry: Pick<
    DayShiftEntry,
    'start_time' | 'end_time' | 'actual_start' | 'actual_end' | 'worked'
  >,
  autoClock?: boolean,
): LiveShift => {
  const opens = clockWindow(shift.date, entry).opens;
  const moved =
    !entry.worked
    && entry.actual_start !== null
    && clockOf(opens) !== clockOf(new Date(shift.startedAt));
  const next: LiveShift = {
    ...shift,
    startedAt: moved ? opens.toISOString() : shift.startedAt,
    plannedStart: entry.start_time,
    plannedEnd: entry.end_time,
    actualEnd: entry.actual_end,
    autoClock: autoClock ?? shift.autoClock,
  };
  const same = (Object.keys(next) as (keyof LiveShift)[]).every(
    (key) => next[key] === shift[key],
  );

  return same ? shift : next;
};

/** True once the plan has been over for a while: the button was forgotten. */
export const forgotten = (shift: LiveShift, now: number): boolean =>
  now - plannedEndInstant(shift).getTime() > 2 * 3600_000;

/** Whether the plan's end can be written for this clock. One started after it would record a shift that ended before it began, which prices as most of a day. */
export const plannedEndFits = (shift: LiveShift): boolean =>
  plannedEndInstant(shift).getTime() > new Date(shift.startedAt).getTime();

const KEY = 'shifter.live';

/** Storage that cannot throw at the caller. */
const quietly = (work: Promise<unknown>) => {
  void work.catch(() => undefined);
};

/** The wave-60 banner only helps whoever opens the app — and the whole failure mode of a forgotten timer is that… */
const armAlarm = (shift: LiveShift) => {
  const date = new Date(plannedEndInstant(shift).getTime() + 2 * 3600_000);

  // Gone already, which the banner is saying to anyone who looks.
  if (date.getTime() <= Date.now()) return;

  quietly(
    Notifications.scheduleNotificationAsync({
      content: {
        title: 'Смена всё ещё идёт',
        body: `План кончился в ${shift.plannedEnd.slice(0, 5)} — закрыть по плану?`,
        data: { url: '/live' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    }).then((alarmId) => {
      const current = useLive.getState().live;

      if (current === null || current.date !== shift.date || current.shiftId !== shift.shiftId) {
        return;
      }

      const armed = { ...current, alarmId };

      useLive.setState({ live: armed });
      quietly(AsyncStorage.setItem(KEY, JSON.stringify(armed)));
    }),
  );
};

interface LiveState {
  live: LiveShift | null;
  /** False until storage has answered: before that, no clock might only mean none read yet. */
  ready: boolean;
  hydrate: () => Promise<void>;
  start: (shift: LiveShift) => void;
  /** Keeps the running clock in step with what its day says now. */
  follow: (
    entry: Parameters<typeof followEntry>[1],
    autoClock?: boolean,
  ) => void;
  /** Opens a break, or closes the open one. Written through immediately. */
  toggleBreak: () => void;
  clear: () => void;
}

/** Survives app restarts on purpose: a shift is hours long and phones reboot. */
export const useLive = create<LiveState>((set, get) => ({
  live: null,
  ready: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);

      if (raw !== null) set({ live: JSON.parse(raw) as LiveShift });
    } catch {
      // A lost live-shift marker is recoverable by hand; never crash for it.
    } finally {
      set({ ready: true });
    }
  },

  start: (shift) => {
    const fresh: LiveShift = { ...shift, breaks: shift.breaks ?? [], alarmId: null };

    set({ live: fresh });
    quietly(AsyncStorage.setItem(KEY, JSON.stringify(fresh)));

    // Nothing to forget: this one closes itself, and an alarm asking somebody
    // to close it would arrive two hours after it already had.
    if (fresh.autoClock !== true) armAlarm(fresh);
  },

  follow: (entry, autoClock) => {
    const shift = get().live;

    if (shift === null) return;

    const next = followEntry(shift, entry, autoClock);

    if (next === shift) return;

    set({ live: next });
    quietly(AsyncStorage.setItem(KEY, JSON.stringify(next)));

    // Nothing is going to close it now, so it can be forgotten after all.
    if (shift.autoClock === true && next.autoClock === false && next.alarmId == null) {
      armAlarm(next);
    }
  },

  toggleBreak: () => {
    const shift = get().live;

    if (shift === null) return;

    const breaks = [...(shift.breaks ?? [])];
    const open = breaks.findIndex((entry) => entry.to === null);
    const now = new Date().toISOString();

    // Written down the moment it happens rather than on finish: a break is remembered by the phone, not by the…
    if (open >= 0) breaks[open] = { ...breaks[open], to: now };
    else breaks.push({ from: now, to: null });

    const next = { ...shift, breaks };

    set({ live: next });
    quietly(AsyncStorage.setItem(KEY, JSON.stringify(next)));
  },

  clear: () => {
    const alarmId = get().live?.alarmId;

    if (alarmId != null) quietly(Notifications.cancelScheduledNotificationAsync(alarmId));

    set({ live: null });
    quietly(AsyncStorage.removeItem(KEY));
  },
}));
