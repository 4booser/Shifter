'use client';

import { useEffect } from 'react';

import { useI18n } from '@/lib/i18n';

/** Names the browser tab after the page. */
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
