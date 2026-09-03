'use client';

import { useSettings } from '../settings/store';
import { RU, UK } from './dictionaries';
import { nWord } from './plural';
import type { Language } from '../settings/settings';

export const LANGS: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'uk', label: 'Українська' },
];

/**
 * Runtime translation keyed by the English string itself, exactly as before:
 * English needs no dictionary and an untranslated key falls back to itself.
 */
export function translate(lang: Language, key: string): string {
  const dictionary = lang === 'ru' ? RU : lang === 'uk' ? UK : null;

  return dictionary?.[key] ?? key;
}

export function useI18n() {
  const lang = useSettings((state) => state.settings.language);

  return {
    lang,
    t: (key: string) => translate(lang, key),
    /** "5 смен": a count glued to its correctly declined word. */
    n: (count: number, key: string) => nWord(lang, count, key),
    /**
     * A number in the reader's own notation. `toFixed` and a bare
     * interpolation both know only the full stop, and this app writes «9,5».
     */
    num: (value: number) => value.toLocaleString(lang),
  };
}
