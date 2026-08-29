'use client';

import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { CalendarDayData } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/fx';
import { useMono } from '@/lib/mono/store';
import { fromMinor } from '@/lib/mono/mono';
import { Shell } from '@/components/layout/shell';
import { Alert, Money } from '@/components/ui/bits';
import { BankConnect } from '@/components/bank/connect';
import { BankHero } from '@/components/bank/hero';
import { BankLock, bankLockEnabled, setBankLock } from '@/components/bank/lock';
import { BankForecast } from '@/components/bank/forecast';
import { BankShape } from '@/components/bank/shape';
import { BankWage } from '@/components/bank/wage';
import {
  SpendCategories,
  SpendHeadline,
  SpendOddities,
  SpendPlaces,
  SpendRhythm,
  SpendStanding,
} from '@/components/bank/spending';
import {
  CategoryMonthsCard,
  MonthlyFlowsCard,
  ReserveCard,
  SpendPaceCard,
} from '@/components/bank/charts';
import { StatementCard } from '@/components/bank/statement';
import { BankWork } from '@/components/bank/work';

/**
 * The bank, now on the site.
 *
 * The tab lived only in a pocket — five thousand lines of analysis the web
 * knew nothing about. The privacy model survives the move intact: monobank
 * answers browsers directly (checked: access-control-allow-origin: *), so the
 * token goes from this tab to api.monobank.ua and never touches the Shifter
 * server.
 *
 * Every formula on this page is the phone's own file, imported — if the two
 * platforms ever disagree about a figure, that is a bug by definition.
 */
