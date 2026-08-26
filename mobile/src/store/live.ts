import AsyncStorage from '@react-native-async-storage/async-storage';
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
}

const KEY = 'shifter.live';

interface LiveState {
  live: LiveShift | null;
  hydrate: () => Promise<void>;
  start: (shift: LiveShift) => void;
  clear: () => void;
}

/**
 * Survives app restarts on purpose: a shift is hours long and phones
 * reboot. The clock is the wall clock, not a timer, so nothing drifts.
 */
export const useLive = create<LiveState>((set) => ({
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
    set({ live: shift });
    void AsyncStorage.setItem(KEY, JSON.stringify(shift));
  },

  clear: () => {
    set({ live: null });
    void AsyncStorage.removeItem(KEY);
  },
}));
