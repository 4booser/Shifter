'use client';

import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { todayKey } from '@/lib/calendar/calendar-date';
import { CalendarDayData } from '@/lib/calendar/models';
import { sameMonthLastYear, seasonalCushion, seasonalIndex, yearShape } from '@/lib/calendar/seasonality';
import { useI18n } from '@/lib/i18n';
import { Money } from '@/components/ui/bits';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * The shape of somebody's own year.
 *
 * "December is always plus forty" is knowledge everybody with two years in the
 * trade has and nobody with one year does. It has been sitting in the records
 * unread, and it is the single most useful thing a second year contains.
 *
 * Their own months only. A bar on a ski slope and a canteen in an office block
 * have opposite Decembers, and no industry average knows which is which.
 */
export function Seasonality() {
  const { t } = useI18n();

  const [days, setDays] = useState<CalendarDayData[] | null>(null);

  useEffect(() => {
    // Three years back: enough for two complete records of every month, and
    // little enough that the request stays one request.
    const from = `${Number(todayKey().slice(0, 4)) - 3}-01-01`;

    void calendarApi
      .days(from, todayKey())
      .then((range) => setDays(range.days))
      .catch(() => setDays([]));
  }, []);

  const today = todayKey();
  const shape = useMemo(() => (days === null ? [] : yearShape(days, today)), [days, today]);
  const lastYear = useMemo(
    () => (days === null ? null : sameMonthLastYear(days, today)),
    [days, today],
  );

  const thisMonth = Number(today.slice(5, 7));
  const index = seasonalIndex(shape, thisMonth);

  // Nothing to say yet is better said by saying nothing. A first-year record
  // has no seasons in it, and inventing some would be inventing the very
  // knowledge this exists to hand over.
  if (shape.length === 0 && lastYear === null) return null;

  const peak = Math.max(1, ...shape.map((row) => row.average));

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1 text-[0.98rem] font-bold">{t('Your year has a shape')}</h2>
      <p className="field-hint mb-3">
        {t('Your own months, not the trade’s. Only the ones with two years behind them.')}
      </p>

      {index !== null && (
        <p className="mb-3 text-[0.92rem]">
          {index >= 1.1 && (
            <>
              {t('This month is usually')}{' '}
              <strong className="text-good">+{Math.round((index - 1) * 100)}%</strong>{' '}
              {t('on a typical one.')}
            </>
          )}
          {index <= 0.9 && (
            <>
              {t('This month is usually')}{' '}
              <strong className="text-danger">−{Math.round((1 - index) * 100)}%</strong>{' '}
              {t('on a typical one.')}
            </>
          )}
          {index > 0.9 && index < 1.1 && t('This month is usually an ordinary one.')}
        </p>
      )}

      {/* The row must stay stretched: items-end on it once stopped the
          columns inheriting a height, and every bar quietly collapsed to its
          2px floor. Found by eye on the bank's copy of this pattern. */}
      {shape.length > 0 && (
        <div className="flex h-24 gap-1">
          {Array.from({ length: 12 }, (_, index2) => index2 + 1).map((month) => {
            const row = shape.find((one) => one.month === month);
            const height = row === undefined ? 0 : (row.average / peak) * 100;

            return (
              <div key={month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${Math.max(2, height)}%`,
                      // The month being looked at, against the ones behind it.
                      background:
                        month === thisMonth
                          ? 'var(--accent)'
                          : row === undefined
                            ? 'var(--border)'
                            : 'color-mix(in srgb, var(--accent) 35%, var(--surface-2))',
                    }}
                    title={row === undefined ? t('not enough years') : `${Math.round(row.average)}`}
                  />
                </div>
                <span className="text-[0.6rem] text-faint">{t(MONTHS[month - 1])}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* The cushion: the one actionable sentence a second year of records
          buys. Strictly a transfer between a person's own months — no yield,
          no products, no advice. */}
      {(() => {
        const cushion = seasonalCushion(shape);

        if (cushion === null || cushion.saveShare === null || cushion.saveShare <= 0) return null;

        const spellMonths = (rows: { month: number }[]) =>
          rows.map((row) => t(MONTHS[row.month - 1])).join(', ');

        return (
          <p className="mt-3 rounded-(--radius) bg-(--accent-soft) px-3 py-2 text-[0.86rem]">
            {t('Set aside about')}{' '}
            <strong className="tabular">{Math.round(cushion.saveShare * 100)}%</strong>{' '}
            {t('of')} {spellMonths(cushion.fat)} —{' '}
            {t('and')} {spellMonths(cushion.lean)}{' '}
            {t('evens out to an ordinary month. Your own months moved between themselves, nothing cleverer.')}
          </p>
        );
      })()}

      {lastYear !== null && (
        <dl className="mt-3 flex flex-col gap-1 text-[0.86rem]">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('The same month a year ago')}</dt>
            <dd className="tabular"><Money value={lastYear.earned} /></dd>
          </div>
          {/* Cut at the same day of the month: a half-finished March against a
              whole one says nothing except that March is not over. */}
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t('By this day of it')}</dt>
            <dd className="tabular"><Money value={lastYear.earnedByNow} /></dd>
          </div>
        </dl>
      )}
    </section>
  );
}
