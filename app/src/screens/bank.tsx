import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Eye, Landmark, RefreshCw } from 'lucide-react';

import { Climb } from '@/components/charts/climb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bars, BarRow, Panel, Split } from '@/components/charts/bars';
import { calendarApi } from '@/lib/api/calendar';
import { daysWord, timesWord } from '@/lib/text/plural';
import { kindName } from '@/lib/text/kinds';
import { buildRunway, chargesAhead } from '@/lib/mono/runway';
import { balanceCurve } from '@/lib/mono/mono-shape';
import { fromMinor } from '@/lib/mono/mono';
import { counterparties, flow, recurring, refunds } from '@/lib/mono/mono-insights';
import {
  WorkedDay,
  punctuality,
  realHourly,
  spendingByDayKind,
  untilPayday,
  usualDay,
} from '@/lib/mono/mono-work';
import { useMono } from '@/lib/mono/store';
import { cn } from '@/lib/utils';
import { keysBetween, monthBounds, shiftDays, todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { useI18n } from '@/lib/i18n';

/**
 * The bank.
 *
 * The promise the old page made holds here unchanged: the token goes from
 * this browser to the bank and never touches the Shifter server. The example
 * is offered first, because nobody should have to paste a real token to find
 * out whether the page is worth it.
 */
export function Bank() {
  const { t } = useI18n();
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));
  const mono = useMono();

  useEffect(() => {
    mono.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bounds = monthBounds(todayKey());
  const account = (mono.client?.accounts ?? []).find((entry) => entry.id === mono.accountId);

  const curve = useMemo(
    () => balanceCurve(mono.items, bounds.from, bounds.to),
    [mono.items, bounds.from, bounds.to],
  );

  const standing = useMemo(() => recurring(mono.items, bounds.to), [mono.items, bounds.to]);

  /* The day-by-day question needs the calendar as well as the statement, so
     the month's days are fetched alongside. Everything below returns null on
     a thin sample rather than averaging two numbers into a habit. */
  const days = useQuery({
    queryKey: ['days', bounds.from, bounds.to],
    queryFn: () => calendarApi.days(bounds.from, bounds.to),
  });

  /* Every date in the month, not only the ones the calendar stored a row
     for. A day nobody worked usually has no row at all, so passing the
     server's list alone made «days without a shift» always zero and the
     comparison below never appeared. */
  const worked = useMemo((): WorkedDay[] => {
    const known = new Map(
      (days.data?.days ?? []).map((day) => [day.date, day as unknown as WorkedDay]),
    );

    return keysBetween(bounds.from, bounds.to)
      .filter((key) => key <= todayKey())
      .map((key) => known.get(key) ?? { date: key, earned: 0, tips_cash: null, shifts: [] });
  }, [days.data, bounds.from, bounds.to]);

  const byKind = useMemo(
    () => spendingByDayKind(mono.items, worked, bounds.from, bounds.to),
    [mono.items, worked, bounds.from, bounds.to],
  );

  const rate = useMemo(
    () => realHourly(mono.items, worked, bounds.from, bounds.to),
    [mono.items, worked, bounds.from, bounds.to],
  );

  const money_flow = useMemo(
    () => flow(mono.items, bounds.from, bounds.to),
    [mono.items, bounds.from, bounds.to],
  );

  const given = useMemo(() => refunds(mono.items), [mono.items]);

  /* The payout schedule is the calendar's half of two questions the bank
     cannot answer alone: how long the money has to last, and whether the
     places that promised it have actually paid on time. */
  const schedule = useQuery({ queryKey: ['schedule', todayKey()], queryFn: () => calendarApi.schedule(todayKey(), shiftDays(todayKey(), 90)) });

  const balance =
    account === undefined ? 0 : fromMinor(account.balance - account.creditLimit);

  const perDay = useMemo(
    () => usualDay(mono.items, bounds.from, bounds.to),
    [mono.items, bounds.from, bounds.to],
  );

  const ahead = useMemo(
    () => chargesAhead(standing, shiftDays(todayKey(), 1), 60),
    [standing],
  );

  const runway = useMemo(
    () =>
      buildRunway({
        balance,
        usualPerDay: perDay,
        charges: ahead,
        incomes: (schedule.data?.periods ?? [])
          .filter((row) => row.settled === null && row.expected > row.paid && row.due_on >= todayKey())
          .map((row) => ({ name: row.location_name, amount: row.expected - row.paid, on: row.due_on })),
        from: shiftDays(todayKey(), 1),
        horizon: 60,
      }),
    [balance, perDay, ahead, schedule.data],
  );

  const nextPay = (schedule.data?.periods ?? [])
    .filter((row) => row.settled === null && row.expected > row.paid && row.due_on >= todayKey())
    .sort((one, two) => one.due_on.localeCompare(two.due_on))[0];

  const stretch = useMemo(() => {
    if (nextPay === undefined) return null;

    const days = Math.round(
      (new Date(`${nextPay.due_on}T12:00:00`).getTime() -
        new Date(`${todayKey()}T12:00:00`).getTime()) /
        86_400_000,
    );

    return untilPayday(
      balance,
      days,
      ahead.filter((one) => one.on <= nextPay.due_on).reduce((sum, one) => sum + one.amount, 0),
      perDay,
    );
  }, [balance, ahead, perDay, nextPay]);

  const paying = useMemo(
    () => punctuality(schedule.data?.periods ?? []),
    [schedule.data],
  );


  const where = useMemo(
    (): BarRow[] =>
      counterparties(mono.items, bounds.from, bounds.to)
        .slice(0, 8)
        .map((one) => ({
          key: one.key,
          label: one.name,
          value: one.total,
          shown: money(one.total),
          hint: `${one.count} ${timesWord(one.count)}`,
        })),
    [mono.items, bounds.from, bounds.to],
  );

  const spent = mono.items
    .filter((item) => item.amount < 0 && !item.hold)
    .reduce((sum, item) => sum + fromMinor(-item.amount), 0);

  const [typed, setTyped] = useState('');
  const [refused, setRefused] = useState<string | null>(null);

  /* The token goes from this tab to api.monobank.ua and nowhere else — the
     one promise this screen makes, and the reason it is typed here rather
     than posted anywhere. */
  const link = async () => {
    setRefused(null);

    const answer = await mono.connect(typed.trim());

    if (answer === 'refused') setRefused('Банк не принял этот токен.');
    else if (answer === 'failed') setRefused('Не дотянулись до банка. Попробуйте ещё раз.');
    else setTyped('');
  };

  if (mono.token === undefined) return null;

  if (mono.token === null) {
    return (
      <section className="card mx-auto max-w-lg p-6">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Landmark className="size-5" />
          {t('Bank')}
        </h1>
        <p className="field-hint mt-1">
          Токен только на чтение. Он идёт из этого браузера прямо в банк — сервер Shifter его не
          видит.
        </p>

        <Button className="mt-4 w-full" variant="outline" onClick={() => mono.enterDemo()}>
          <Eye className="size-4" />
          Посмотреть на примере
        </Button>
        <p className="field-hint mt-1.5">
          Девяносто выдуманных дней, нарисованных прямо здесь. Банк не участвует.
        </p>

        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
          <span className="field-label">Токен из monobank</span>
          <span className="flex gap-2">
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              placeholder="u...."
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && typed.trim() !== '') void link();
              }}
            />
            <Button disabled={typed.trim() === '' || mono.busy} onClick={() => void link()}>
              Подключить
            </Button>
          </span>
          <span className="field-hint">
            Берётся на api.monobank.ua/index.html. Он только на чтение, отзывается в банке одним
            нажатием, и хранится в этом браузере — на сервер Shifter не уходит.
          </span>
          {refused !== null && (
            <span className="text-sm" style={{ color: 'var(--danger)' }}>
              {refused}
            </span>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('Bank')}</h1>
        <div className="flex items-center gap-2">
          {mono.demo && (
            <Button variant="outline" size="sm" onClick={() => mono.disconnect()}>
              Выйти из примера
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <a href="/bank">
              Старая версия
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        </div>
      </header>

      {mono.demo && (
        <p className="card p-3 text-sm" style={{ background: 'var(--accent-soft)' }}>
          Это пример: девяносто сгенерированных дней, за ними нет банка.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <section className="card p-5">
          <span className="field-hint">{t('On the card')}</span>
          <p className="mt-1 text-3xl font-black tabular">
            {account === undefined ? '·' : money(fromMinor(account.balance - account.creditLimit))}
          </p>
        </section>

        <section className="card p-5">
          <span className="field-hint">Потрачено за месяц</span>
          <p className="mt-1 text-2xl font-bold tabular text-danger">−{money(spent)}</p>
        </section>

        <section className="card p-5">
          <span className="field-hint">Регулярных</span>
          <p className="mt-1 text-2xl font-bold tabular">{standing.length}</p>
          {standing.length > 0 && (
            <p className="field-hint">
              {money(standing.reduce((sum, row) => sum + row.amount * (30 / row.everyDays), 0))} в месяц
            </p>
          )}
        </section>
      </div>

      {curve !== null && curve.length > 1 && (
        <Panel title="Баланс за месяц" hint="Каждая точка — вечер того дня.">
          <Climb
            points={curve.map((point) => ({ label: point.day, value: point.balance }))}
            height={220}
          />
        </Panel>
      )}

      <div className="columns-1 gap-3 lg:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
        {stretch !== null && (
          <Panel
            title="До зарплаты"
            hint={`${stretch.days} ${daysWord(stretch.days)}, ${money(stretch.committed)} уже обещано подпискам.`}
          >
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold tabular">{money(stretch.perDay)}</span>
              <span className="field-hint">в день</span>
            </div>
            <p className="field-hint">
              {stretch.usual > 0 && stretch.perDay < stretch.usual
                ? `Обычно уходит ${money(stretch.usual)} — на ${money(stretch.usual - stretch.perDay)} больше.`
                : stretch.usual > 0
                  ? `Обычно уходит ${money(stretch.usual)}, так что запас есть.`
                  : 'Пока не с чем сравнить — выписка короткая.'}
            </p>
          </Panel>
        )}

        {runway !== null && (
          <Panel
            title={runway.dry === null ? 'Хватит на два месяца' : 'Когда закончится'}
            hint={`Считаем по ${money(runway.usualPerDay)} в день плюс то, что списывается само.`}
          >
            <Climb
              points={runway.days.map((day) => ({ label: day.day, value: day.balance }))}
              height={160}
            />
            <p className="field-hint">
              {runway.dry === null
                ? `Тоньше всего ${dayOfMonth(runway.thinnest.day)} — ${money(runway.thinnest.balance)}.`
                : `Ноль ${dayOfMonth(runway.dry)}, если ничего не изменится.`}
            </p>
          </Panel>
        )}

        {paying.length > 0 && (
          <Panel
            title="Платят ли вовремя"
            hint="По периодам, где деньги уже пришли. Банк это подтверждает, память — нет."
          >
            <ul className="flex flex-col gap-2">
              {paying.map((place) => (
                <li key={place.locationId} className="flex flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium" title={place.place}>{place.place}</span>
                    <span
                      className={cn(
                        'flex-none text-sm font-semibold tabular',
                        place.averageLate > 1 ? 'text-danger' : 'text-good',
                      )}
                    >
                      {place.averageLate <= 0
                        ? 'день в день'
                        : `+${Math.round(place.averageLate)} ${daysWord(Math.round(place.averageLate))}`}
                    </span>
                  </span>
                  <span className="field-hint">
                    {place.settled} {place.settled === 1 ? 'выплата' : 'выплат'} · худшая задержка{' '}
                    {place.worstLate} {daysWord(place.worstLate)}
                    {place.short > 0 && ` · недоплат: ${place.short}`}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* The one thing only this app can say: what a working day costs
            before it has paid anything. It needs both halves of the data and
            says nothing at all on a thin sample. */}
        {byKind !== null && (
          <Panel
            // The title cannot assert which way it went: on some months the
            // working days are the cheaper ones, and a heading that argues
            // with the bars under it is worse than no heading.
            title={
              byKind.onShift > byKind.off
                ? 'Рабочий день дороже'
                : byKind.onShift < byKind.off
                  ? 'В смену тратится меньше'
                  : 'Смена и выходной стоят одинаково'
            }
            hint={`${byKind.onShiftDays} ${daysWord(byKind.onShiftDays)} со сменой против ${byKind.offDays} без.`}
          >
            <Bars
              rows={[
                {
                  key: 'on',
                  label: 'в смену',
                  value: byKind.onShift,
                  shown: money(byKind.onShift),
                  colour: 'var(--warn)',
                },
                {
                  key: 'off',
                  label: 'без смены',
                  value: byKind.off,
                  shown: money(byKind.off),
                },
              ]}
            />
            {byKind.differences.length > 0 && (
              <p className="field-hint">
                Больше всего расходится{' '}
                {byKind.differences
                  .slice(0, 2)
                  .map((one) => kindName(one.kind))
                  .join(' и ')}
                .
              </p>
            )}
          </Panel>
        )}

        {rate !== null && rate.costs > 0 && (
          <Panel
            title="Сколько стоит ваш час на самом деле"
            hint="Из ставки вычтено то, что тратится в дни смен на дорогу и еду."
          >
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold tabular">{money(rate.real)}</span>
              <span className="field-hint tabular">вместо {money(rate.headline)}</span>
            </div>
            <p className="field-hint">
              За {Math.round(rate.hours)} ч работа съела {money(rate.costs)}.
            </p>
          </Panel>
        )}

        {money_flow.spent > 0 && (
          <Panel title="Пришло и ушло" hint="Переводы между своими счетами не в счёт.">
            <Split
              total={money(money_flow.earned)}
              parts={[
                {
                  key: 'left',
                  label: 'осталось',
                  value: Math.max(0, money_flow.left),
                  colour: 'var(--good)',
                },
                {
                  key: 'spent',
                  label: 'потрачено',
                  value: money_flow.spent,
                  colour: 'var(--danger)',
                },
              ]}
            />
            {money_flow.returned > 0 && (
              <p className="field-hint">Вернули {money(money_flow.returned)}.</p>
            )}
          </Panel>
        )}

        {where.length > 0 && (
          <Panel title={t('Where it goes')} hint="Кому платили чаще всего за месяц.">
            <Bars rows={where} highlight={where[0]?.key} />
          </Panel>
        )}

        {standing.length > 0 && (
          <Panel title={t('Comes round by itself')} hint="Подписки и всё, что списывается по кругу.">
            <ul className="flex flex-col gap-1.5">
              {standing.slice(0, 8).map((row) => (
                <li key={row.key} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {row.name}
                    {row.fresh && (
                      <span className="ml-1.5 text-xs font-bold text-accent-foreground">{t('new')}</span>
                    )}
                  </span>
                  <span className="flex-none tabular">
                    {money(row.amount)}
                    <span className="field-hint ml-1.5">
                      след. {row.next.slice(8)}.{row.next.slice(5, 7)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {given.length > 0 && (
          <Panel title="Вернули деньги" hint="Отмены и возвраты, уже вычтенные из трат.">
            <ul className="flex flex-col gap-1">
              {given.slice(0, 5).map((pair) => (
                <li
                  key={pair.refund.id}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 truncate" title={pair.refund.description}>{pair.refund.description}</span>
                  <span className="flex-none tabular text-good">
                    +{money(fromMinor(pair.refund.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      {!mono.demo && (
        <section className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
          {(mono.client?.accounts ?? []).length > 1 && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="field-label">Счёт</span>
              {(mono.client?.accounts ?? []).map((one) => (
                <button
                  key={one.id}
                  type="button"
                  onClick={() => mono.chooseAccount(one.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    mono.accountId === one.id
                      ? 'border-transparent bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground hover:text-ink',
                  )}
                >
                  {one.maskedPan?.[0] ?? one.iban?.slice(-4) ?? one.type}
                </button>
              ))}
            </span>
          )}

          <span className="ml-auto flex items-center gap-2">
            {mono.progress !== null && (
              <span className="field-hint tabular">
                {mono.progress.done} из {mono.progress.total}
              </span>
            )}
            {mono.waiting > 0 && (
              <span className="field-hint tabular">банк просит подождать {mono.waiting} с</span>
            )}
            {/* Monobank allows one statement request a minute, so the days
                asked for are a real choice rather than a slider nobody reads. */}
            {[31, 90].map((back) => (
              <Button
                key={back}
                size="sm"
                variant="outline"
                disabled={mono.busy || mono.accountId === null}
                onClick={() => void mono.sync(back)}
              >
                <RefreshCw className={cn('size-3.5', mono.busy && 'animate-spin')} />
                {back} дней
              </Button>
            ))}
          </span>

          {mono.error !== null && (
            <span className="w-full text-sm" style={{ color: 'var(--danger)' }}>
              {mono.error}
            </span>
          )}
        </section>
      )}
    </div>
  );
}

/** «5 сентября» — a date said the way somebody would read it aloud. */
function dayOfMonth(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long' });
}