export default function BankPage() {
  const { t, lang } = useI18n();

  useReveal();

  const mono = useMono();

  useEffect(() => {
    mono.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The month being analysed. The bank's own screens all answer "this month"
  // first; deeper history arrives by the sync button, not by surprise.
  const [monthAt, setMonthAt] = useState(() => {
    const now = new Date();

    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const bounds = useMemo(() => {
    const [year, month] = monthAt.split('-').map(Number);
    const last = new Date(year, month, 0).getDate();

    return { from: `${monthAt}-01`, to: `${monthAt}-${String(last).padStart(2, '0')}` };
  }, [monthAt]);

  // The calendar's half of the crossover cards. Fetched like every other page
  // fetches days; the bank never writes to it.
  const [days, setDays] = useState<CalendarDayData[]>([]);

  useEffect(() => {
    void calendarApi
      .days(bounds.from, bounds.to)
      .then((range) => setDays(range.days))
      .catch(() => setDays([]));
  }, [bounds.from, bounds.to]);

  const account = (mono.client?.accounts ?? []).find((entry) => entry.id === mono.accountId);

  const shiftMonth = (delta: number) => {
    const [year, month] = monthAt.split('-').map(Number);
    const moved = new Date(year, month - 1 + delta, 1);

    setMonthAt(`${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <Shell>
      <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-4 px-3 py-4">
        {mono.token === undefined && null}

        {mono.token === null && <BankConnect />}

        {mono.token !== null && mono.token !== undefined && (
          <BankLock>
            {/* ==== Row: the curve, with the accounts desk beside it ==== */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <BankHero
              account={account ?? null}
              items={mono.items}
              from={bounds.from}
              to={bounds.to}
            />

            {/* ==== Accounts and the sync ==== */}
            <section className="card reveal p-4">
              <div className="panel-head mb-2">
                <span>{t('Accounts')}</span>
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => {
                      setBankLock(!bankLockEnabled());
                      window.location.reload();
                    }}
                  >
                    {bankLockEnabled() ? t('Lock: on') : t('Lock: off')}
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={mono.disconnect}>
                    {t('Disconnect and erase')}
                  </button>
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {(mono.client?.accounts ?? []).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`chip ${entry.id === mono.accountId ? 'border-(--accent) bg-(--accent-soft) text-(--accent)' : ''}`}
                    onClick={() => mono.chooseAccount(entry.id)}
                  >
                    •••{entry.maskedPan[0]?.slice(-4) ?? entry.iban.slice(-4)}
                    {' · '}
                    <Money value={fromMinor(entry.balance - entry.creditLimit)} />
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={mono.busy}
                  onClick={() => void mono.sync(35)}
                >
                  {t('Refresh this month')}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={mono.busy}
                  onClick={() => void mono.sync(95)}
                >
                  {t('Load three months')}
                </button>

                {mono.waiting > 0 && (
                  <span className="field-hint tabular">
                    {t('the bank asks to wait')} {mono.waiting}s
                  </span>
                )}

                {mono.progress !== null && (
                  <span className="field-hint tabular">
                    {mono.progress.done}/{mono.progress.total}
                  </span>
                )}
              </div>

              {/* The tab has to stay open for a deep sync — one request a
                  minute is the bank's rule, and pretending otherwise would be
                  a progress bar that lies. */}
              {mono.busy && mono.progress !== null && mono.progress.total > 1 && (
                <p className="field-hint mt-2">
                  {t('One window a minute is the bank’s limit. Keep the tab open; closing it pauses the load.')}
                </p>
              )}

              {mono.error === 'refused' && (
                <Alert kind="error">
                  {t('The bank refused the token. It may have been revoked — issue a new one at api.monobank.ua.')}
                </Alert>
              )}
              {mono.error !== null && mono.error !== 'refused' && (
                <Alert kind="error">{mono.error}</Alert>
              )}
            </section>
            </div>

            {/* ==== Row: forward-looking ==== */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              {/* ==== Дожить до зарплаты: the forward-looking chart ==== */}
              <BankForecast account={account ?? null} items={mono.items} />

              <div className="flex flex-col gap-4">
                {/* ==== The wage, if one looks to have landed ==== */}
                <BankWage items={mono.items} />
                <ReserveCard
                  account={account ?? null}
                  items={mono.items}
                  from={bounds.from}
                  to={bounds.to}
                />
              </div>
            </div>

            {/* ==== Month picker ==== */}
            <div className="flex items-center justify-between">
              <button type="button" className="btn btn-sm" onClick={() => shiftMonth(-1)}>←</button>
              <span className="text-[0.95rem] font-semibold">
                {new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' })
                  .format(new Date(`${monthAt}-15T12:00:00`))}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => shiftMonth(1)}>→</button>
            </div>

            {mono.items.length === 0 && !mono.busy && (
              <Alert kind="info">{t('Nothing loaded yet — press “Refresh this month”.')}</Alert>
            )}

            {/* ==== The headline and its bar, full width ==== */}
            <SpendHeadline items={mono.items} from={bounds.from} to={bounds.to} />

            {/* ==== Row: categories beside the rhythm and the pace ==== */}
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <SpendCategories items={mono.items} from={bounds.from} to={bounds.to} />
              <div className="flex flex-col gap-4">
                <SpendRhythm items={mono.items} from={bounds.from} to={bounds.to} />
                <SpendPaceCard items={mono.items} from={bounds.from} to={bounds.to} />
              </div>
            </div>

            {/* ==== Row: the months, in against out and the mix ==== */}
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <MonthlyFlowsCard items={mono.items} />
              <CategoryMonthsCard items={mono.items} rules={mono.rules} />
            </div>

            {/* ==== Row: places, standing, oddities ==== */}
            <div className="grid items-start gap-4 xl:grid-cols-3">
              <SpendPlaces items={mono.items} from={bounds.from} to={bounds.to} />
              <SpendStanding items={mono.items} from={bounds.from} to={bounds.to} />
              <SpendOddities items={mono.items} from={bounds.from} to={bounds.to} />
            </div>

            {/* ==== The rows everything above is made of ==== */}
            <StatementCard items={mono.items} from={bounds.from} to={bounds.to} />

            {/* ==== Row: the work crossover beside the month's shape ==== */}
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <BankWork items={mono.items} days={days} from={bounds.from} to={bounds.to} />
              <BankShape items={mono.items} from={bounds.from} to={bounds.to} />
            </div>
          </BankLock>
        )}
      </div>
    </Shell>
  );
}
