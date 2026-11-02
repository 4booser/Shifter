import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { AutoStartRule, FiredDays, noteFired, readFired } from '@/lib/autostart';

/** The hours shifts start themselves at, and which fired today. */

const RULES_KEY = 'shifter.autostart.rules';
const FIRED_KEY = 'shifter.autostart.fired';

const quietly = (work: Promise<unknown>) => {
  void work.catch(() => undefined);
};

interface AutoStartState {
  rules: AutoStartRule[];
  /** Which templates started, by the date of the entry they started for. */
  fired: FiredDays;
  /** False until storage has answered: before that, nothing here can be trusted to say no. */
  ready: boolean;

  hydrate: () => Promise<void>;
  /** Null start with a null stop removes the rule entirely. */
  setRule: (shiftId: number, atTime: string | null) => void;
  /** The hour the running shift closes itself. Null takes it off. */
  setStop: (shiftId: number, stopAt: string | null) => void;
  markFired: (shiftId: number, day: string) => void;
}

export const useAutoStart = create<AutoStartState>((set, get) => ({
  rules: [],
  fired: {},
  ready: false,

  hydrate: async () => {
    try {
      const [rules, fired] = await Promise.all([
        AsyncStorage.getItem(RULES_KEY),
        AsyncStorage.getItem(FIRED_KEY),
      ]);

      set({
        rules: rules === null ? [] : (JSON.parse(rules) as AutoStartRule[]),
        fired: readFired(fired),
      });
    } catch {
      // Unreadable rules are rules that have to be set again, not a crash.
    } finally {
      set({ ready: true });
    }
  },

  setRule: (shiftId, atTime) => {
    const kept = get().rules.find((rule) => rule.shiftId === shiftId);
    const stopAt = kept?.stopAt ?? null;
    const rules = [
      ...get().rules.filter((rule) => rule.shiftId !== shiftId),
      // A rule with neither hour is no rule at all.
      ...(atTime === null && stopAt === null ? [] : [{ shiftId, at: atTime, stopAt }]),
    ];

    set({ rules });
    quietly(AsyncStorage.setItem(RULES_KEY, JSON.stringify(rules)));
  },

  setStop: (shiftId, stopAt) => {
    const kept = get().rules.find((rule) => rule.shiftId === shiftId);
    const at = kept?.at ?? null;
    const rules = [
      ...get().rules.filter((rule) => rule.shiftId !== shiftId),
      ...(at === null && stopAt === null ? [] : [{ shiftId, at, stopAt }]),
    ];

    set({ rules });
    quietly(AsyncStorage.setItem(RULES_KEY, JSON.stringify(rules)));
  },

  markFired: (shiftId, day) => {
    const fired = noteFired(get().fired, shiftId, day);

    set({ fired });
    quietly(AsyncStorage.setItem(FIRED_KEY, JSON.stringify(fired)));
  },
}));
