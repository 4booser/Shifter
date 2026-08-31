import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Eye, Landmark, RefreshCw } from 'lucide-react';

import { Climb } from '@/components/charts/climb';
import { Button } from '@/components/ui/button';
import { Bars, BarRow, Panel, Split } from '@/components/charts/bars';
import { calendarApi } from '@/lib/api/calendar';
import { daysWord, timesWord } from '@/lib/text/plural';
import { kindName } from '@/lib/text/kinds';
import { balanceCurve } from '@/lib/mono/mono-shape';
import { fromMinor } from '@/lib/mono/mono';
import { counterparties, flow, recurring, refunds } from '@/lib/mono/mono-insights';
import { WorkedDay, realHourly, spendingByDayKind } from '@/lib/mono/mono-work';
import { useMono } from '@/lib/mono/store';
import { keysBetween, monthBounds, todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';

/**
 * The bank.
 *
 * The promise the old page made holds here unchanged: the token goes from
 * this browser to the bank and never touches the Shifter server. The example
 * is offered first, because nobody should have to paste a real token to find
 * out whether the page is worth it.
 */
export function Bank() {
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

  if (mono.token === undefined) return null;

  if (mono.token === null) {
    return (
      <section className="card mx-auto max-w-lg p-6">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Landmark className="size-5" />
          Банк
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

        <Button className="mt-4 w-full" asChild>
          <a href="/bank">
            Подключить выписку на старой странице
            <ArrowUpRight className="size-3.5" />
          </a>
        </Button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Банк</h1>
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
          <span className="field-hint">На карте</span>
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
          <Panel title="Куда уходит" hint="Кому платили чаще всего за месяц.">
            <Bars rows={where} highlight={where[0]?.key} />
          </Panel>
        )}

        {standing.length > 0 && (
          <Panel title="Приходит само" hint="Подписки и всё, что списывается по кругу.">
            <ul className="flex flex-col gap-1.5">
              {standing.slice(0, 8).map((row) => (
                <li key={row.key} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {row.name}
                    {row.fresh && (
                      <span className="ml-1.5 text-xs font-bold text-accent-foreground">новое</span>
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
                  <span className="min-w-0 truncate">{pair.refund.description}</span>
                  <span className="flex-none tabular text-good">
                    +{money(fromMinor(pair.refund.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      {mono.items.length === 0 && !mono.busy && (
        <p className="card flex items-center gap-2 p-4 text-sm">
          <RefreshCw className="size-4" />
          Выписка ещё не загружена — это делается на старой странице.
        </p>
      )}
    </div>
  );
}
