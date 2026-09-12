'use client';

import { useSettings } from '../settings/store';
import type { Dictionary } from './dictionary-type';
import { nWord } from './plural';
import type { Language } from '../settings/settings';

export const LANGS: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'uk', label: 'Українська' },
];

/*
 * The loaded dictionaries, filled on demand.
 *
 * Both used to be imported statically, which put 371 kB of translation pairs
 * into a chunk every page pulled — the public roadmap and status pages, which
 * a stranger opens without an account, each downloaded both languages of the
 * whole application. A reader now fetches one, and an English reader fetches
 * none, because English is the key.
 */
const loaded: Partial<Record<Language, Dictionary>> = {};

/**
 * Fetch a language's dictionary. Called once by the boot gate before the app
 * renders, so `translate` below is never asked a question it cannot answer:
 * the shell already waits for mount before drawing a single word.
 */
export async function loadDictionary(lang: Language): Promise<void> {
  if (lang === 'en' || loaded[lang] !== undefined) return;

  try {
    const module =
      lang === 'ru' ? await import('./dictionaries.ru') : await import('./dictionaries.uk');

    loaded[lang] = module.default;
  } catch {
    // A dictionary that will not load leaves the app in English rather than
    // blank. Every key is a readable English string, which is the whole
    // reason the keys are the strings.
  }
}

/**
 * Runtime translation keyed by the English string itself: English needs no
 * dictionary and an untranslated key falls back to itself.
 */
export function translate(lang: Language, key: string): string {
  return loaded[lang]?.[key] ?? key;
}

export function useI18n() {
  const lang = useSettings((state) => state.settings.language);

  return {
    lang,
    t: (key: string) => translate(lang, key),
    /** "5 смен": a count glued to its correctly declined word. */
    n: (count: number, key: string) => nWord(lang, count, key),
    /**
     * A bare count, grouped: «2 512», never «2512».
     *
     * Money has had a formatter since the first week; plain counts did not,
     * so a year of hours printed one way in a tile and another in the table
     * under it.
     */
    num: (value: number) => value.toLocaleString(lang),
  };
}
