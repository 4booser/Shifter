'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
import { BankForecast, NextMoneyTile, useRunway } from '@/components/bank/forecast';
import { BankShape } from '@/components/bank/shape';
import { BankWage } from '@/components/bank/wage';
import {
  SpendCategories,
  SpendDonut,
  SpendOddities,
  SpendPlaces,
  SpendRhythm,
  SpendStanding,
  SpentTile,
  StatementDownloadButton,
} from '@/components/bank/spending';
import {
  CategoryMonthsCard,
  MonthlyFlowsCard,
  ReserveTile,
  SpendPaceCard,
  UsualDayTile,
} from '@/components/bank/charts';
import { StatementCard } from '@/components/bank/statement';
import { BankWork } from '@/components/bank/work';
import { realHourly } from '@/lib/mono/mono-work';
import { useTitle } from '@/lib/use-title';
import { Icon } from '@/components/ui/icon';

/** The bank, now on the site. */
export default function BankPage() {
  const { t, lang } = useI18n();

  useTitle('Bank');

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

  /* Первого числа «этот месяц» пуст, и весь банк — пустые карточки: выписка за три месяца загружена, а операций в… */
  const settled = useRef(false);

  useEffect(() => {
    if (settled.current || mono.items.length === 0) return;

    settled.current = true;

    const key = (item: { time: number }) => {
      const at = new Date(item.time * 1000);

      return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
    };

    if (mono.items.some((item) => key(item) === monthAt)) return;

    const newest = mono.items.map(key).sort().at(-1);

    if (newest !== undefined && newest < monthAt) setMonthAt(newest);
  }, [mono.items, monthAt]);

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

  // The walk forward, built once: the tile in the band and the card below it are the same forecast, and two…
  const runway = useRunway(account ?? null, mono.items);

  // The month's real hour — earned minus what going to work took, per hour —
  // so a spend can be said in the unit this app exists to defend.
  const hourWorth = useMemo(() => {
    const rate = realHourly(mono.items, days, bounds.from, bounds.to);

    return rate === null || rate.real <= 0 ? null : rate.real;
  }, [mono.items, days, bounds.from, bounds.to]);

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
            {mono.demo && (
              <Alert kind="info">
                {t('This is an example: ninety generated days, no bank behind them. Paste your own token to see your month like this.')}{' '}
                <button type="button" className="font-semibold underline" onClick={mono.disconnect}>
                  {t('Leave the example')}
                </button>
              </Alert>
            )}

            {/* ==== The page's own head: which month, and the way out ==== The month arrows used to sit halfway down the page */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-[1.3rem] font-bold tracking-tight">{t('Bank')}</h1>

              {/* Wrapping: the month and the download button together are 372 px, and a 390 px phone gave the page four pixels… */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="seg">
                  {/* Two arrows that a screen reader announced as «button» and «button». */}
                  <button
                    type="button"
                    className="seg-btn !px-2"
                    aria-label={t('Previous month')}
                    onClick={() => shiftMonth(-1)}
                  >
                    <Icon name="chevron-left" size={16} />
                  </button>
                  <span className="seg-btn is-active tabular">
                    {new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' })
                      .format(new Date(`${monthAt}-15T12:00:00`))}
                  </span>
                  <button
                    type="button"
                    className="seg-btn !px-2"
                    aria-label={t('Next month')}
                    onClick={() => shiftMonth(1)}
                  >
                    <Icon name="chevron-right" size={16} />
                  </button>
                </span>

                <StatementDownloadButton items={mono.items} from={bounds.from} to={bounds.to} />
              </div>
            </div>

            {/* ==== The band of figures ==== One filled tile and four quiet ones. Everything in it is a single number, and a */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <BankHero
                account={account ?? null}
                items={mono.items}
                from={bounds.from}
                to={bounds.to}
              />
              <ReserveTile
                account={account ?? null}
                items={mono.items}
                from={bounds.from}
                to={bounds.to}
              />
              <UsualDayTile items={mono.items} to={bounds.to} />
              <NextMoneyTile runway={runway} />
              <SpentTile items={mono.items} from={bounds.from} to={bounds.to} />
            </div>

            {/* ==== Where the statement comes from ==== The accounts, the sync and the lock: about the data rather than about */}
            <section className="card reveal overflow-hidden p-0">
              <div className="card-head">
                <h3 className="card-head-title">{t('Accounts')}</h3>
                <span className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={mono.busy || mono.demo}
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

              <div className="card-body">
                <div className="flex flex-wrap items-center gap-2">
                  {(mono.client?.accounts ?? []).map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`chip ${entry.id === mono.accountId ? 'chip-accent' : ''}`}
                      onClick={() => mono.chooseAccount(entry.id)}
                    >
                      •••{entry.maskedPan[0]?.slice(-4) ?? entry.iban.slice(-4)}
                      {' · '}
                      <Money value={fromMinor(entry.balance - entry.creditLimit)} />
                    </button>
                  ))}

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

                {/* The tab has to stay open for a deep sync — one request a minute is the bank's rule, and pretending otherwise… */}
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

                {mono.items.length === 0 && !mono.busy && (
                  <Alert kind="info">{t('Nothing loaded yet — press “Refresh this month”.')}</Alert>
                )}
              </div>
            </section>

            {/* ==== The wage, if one looks to have landed ==== Never inside the example: matching fictional credits against t */}
            {!mono.demo && <BankWage items={mono.items} />}

            {/* ==== Row: forward-looking ==== Both cards read the same thirty days ahead and both go quiet on an empty statem */}
            {mono.items.length > 0 && (
              <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <BankForecast account={account ?? null} runway={runway} />
                <SpendStanding
                  items={mono.items}
                  from={bounds.from}
                  to={bounds.to}
                  hourWorth={hourWorth}
                />
              </div>
            )}

            {/* ==== Row: where the month went ==== The table and the ring are two readings of one list: the ring is for «скол */}
            <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <SpendCategories
                items={mono.items}
                from={bounds.from}
                to={bounds.to}
                hourWorth={hourWorth}
              />
              <SpendDonut items={mono.items} from={bounds.from} to={bounds.to} />
            </div>

            {/* ==== The charts, in pairs of equals ==== `.cards` counts its columns by the number of cards actually drawn, an */}
            <div className="cards-fill">
              <SpendRhythm items={mono.items} from={bounds.from} to={bounds.to} />
              <MonthlyFlowsCard items={mono.items} />
            </div>

            <div className="cards-fill">
              <SpendPaceCard items={mono.items} from={bounds.from} to={bounds.to} />
              <CategoryMonthsCard items={mono.items} rules={mono.rules} />
            </div>

            <div className="cards-fill">
              <SpendPlaces items={mono.items} from={bounds.from} to={bounds.to} />
              <SpendOddities items={mono.items} from={bounds.from} to={bounds.to} />
            </div>

            {/* ==== The small answers, laid as bricks ==== Рядами это не укладывается: карточки разной высоты и часть из них */}
            {/* Сетка, а не кладка. */}
            <div className="cards-fill">
              <BankWork items={mono.items} days={days} from={bounds.from} to={bounds.to} />
              <BankShape items={mono.items} from={bounds.from} to={bounds.to} />
            </div>

            {/* ==== The rows everything above is made of ==== */}
            <StatementCard items={mono.items} from={bounds.from} to={bounds.to} />
          </BankLock>
        )}
      </div>
    </Shell>
  );
}
