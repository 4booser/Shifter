'use client';

import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { monthShort, todayKey } from '@/lib/calendar/calendar-date';
import { CalendarDayData } from '@/lib/calendar/models';
import { sameMonthLastYear, seasonalCushion, seasonalIndex, yearShape } from '@/lib/calendar/seasonality';
import { useI18n } from '@/lib/i18n';
import { Money } from '@/components/ui/bits';

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
  const { t, lang } = useI18n();

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
              <strong className="text-good-read">+{Math.round((index - 1) * 100)}%</strong>{' '}
              {t('on a typical one.')}
            </>
          )}
          {index <= 0.9 && (
            <>
              {t('This month is usually')}{' '}
              <strong className="text-danger-read">−{Math.round((1 - index) * 100)}%</strong>{' '}
              {t('on a typical one.')}
            </>
          )}
          {index > 0.9 && index < 1.1 && t('This month is usually an ordinary one.')}
        </p>
      )}

      {/* The row must stay stretched: items-end on it once stopped the
          columns inheriting a height, and every bar quietly collapsed to its
          2px floor. Found by eye on the bank's copy of this pattern. */}
      {/*
        Two things were wrong with this row and both were about what a bar
        means.

        It had no scale. Twelve bars and not one number: a reader could see
        that August beat June and could not see whether the gap was two
        hundred or twenty thousand. The peak now carries its own figure on a
        dashed rule, with the floor named, so the shape has a size.

        And a month with fewer than two years behind it drew a two-pixel
        stub in the border colour, which on a screen is exactly what «earned
        almost nothing» looks like. Those months are not low, they are
        unknown, and the card says so in its own subtitle. Unknown draws
        nothing at all now — an empty slot under a dimmed name.
      */}
      {shape.length > 0 && (
        <div className="mb-1 flex items-baseline justify-between text-[0.62rem] text-faint">
          <span>{t('Average per month')}</span>
          <span className="tabular"><Money value={peak} /></span>
        </div>
      )}
      {shape.length > 0 && (
        <div className="flex h-24 gap-1 border-t border-dashed border-border">
          {Array.from({ length: 12 }, (_, index2) => index2 + 1).map((month) => {
            const row = shape.find((one) => one.month === month);
            const known = row !== undefined;
            const height = known ? (row.average / peak) * 100 : 0;

            return (
              <div key={month} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="flex w-full flex-1 items-end"
                  title={known ? `${monthShort(month, lang)}: ${Math.round(row.average)}` : t('not enough years')}
                >
                  {known && (
                    <div
                      className="w-full rounded-t-[4px]"
                      style={{
                        height: `${Math.max(2, height)}%`,
                        // The month being looked at, against the ones behind it.
                        background:
                          month === thisMonth
                            ? 'var(--accent)'
                            : 'color-mix(in srgb, var(--accent) 35%, var(--surface-2))',
                      }}
                    />
                  )}
                </div>
                <span className={`text-[0.6rem] ${known ? 'text-muted' : 'text-faint opacity-60'}`}>
                  {monthShort(month, lang)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {shape.length > 0 && shape.length < 12 && (
        <p className="field-hint mt-1">
          {t('Dimmed months do not have two years behind them yet.')}
        </p>
      )}

      {/* The cushion: the one actionable sentence a second year of records
          buys. Strictly a transfer between a person's own months — no yield,
          no products, no advice. */}
      {(() => {
        const cushion = seasonalCushion(shape);

        if (cushion === null || cushion.saveShare === null || cushion.saveShare <= 0) return null;

        const spellMonths = (rows: { month: number }[]) =>
          rows.map((row) => monthShort(row.month, lang)).join(', ');

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
