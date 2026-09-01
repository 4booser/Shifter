'use client';

import { useCallback, useEffect, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import { WorkHistory } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { useReveal } from '@/lib/fx';
import { Chronicle } from '@/components/dashboard/chronicle';
import { Alert } from '@/components/ui/bits';
import { Shell } from '@/components/layout/shell';

/**
 * The biography that has been accumulating in the calendar all along.
 *
 * Somebody who has used this for two years is carrying a proven work history —
 * how long, where, how many shifts, what an hour was worth — and at an
 * interview they recite it from memory and round it wrong in both directions.
 * Nothing on this page is invented: every figure comes from days that were
 * actually recorded, which is exactly what makes it worth showing to somebody
 * who has no reason to believe you.
 *
 * Money is off by default. A CV that opens with what you were paid is a CV
 * that argues about the wrong thing first.
 */
export default function CvPage() {
  return (
    <Shell>
      <Cv />
    </Shell>
  );
}

function Cv() {
  const { t, n, lang } = useI18n();
  const { formatIn } = useMoney();
  const revealHost = useReveal<HTMLDivElement>();

  const [history, setHistory] = useState<WorkHistory | null>(null);
  const [money, setMoney] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void calendarApi
      .history(money)
      .then(setHistory)
      .catch((caught) => setError(apiErrorMessage(caught)));
  }, [money]);

  useEffect(load, [load]);

  /** "март 2025" — a month the way somebody would say it out loud. */
  const said = (key: string | null) => {
    if (key === null) return '';

    const [year, month] = key.split('-');

    return `${new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(lang, {
      month: 'long',
    })} ${year}`;
  };

  return (
    <div ref={revealHost} className="flex flex-col gap-3">
      <header className="card reveal p-4 print:border-0 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-[1.35rem] font-extrabold tracking-tight">{t('Your record')}</h1>
            <p className="field-hint max-w-prose">
              {t('Everything here comes from shifts you actually recorded. That is what makes it worth showing to somebody who has no reason to believe you.')}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              type="button"
              className={`btn btn-sm ${money ? 'btn-primary' : 'btn-quiet'}`}
              aria-pressed={money}
              onClick={() => setMoney((was) => !was)}
            >
              {t('Show rates')}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => window.print()}>
              {t('Print or save as PDF')}
            </button>
          </div>
        </div>
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {history !== null && history.shifts === 0 && (
        <section className="card reveal p-4">
          <p className="field-hint">
            {t('Nothing recorded yet. A month of shifts is already worth showing.')}
          </p>
        </section>
      )}

      {history !== null && history.shifts > 0 && (
        <>
          <section className="card reveal p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure value={`${history.months}`} label={t('months in the trade')} />
              <Figure value={`${history.shifts}`} label={t('shifts worked')} />
              <Figure value={`${Math.round(history.hours)}`} label={t('hours')} />
              <Figure value={`${history.places.length}`} label={t('places')} />
            </div>
            <p className="field-hint mt-2.5">
              {said(history.first_month)} — {said(history.last_month)}
            </p>
          </section>

          <section className="card reveal p-4">
            <h2 className="mb-2 text-[0.98rem] font-bold">{t('Where')}</h2>
            <ul className="flex flex-col gap-2">
              {history.places.map((place) => (
                <li
                  key={`${place.name}-${place.from}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2 last:border-0"
                >
                  <span className={`text-[1rem] font-bold ${place.name === '' ? 'text-muted' : ''}`}>
                    {place.name === '' ? t('No place set') : place.name}
                  </span>
                  <span className="field-hint tabular">
                    {said(place.from)} — {said(place.to)}
                  </span>
                  <span className="ml-auto tabular text-[0.88rem]">
                    {n(place.shifts, 'shifts')} · {n(Math.round(place.hours), 'hours')}
                    {place.per_hour !== null && (
                      <>
                        {' · '}
                        <b>{formatIn(place.currency, place.per_hour)}</b>
                        <span className="text-muted">{t('/hour')}</span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* ==== Помесячно: то, ради чего этот лист и распечатывают ====

              Четыре круглых числа за три года никто не проверит и потому
              никто им и не верит. Табель по месяцам проверяется строкой:
              вот март, вот двадцать один отработанный день, вот сто
              шестьдесят часов, вот сколько стоил час. */}
          {history.by_month.length > 0 && (
            <section className="card reveal p-4">
              <h2 className="mb-1 text-[0.98rem] font-bold">{t('Month by month')}</h2>
              <p className="field-hint mb-2.5">
                {t('Days actually stood, the hours they came to, and what an hour was worth.')}
              </p>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-[0.88rem]">
                  <thead>
                    <tr className="text-[0.72rem] tracking-wide text-faint uppercase">
                      <th className="py-1.5 text-left font-medium">{t('Month')}</th>
                      <th className="py-1.5 text-right font-medium">{t('Days worked')}</th>
                      <th className="py-1.5 text-right font-medium">{t('Shifts')}</th>
                      <th className="py-1.5 text-right font-medium">{t('Hours')}</th>
                      {money && <th className="py-1.5 text-right font-medium">{t('Per hour')}</th>}
                      {money && <th className="py-1.5 text-right font-medium">{t('Earned')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {history.by_month.map((row) => (
                      <tr key={row.month} className="border-t border-border">
                        <td className="py-1.5 whitespace-nowrap">{said(row.month)}</td>
                        <td className="py-1.5 text-right tabular">{row.days}</td>
                        <td className="py-1.5 text-right tabular">{row.shifts}</td>
                        <td className="py-1.5 text-right tabular">{Math.round(row.hours)}</td>
                        {money && (
                          <td className="py-1.5 text-right tabular">
                            {row.per_hour === null ? '—' : formatIn('', row.per_hour)}
                          </td>
                        )}
                        {money && (
                          <td className="py-1.5 text-right font-semibold tabular">
                            {row.earned === null ? '—' : formatIn('', row.earned)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border-strong font-semibold">
                      <td className="py-1.5">{t('Total')}</td>
                      <td className="py-1.5 text-right tabular">
                        {history.by_month.reduce((sum, row) => sum + row.days, 0)}
                      </td>
                      <td className="py-1.5 text-right tabular">{history.shifts}</td>
                      <td className="py-1.5 text-right tabular">{Math.round(history.hours)}</td>
                      {money && <td />}
                      {money && (
                        <td className="py-1.5 text-right tabular">
                          {formatIn(
                            '',
                            history.by_month.reduce((sum, row) => sum + (row.earned ?? 0), 0),
                          )}
                        </td>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="field-hint mt-2.5">
                {t('A double shift is one day worked, not two — the tally counts days and shifts apart.')}
              </p>
            </section>
          )}

          {history.roles.length > 0 && (
            <section className="card reveal p-4">
              <h2 className="mb-2 text-[0.98rem] font-bold">{t('What you were on')}</h2>
              <div className="flex flex-wrap gap-1.5">
                {history.roles.map((role) => (
                  <span key={role} className="chip">
                    {role}
                  </span>
                ))}
              </div>
              <p className="field-hint mt-2">
                {t('Your own names for your own shifts — the nearest thing this app has to a job title.')}
              </p>
            </section>
          )}
        </>
      )}

      {/* The back room: never printed, never on the card. */}
      <Chronicle />
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[1.7rem] font-extrabold tracking-tight tabular">{value}</div>
      <div className="field-hint">{label}</div>
    </div>
  );
}
