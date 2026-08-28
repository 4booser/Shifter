import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { api, ApiError } from '@/lib/api';
import { drain, Pending, SendResult, stamp } from '@/lib/outbox';

const KEY = 'shifter.outbox';

interface OutboxState {
  pending: Pending[];
  /** Writes the server refused outright. Shown once, then cleared by hand. */
  refused: number;
  hydrate: () => Promise<void>;
  /** Puts work aside because the network is gone. */
  hold: (entries: Omit<Pending, 'id' | 'at'>[]) => Promise<void>;
  /** Tries the backlog, oldest first. Returns how many left the phone. */
  flush: () => Promise<number>;
  clearRefused: () => void;
}

let sending = false;

/**
 * Storage that cannot throw at the caller. The queue lives in memory as well
 * as on disk, so a failed write costs durability across a restart — never the
 * work itself, and never a red box over the calendar.
 */
const keepDown = async (pending: Pending[]) => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // Held in memory either way; it will be tried again on the next change.
  }
};

/**
 * The queue behind every write the calendar makes.
 *
 * A bartender records the shift in a basement, on the way home, in a lift.
 * Before this the answer to a dropped connection was «Не сохранилось» and a
 * stroke across twenty days was simply lost. Nothing held is ever shown as
 * money: a waiting day is drawn as waiting, because a day nobody has recorded
 * is not earnings.
 */
export const useOutbox = create<OutboxState>((set, get) => ({
  pending: [],
  refused: 0,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);

      if (raw !== null) set({ pending: JSON.parse(raw) as Pending[] });
    } catch {
      // A queue that cannot be read has to be forgotten; the alternative is
      // refusing to start.
    }
  },

  hold: async (entries) => {
    const next = [...get().pending, ...stamp(entries)];

    set({ pending: next });
    await keepDown(next);
  },

  flush: async () => {
    if (sending) return 0;

    sending = true;

    try {
      const send = async (entry: Pending): Promise<SendResult> => {
        try {
          await api(entry.path, { method: entry.method, body: entry.body ?? undefined });

          return 'sent';
        } catch (caught) {
          return caught instanceof ApiError ? 'refused' : 'offline';
        }
      };

      const result = await drain(get().pending, send, async (left) => {
        set({ pending: left });
        await keepDown(left);
      });

      if (result.refused > 0) set({ refused: get().refused + result.refused });

      return result.sent;
    } finally {
      sending = false;
    }
  },

  clearRefused: () => set({ refused: 0 }),
}));
