import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { create } from 'zustand';

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
  /**
   * When the shift was meant to start, which is not when it did. The planned
   * length is a property of the shift — 17:00 to 01:00 is eight hours whoever
   * turns up when — and measuring it from the actual clock-in made a late
   * start lengthen the plan instead of eating into it.
   *
   * Optional: a shift already running when this shipped has none, and falls
   * back to its start.
   */
  plannedStart?: string;
  /**
   * Unpaid stretches inside the shift, as ISO instants. An open one has no
   * end yet. Optional because a shift started by an older build has none, and
   * a missing field must not read as a break of unknown length.
   */
  breaks?: { from: string; to: string | null }[];
  /**
   * The forgotten-shift alarm scheduled at start, so ending the shift can
   * cancel it. Optional: shifts started by an older build have none.
   */
  alarmId?: string | null;
}

/** Seconds spent on break, counting an open one up to `now`. */
export const breakSeconds = (shift: LiveShift, now: number): number =>
  (shift.breaks ?? []).reduce((sum, entry) => {
    const from = new Date(entry.from).getTime();
    const to = entry.to === null ? now : new Date(entry.to).getTime();

    return sum + Math.max(0, to - from);
  }, 0) / 1000;

/** True while a break is running. */
export const onBreak = (shift: LiveShift): boolean =>
  (shift.breaks ?? []).some((entry) => entry.to === null);

/**
 * The instant the plan says this shift ends. plannedEnd is a wall clock
 * ("23:00"); an end at or before the start belongs to the next morning —
 * 17:00–01:00 ends on the day after the shift's date.
 */
export const plannedEndInstant = (shift: LiveShift): Date => {
  const startClock = (shift.plannedStart ?? shift.startedAt.slice(11, 16)).slice(0, 5);
  const endClock = shift.plannedEnd.slice(0, 5);
  const end = new Date(`${shift.date}T${endClock}:00`);

  if (endClock <= startClock) end.setDate(end.getDate() + 1);

  return end;
};

/** True once the plan has been over for a while: the button was forgotten. */
export const forgotten = (shift: LiveShift, now: number): boolean =>
  now - plannedEndInstant(shift).getTime() > 2 * 3600_000;

const KEY = 'shifter.live';

/**
 * Storage that cannot throw at the caller.
 *
 * `void AsyncStorage.setItem(...)` looks like fire-and-forget and is actually
 * an unhandled rejection: on a phone where the module is missing or the disk
 * is full it surfaces as a red box over the calendar, for a write nobody was
 * waiting on. A lost marker is recoverable by hand; a crash is not.
 */
const quietly = (work: Promise<unknown>) => {
  void work.catch(() => undefined);
};

interface LiveState {
  live: LiveShift | null;
  hydrate: () => Promise<void>;
  start: (shift: LiveShift) => void;
  /** Opens a break, or closes the open one. Written through immediately. */
  toggleBreak: () => void;
  clear: () => void;
}

/**
 * Survives app restarts on purpose: a shift is hours long and phones
 * reboot. The clock is the wall clock, not a timer, so nothing drifts.
 */
export const useLive = create<LiveState>((set, get) => ({
  live: null,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);

      if (raw !== null) set({ live: JSON.parse(raw) as LiveShift });
    } catch {
      // A lost live-shift marker is recoverable by hand; never crash for it.
    }
  },

  start: (shift) => {
    const fresh: LiveShift = { ...shift, breaks: shift.breaks ?? [], alarmId: null };

    set({ live: fresh });
    quietly(AsyncStorage.setItem(KEY, JSON.stringify(fresh)));

    // The wave-60 banner only helps whoever opens the app — and the whole
    // failure mode of a forgotten timer is that nobody did. Knock instead,
    // two hours after the plan ran out, straight into the live screen.
    quietly(
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Смена всё ещё идёт',
          body: `План кончился в ${fresh.plannedEnd.slice(0, 5)} — закрыть по плану?`,
          data: { url: '/live' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(plannedEndInstant(fresh).getTime() + 2 * 3600_000),
        },
      }).then((alarmId) => {
        const current = get().live;

        if (current === null || current.startedAt !== fresh.startedAt) return;

        const armed = { ...current, alarmId };

        set({ live: armed });
        quietly(AsyncStorage.setItem(KEY, JSON.stringify(armed)));
      }),
    );
  },

  toggleBreak: () => {
    const shift = get().live;

    if (shift === null) return;

    const breaks = [...(shift.breaks ?? [])];
    const open = breaks.findIndex((entry) => entry.to === null);
    const now = new Date().toISOString();

    // Written down the moment it happens rather than on finish: a break is
    // remembered by the phone, not by the person, and the phone is the one
    // that survives being put in an apron pocket for twenty minutes.
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
