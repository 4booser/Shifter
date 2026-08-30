'use client';

import { useEffect } from 'react';

import { useI18n } from '@/lib/i18n';

/**
 * Names the browser tab after the page. Ten tabs of «Shifter» are a deck of
 * face-down cards; «Статистика — Shifter» is the one you were looking for.
 * Also keeps <html lang> honest for the screen reader, since the language
 * switch happens client-side where no server ever sees it.
 */
export function useTitle(key: string): void {
  const { t, lang } = useI18n();

  useEffect(() => {
    document.title = `${t(key)} — Shifter`;
    document.documentElement.lang = lang;
  }, [key, t, lang]);
}
