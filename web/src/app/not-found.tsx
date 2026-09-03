'use client';

import Link from 'next/link';

import { useI18n } from '@/lib/i18n';

/**
 * A wrong address, in the app's own skin.
 *
 * Without this file the export ships Next's default: black on white,
 * «This page could not be found.» in English regardless of the language
 * the person set, with no way back except the browser's own button. It is
 * also what a mistyped share link lands on, which makes it the first thing
 * some people ever see of this app.
 */
export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="grid min-h-dvh place-items-center bg-(--bg) px-4 text-ink">
      <main className="w-full max-w-md text-center">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-[1.05rem] font-extrabold tracking-tight"
        >
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-(--accent) text-white">S</span>
          Shifter
        </Link>

        <p className="text-6xl font-black tabular text-muted-foreground">404</p>

        <h1 className="mt-3 text-xl font-bold">{t('There is no such page')}</h1>
        <p className="field-hint mt-1.5">
          {t('The address may have a typo in it, or the thing it pointed at is gone.')}
        </p>

        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 rounded-(--radius) bg-(--accent) px-4 py-2.5 text-sm font-semibold text-(--accent-ink)"
        >
          {t('Go to the calendar')}
        </Link>
      </main>
    </div>
  );
}
