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
import { realHourly } from '@/lib/mono/mono-work';
import { useTitle } from '@/lib/use-title';

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

  /*
   * Первого числа «этот месяц» пуст, и весь банк — пустые карточки: выписка
   * за три месяца загружена, а операций в текущем ещё ноль. Один раз после
   * загрузки съезжаем на последний месяц, в котором что-то было. Дальше
   * стрелки слушаются только человека: перепрыгивать под ним, пока он листает,
   * — худшее, что можно сделать.
   */
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
            {/* ==== Row: the curve, with the accounts desk beside it ==== */}
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
                    className={`chip ${entry.id === mono.accountId ? 'chip-accent' : ''}`}
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

            {/* ==== Row: forward-looking ====

                Соседи справа рисуются не всегда: зарплату видно не в каждом
                месяце, запас — только когда есть с чего его считать. В сетке с
                жёсткой правой колонкой она всё равно занимала треть ширины, и
                рядом с высоким прогнозом висела пустота в пол-экрана. Здесь
                колонки считаются по числу отрисованных карточек: осталась
                одна — она и займёт ряд. Обёртки над ними нет намеренно, иначе
                пустой div считался бы за карточку. */}
            {/* Not items-start: the reserve card is a fifth of the forecast's
                height, and hugging its content left a quarter of the screen
                dark beside it. Stretched, the same emptiness is inside a card,
                which is breathing room rather than a hole. */}
            <div className="cards">
              {/* ==== Дожить до зарплаты: the forward-looking chart ==== */}
              <BankForecast account={account ?? null} items={mono.items} />

              {/* ==== The wage, if one looks to have landed ==== */}
              {/* Never inside the example: matching fictional credits
                  against the real reconciliation would offer to record
                  fiction into a real calendar. */}
              {!mono.demo && <BankWage items={mono.items} />}
              <ReserveCard
                account={account ?? null}
                items={mono.items}
                from={bounds.from}
                to={bounds.to}
              />
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

            {/* ==== Всё, что разбирает месяц, — одной кладкой ====

                Рядами это не укладывается: карточки разной высоты и часть
                из них в иные месяцы не рисуется вовсе, так что ряд из двух
                постоянно оказывался рядом из одного, а рядом с ним — дыра
                во всю его высоту. Кладка ставит следующую карточку туда,
                где кончилась предыдущая. */}
            <div className="deck">
              <SpendCategories items={mono.items} from={bounds.from} to={bounds.to} hourWorth={hourWorth} />
              <SpendRhythm items={mono.items} from={bounds.from} to={bounds.to} />
              <SpendPaceCard items={mono.items} from={bounds.from} to={bounds.to} />
              <MonthlyFlowsCard items={mono.items} />
              <CategoryMonthsCard items={mono.items} rules={mono.rules} />
              <SpendPlaces items={mono.items} from={bounds.from} to={bounds.to} />
              <SpendStanding items={mono.items} from={bounds.from} to={bounds.to} hourWorth={hourWorth} />
              <SpendOddities items={mono.items} from={bounds.from} to={bounds.to} />
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
