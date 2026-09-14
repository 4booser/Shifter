'use client';

import Link from 'next/link';

import { useI18n } from '@/lib/i18n';

/** A wrong address, in the app's own skin. */
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
