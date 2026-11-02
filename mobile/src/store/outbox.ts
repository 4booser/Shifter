import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { api } from '@/lib/api';
import { inTurn, tellDay } from '@/lib/day-writes';
import { drain, failureOf, heldDays, Pending, rebaseDay, SendResult, stamp } from '@/lib/outbox';
import { CalendarDayData, DaySave, DaysResponse, toSavePayload } from '@/lib/types';

const KEY = 'shifter.outbox';

interface OutboxState {
  pending: Pending[];
  /** Writes the server refused outright. Shown once, then cleared by hand. */
  refused: number;
  hydrate: () => Promise<void>;
  /** Puts work aside because the network is gone. */
  hold: (entries: Omit<Pending, 'id' | 'at'>[]) => Promise<void>;
  /** Takes a held write back: a later save carried the same edits. */
  release: (slot: string) => Promise<void>;
  /** Tries the backlog, oldest first. Returns how many left the phone. */
  flush: () => Promise<number>;
  /** Gets what is held for a date in before somebody reads or writes it. */
  settle: (date: string) => Promise<void>;
  /** Counts a write refused where nobody was left to tell. */
  noteRefused: () => void;
  clearRefused: () => void;
}

let sending: Promise<number> | null = null;
let hydrated = false;

/** Storage that cannot throw at the caller. */
const keepDown = async (pending: Pending[]) => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // Held in memory either way; it will be tried again on the next change.
  }
};

/** A held day just moved the version under whoever has it open, and they would read that as another device. */
const tellHeld = (entry: Pending, answer: CalendarDayData | undefined) => {
  if (entry.base != null && answer !== undefined) tellDay(entry.days[0], answer);
};

/**
 * A held day refused for its version: the day moved while it waited, which is
 * no reason to lose it. Its edits go again over the day as it stands. Whatever
 * was fought over stays as the server has it and counts as refused, which is
 * what sends somebody to look at that day.
 */
const replay = async (entry: Pending): Promise<SendResult> => {
  const date = entry.days[0];

  try {
    const summary = await api<DaysResponse>(`/shifter/v1/days?from=${date}&to=${date}`);
    const { day, contested } = rebaseDay(
      entry.body as DaySave,
      entry.base as DaySave,
      toSavePayload(summary.days[0]),
    );

    if (day !== null) {
      tellHeld(entry, await api<CalendarDayData>(entry.path, { method: entry.method, body: day }));
    }

    return contested ? 'refused' : 'sent';
  } catch (caught) {
    // Moved again just now: still not a reason to drop it, the next try reads afresh.
    return (caught as { status?: number } | null)?.status === 409 ? 'offline' : failureOf(caught);
  }
};

const send = async (entry: Pending): Promise<SendResult> => {
  try {
    tellHeld(
      entry,
      await api<CalendarDayData>(entry.path, { method: entry.method, body: entry.body ?? undefined }),
    );

    return 'sent';
  } catch (caught) {
    const stale = (caught as { status?: number } | null)?.status === 409 && entry.base != null;

    return stale ? replay(entry) : failureOf(caught);
  }
};

/** The queue behind every write the calendar makes. */
export const useOutbox = create<OutboxState>((set, get) => ({
  pending: [],
  refused: 0,

  hydrate: async () => {
    // Once: after that memory is ahead of the disk, and reading it back could
    // lose a write held in the moment between.
    if (hydrated) return;

    try {
      const raw = await AsyncStorage.getItem(KEY);

      if (raw !== null) set({ pending: JSON.parse(raw) as Pending[] });

      hydrated = true;
    } catch {
      // A queue that cannot be read has to be forgotten; the alternative is
      // refusing to start.
    }
  },

  hold: async (entries) => {
    const slots = new Set(entries.map((entry) => entry.slot));
    const next = [
      ...get().pending.filter((entry) => entry.slot === undefined || !slots.has(entry.slot)),
      ...stamp(entries),
    ];

    set({ pending: next });
    await keepDown(next);
  },

  release: async (slot) => {
    const next = get().pending.filter((entry) => entry.slot !== slot);

    if (next.length === get().pending.length) return;

    set({ pending: next });
    await keepDown(next);
  },

  flush: () => {
    // One run at a time, and whoever asks meanwhile waits for it: they may be
    // about to read a day that has to have these writes in it.
    sending ??= (async () => {
      const before = get().pending;
      const result = await drain(before, send, async (left) => {
        const done = new Set(before.slice(0, before.length - left.length).map((entry) => entry.id));
        // Off what is there now: a write can be held or released during a run.
        const next = get().pending.filter((entry) => !done.has(entry.id));

        set({ pending: next });
        await keepDown(next);
      });

      if (result.refused > 0) set({ refused: get().refused + result.refused });

      return result.sent;
    })().finally(() => {
      sending = null;
    });

    return sending;
  },

  settle: async (date) => {
    if (heldDays(get().pending).has(date)) await get().flush();
  },

  noteRefused: () => set({ refused: get().refused + 1 }),

  clearRefused: () => set({ refused: 0 }),
}));

/**
 * A day written straight from a screen: in line with the clock's writes, and
 * behind whatever is held for it, which would otherwise go at the same version
 * and leave one of the two refused by this phone's own other hand.
 */
export const putDay = (date: string, payload: DaySave): Promise<CalendarDayData> =>
  inTurn(date, async () => {
    await useOutbox.getState().settle(date);

    return api<CalendarDayData>(`/shifter/v1/days/${date}`, { method: 'PUT', body: payload });
  });
