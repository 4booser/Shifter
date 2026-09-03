'use client';

import { useEffect, useState } from 'react';

import { FatigueVerdict, RestRead, rhythmApi } from '@/lib/api/rhythm';
import { shiftDays, todayKey } from '@/lib/calendar/calendar-date';
import { useMoney } from '@/lib/settings/money';
import { useI18n } from '@/lib/i18n';

/**
 * The rota's rhythm: the sleep windows between shifts, and what long runs
 * do to the tips.
 *
 * Same contract as the rain card: the record read back, never advice. A
 * close-then-open is shown as the night it actually was; the fatigue line
 * appears only when both piles of days are deep enough and the gap is
 * bigger than noise — and it calls itself a coincidence, because that is
 * what a comparison of two piles of days is.
 */
export function RhythmCard() {
  const { t, num } = useI18n();
  const { format } = useMoney();

  const [rest, setRest] = useState<RestRead | null>(null);
  const [fatigue, setFatigue] = useState<FatigueVerdict | null>(null);

  useEffect(() => {
    void rhythmApi
      .rest(shiftDays(todayKey(), -30), todayKey())
      .then(setRest)
      .catch(() => setRest(null));

    void rhythmApi
      .fatigue()
      .then((verdict) => setFatigue(verdict ?? null))
      .catch(() => setFatigue(null));
  }, []);

  const windows = rest?.windows ?? [];
  const recent = windows.slice(-7);
  const worthFatigue = fatigue !== null && fatigue.noticeable;

  // Nothing measured, nothing noticeable: the card stays out of the page
  // entirely rather than reporting that there is nothing to report.
  if (windows.length === 0 && !worthFatigue) return null;

  const said = (iso: string) => {
    const date = new Date(iso);

    return `${date.toLocaleDateString('ru', { day: 'numeric', month: 'short' })}, ${date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1 text-[0.98rem] font-bold">{t('Nights between shifts')}</h2>
      <p className="field-hint mb-3">
        {t('From clocking out to clocking back in — measured on your own record, said without advice.')}
      </p>

      {windows.length > 0 && rest !== null && (
        <>
          <div className="flex flex-col gap-1.5">
            {recent.map((window) => (
              <div key={window.ended} className="flex items-center gap-2">
                <span className="w-28 flex-none text-[0.75rem] text-muted tabular">
                  {said(window.ended)}
                </span>
                <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${window.short ? 'bg-danger/70' : 'bg-(--accent)/45'}`}
                    style={{ width: `${Math.min(100, (window.hours / 24) * 100)}%` }}
                  />
                  {/* The threshold everyone is measured against, drawn once
                      per row so a short night is short AGAINST something. */}
                  <span
                    className="absolute inset-y-0 w-px bg-danger/50"
                    style={{ left: `${(11 / 24) * 100}%` }}
                  />
                </div>
                <span className={`w-14 flex-none text-right text-[0.8rem] font-semibold tabular ${window.short ? 'text-danger-read' : ''}`}>
                  {num(window.hours)} {t('h')}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-3 text-[0.88rem]">
            {rest.short_count > 0 ? (
              <>
                <b className={rest.short_count >= 3 ? 'text-danger-read' : ''}>
                  {t('Nights shorter than')} {rest.threshold} {t('h')}: {rest.short_count}
                </b>{' '}
                <span className="text-muted">
                  {t('over the last month; the shortest was')} {rest.shortest} {t('h')}.
                </span>
              </>
            ) : (
              <span className="text-muted">
                {t('No nights shorter than')} {rest.threshold} {t('h')} {t('this month.')}
              </span>
            )}
          </p>
        </>
      )}

      {worthFatigue && fatigue !== null && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[0.88rem]">
            <b>{t('Long runs show in the tips:')}</b>{' '}
            <span className="text-muted">
              {t('days one-two of a run pay')} {format(fatigue.fresh_per_hour)}/{t('h')}{' '}
              {t('in tips; by day six —')} {format(fatigue.deep_per_hour)}/{t('h')}
            </span>{' '}
            <b className={fatigue.percent < 0 ? 'text-danger-read' : 'text-good-read'}>
              {fatigue.percent > 0 ? '+' : '−'}
              {Math.abs(fatigue.percent)}%
            </b>
          </p>
          <p className="field-hint mt-1">
            {t('Counted over')} {fatigue.fresh_days + fatigue.deep_days} {t('days of runs. A coincidence, not a cause — but it is the one argument for a day off that speaks money.')}
          </p>
        </div>
      )}

      <p className="field-hint mt-3">
        {t('Your rest threshold lives in the account settings; the app only measures against it.')}
      </p>
    </section>
  );
}
