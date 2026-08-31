import { useEffect, useMemo } from 'react';
import { ArrowUpRight, Eye, Landmark, RefreshCw } from 'lucide-react';

import { Climb } from '@/components/charts/climb';
import { Button } from '@/components/ui/button';
import { balanceCurve } from '@/lib/mono/mono-shape';
import { fromMinor } from '@/lib/mono/mono';
import { recurring } from '@/lib/mono/mono-insights';
import { useMono } from '@/lib/mono/store';
import { monthBounds, todayKey } from '@/lib/calendar/calendar-date';
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
        <section className="card p-4">
          <h2 className="text-base font-bold">Баланс за месяц</h2>
          <p className="field-hint mb-2">Каждая точка — вечер того дня.</p>
          <Climb
            points={curve.map((point) => ({ label: point.day, value: point.balance }))}
            height={220}
          />
        </section>
      )}

      {standing.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-base font-bold">Приходит само</h2>
          <ul className="flex flex-col gap-1.5">
            {standing.slice(0, 8).map((row) => (
              <li key={row.key} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {row.name}
                  {row.fresh && <span className="ml-1.5 text-xs font-bold text-accent-foreground">новое</span>}
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
        </section>
      )}

      {mono.items.length === 0 && !mono.busy && (
        <p className="card flex items-center gap-2 p-4 text-sm">
          <RefreshCw className="size-4" />
          Выписка ещё не загружена — это делается на старой странице.
        </p>
      )}
    </div>
  );
}
