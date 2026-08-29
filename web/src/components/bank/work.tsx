'use client';

import { useMemo } from 'react';

import { useI18n } from '@/lib/i18n';
import { CalendarDayData } from '@/lib/calendar/models';
import { MonoStatementItem } from '@/lib/mono/mono';
import { WorkedDay, closingCosts, realHourly, spendingByDayKind } from '@/lib/mono/mono-work';
import { Money } from '@/components/ui/bits';

/**
 * The cards that make the bank belong inside Shifter rather than beside it:
 * every one needs both the statement and the rota, and no standalone banking
 * app has the second.
 *
 * All three go silent without enough of either. A card that guessed would be
 * mixing an estimate into a fact.
 */
export function BankWork({
  items,
  days,
  from,
  to,
}: {
  items: MonoStatementItem[];
  days: CalendarDayData[];
  from: string;
  to: string;
}) {
  const { t } = useI18n();

  // The web's day model carries everything the crossover functions read; the
  // cast is structural, not a coercion.
  const worked = days as unknown as WorkedDay[];

  const rate = useMemo(() => realHourly(items, worked, from, to), [items, worked, from, to]);
  const closing = useMemo(() => closingCosts(items, worked, from, to), [items, worked, from, to]);
  const byKind = useMemo(
    () => spendingByDayKind(items, worked, from, to),
    [items, worked, from, to],
  );

  if (items.length === 0 || days.length === 0) return null;

  return (
    <>
      {rate !== null && (
        <section className="card reveal p-4">
          <div className="panel-head mb-2">
            <span>{t('What an hour really pays')}</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="tabular text-[1.35rem] font-bold">
              <Money value={Math.round(rate.real)} />/{t('h')}
            </span>
            <span className="text-[0.86rem] text-muted">
              {t('on paper')} <Money value={Math.round(rate.headline)} />/{t('h')}
              {' · '}
              {t('work days cost')} <Money value={rate.costs} />
            </span>
          </div>

          <p className="field-hint mt-2">
            {t('The paper rate, less what working days themselves cost — travel, food on shift, everything spent on days you worked.')}
          </p>
        </section>
      )}

      {closing.closings >= 3 && closing.ride > 0 && (
        <section className="card reveal p-4">
          <div className="panel-head mb-2">
            <span>{t('The price of a close')}</span>
          </div>

          {/* The venue pays the night premium and the person pays the fare,
              and nobody had ever put the two numbers side by side because
              they live in different applications. */}
          <p className="text-[0.92rem]">
            {closing.closings} {t('closes ended in')}{' '}
            <strong className="tabular"><Money value={closing.ride} /></strong>{' '}
            {t('of rides home — about')}{' '}
            <strong className="tabular">
              <Money value={Math.round(closing.ride / closing.closings)} />
            </strong>{' '}
            {t('per close, against')}{' '}
            <span className="tabular"><Money value={closing.earned} /></span>{' '}
            {t('they earned.')}
          </p>
        </section>
      )}

      {byKind !== null && (
        <section className="card reveal p-4">
          <div className="panel-head mb-2">
            <span>{t('Work days against days off')}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="field-hint">
                {t('a worked day costs')} · {byKind.onShiftDays} {t('days')}
              </span>
              <div className="tabular text-[1.1rem] font-bold">
                <Money value={Math.round(byKind.onShift)} />
              </div>
            </div>
            <div>
              <span className="field-hint">
                {t('a day off costs')} · {byKind.offDays} {t('days')}
              </span>
              <div className="tabular text-[1.1rem] font-bold">
                <Money value={Math.round(byKind.off)} />
              </div>
            </div>
          </div>

          {/* Where the two differ most — the categories that are really about
              work, whatever they are called at the till. */}
          {byKind.differences.length > 0 && (
            <div className="mt-2 flex flex-col gap-0.5">
              {byKind.differences.slice(0, 3).map((row) => (
                <div key={row.kind} className="flex justify-between gap-2 text-[0.82rem] text-muted">
                  <span>{row.kind}</span>
                  <span className="tabular">
                    <Money value={Math.round(row.onShift)} /> {t('vs')}{' '}
                    <Money value={Math.round(row.off)} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
