'use client';

import { useMemo } from 'react';

import { Rota } from '@/lib/api/team';
import { costIsLegible, weekCost } from '@/lib/calendar/week-cost';
import { useI18n } from '@/lib/i18n';
import { Money } from '@/components/ui/bits';

/**
 * What the rota on screen costs, while it is still a draft.
 *
 * The decision is made here — before publication, when a shift can still be
 * moved without a conversation. Everything after that is bookkeeping.
 *
 * It reports a covered figure and the hours it does not cover, and never a
 * total. Estimating the missing wages from the known ones would put a number
 * on somebody's pay that they specifically chose not to share, and it would be
 * wrong besides.
 */
export function WeekCostPanel({ rota }: { rota: Rota }) {
  const { t, lang } = useI18n();

  const cost = useMemo(() => weekCost(rota.entries, rota.members), [rota]);

  if (!costIsLegible(cost)) return null;

  const dearest = [...cost.byDay].sort((one, two) => two.covered - one.covered)[0];
  const weekday = new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric' });

  return (
    <section className="card reveal p-4">
      <div className="panel-head mb-2">
        <span>{t('What this rota costs')}</span>
        <span className="text-faint">
          {cost.sharing}/{cost.people} {t('sharing')}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="tabular text-[1.35rem] font-bold">
          <Money value={cost.covered} />
        </span>
        <span className="text-[0.84rem] text-muted">
          {cost.coveredHours} {t('h')}
          {cost.perHour !== null && (
            <>
              {' · '}
              <Money value={cost.perHour} />/{t('h')}
            </>
          )}
        </span>
      </div>

      {/* Said as plainly as the figure itself. A covered sum presented alone
          gets read as the wage bill, whatever the caption says. */}
      {cost.uncoveredHours > 0 && (
        <p className="field-hint mt-2">
          {t('Not counted:')} {cost.uncoveredHours} {t('h')}{' '}
          {t('rostered by people who do not share what they earn. There is no estimate for it.')}
        </p>
      )}

      {dearest !== undefined && dearest.covered > 0 && (
        <p className="mt-2 text-[0.86rem] text-muted">
          {t('Dearest day')}: {weekday.format(new Date(`${dearest.date}T12:00:00`))} ·{' '}
          <Money value={dearest.covered} />
        </p>
      )}
    </section>
  );
}
