'use client';

import { useEffect } from 'react';

import { useI18n } from '@/lib/i18n';

/**
 * Names the browser tab after the page. Ten tabs of «Shifter» are a deck of
 * face-down cards; «Статистика — Shifter» is the one you were looking for.
 * Also keeps <html lang> honest for the screen reader, since the language
 * switch happens client-side where no server ever sees it.
 *
 * While a shift is running, the live override wins on every tab of the app —
 * «● 3:25 · Кофе — Shifter» is the glanceable timer people actually use.
 */
let pageTitle = 'Shifter';
let liveOverride: string | null = null;

const apply = () => {
  document.title = liveOverride ?? pageTitle;
};

export function setLiveTitle(text: string | null): void {
  liveOverride = text;
  apply();
}

export function useTitle(key: string): void {
  const { t, lang } = useI18n();

  useEffect(() => {
    pageTitle = `${t(key)} — Shifter`;
    apply();
    document.documentElement.lang = lang;
  }, [key, t, lang]);
}
