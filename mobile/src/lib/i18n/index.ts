import { useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { UK } from './uk';

export type Lang = 'ru' | 'uk';

const KEY = 'shifter.lang';

/**
 * Read synchronously, at module load, before anything renders.
 *
 * This is the whole reason the language does not live in AsyncStorage: some
 * of the app's label tables are module-level constants, and a constant built
 * from an asynchronous value is a constant built from the default. Reading it
 * here means a table is right from the first frame.
 */
const stored = (): Lang => {
  try {
    const saved = SecureStore.getItem(KEY);

    return saved === 'uk' ? 'uk' : 'ru';
  } catch {
    return 'ru';
  }
};

let current: Lang = stored();

interface LangState {
  lang: Lang;
  choose: (lang: Lang) => void;
}

export const useLang = create<LangState>((set) => ({
  lang: current,

  choose: (lang) => {
    current = lang;
    set({ lang });

    try {
      SecureStore.setItem(KEY, lang);
    } catch {
      // A language that would not save is still the language for this run.
    }
  },
}));

/**
 * The translator, as a plain function rather than a hook.
 *
 * A hook would mean threading `const t = useT()` through six hundred call
 * sites, half of them in helpers that are not components at all. Instead the
 * root is keyed on the language, so choosing another one remounts the app —
 * which is what changing language does anyway, and happens about once in the
 * life of an install.
 */
export const t = (phrase: string): string =>
  current === 'ru' ? phrase : (UK[phrase] ?? phrase);

/**
 * Plural forms, which Russian and Ukrainian share: one, few, many. The words
 * themselves come from the caller already translated.
 */
export const plural = (count: number, one: string, few: string, many: string): string => {
  const tens = count % 100;
  const units = count % 10;

  if (tens >= 11 && tens <= 14) return `${count} ${many}`;
  if (units === 1) return `${count} ${one}`;
  if (units >= 2 && units <= 4) return `${count} ${few}`;

  return `${count} ${many}`;
};

/** Only for a component that has to redraw when the language changes. */
export const useLangValue = (): Lang => useLang((state) => state.lang);
