'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api/http';
import { useMoney } from '@/lib/settings/money';
import { useI18n } from '@/lib/i18n';

interface Cheer {
  period: string;
  period_from: string;
  amount: number;
  celebrated_at: string;
}

interface Shelf {
  weekly_streak: number;
  cheers: Cheer[];
}

/**
 * The trophy shelf: goals that were crossed, kept as they stood.
 *
 * The bar can be raised later; the trophies already won do not move — a
 * shelf you can rewrite is a story, not a record. The weekly streak is the
 * same kind of sentence as the day streak: a number and its history.
 */
const PERIOD: Record<string, string> = {
  day: 'дневная',
  week: 'недельная',
  month: 'месячная',
  year: 'годовая',
};

export function TrophyShelf() {
  const { t, n, lang } = useI18n();
  const { format } = useMoney();

  const [shelf, setShelf] = useState<Shelf | null>(null);

  useEffect(() => {
    void api<Shelf>('/shifter/v1/goals/history')
      .then(setShelf)
      .catch(() => setShelf(null));
  }, []);

  if (shelf === null || shelf.cheers.length === 0) return null;

  const said = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short' });

  return (
    <section className="card reveal p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[0.98rem] font-bold">{t('The shelf')}</h2>
        {shelf.weekly_streak >= 2 && (
          <span className="chip !border-transparent !bg-(--good-soft) !text-[0.78rem] font-semibold chip-good">
            {n(shelf.weekly_streak, 'weeks')} {t('in a row')}
          </span>
        )}
      </div>
      <p className="field-hint mb-3">
        {t('Crossed goals, kept as they stood — raising the bar later does not move a trophy already won.')}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {shelf.cheers.slice(0, 18).map((cheer) => (
          <span
            key={`${cheer.period}-${cheer.period_from}`}
            className="chip !py-1.5 !text-[0.82rem]"
            title={cheer.period_from}
          >
            🏆 <b className="tabular">{format(cheer.amount)}</b>
            <span className="text-faint">
              {t(PERIOD[cheer.period] ?? cheer.period)} · {said(cheer.period_from)}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}
