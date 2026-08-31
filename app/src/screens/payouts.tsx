import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CalendarClock, CircleAlert, Coins } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { calendarApi } from '@/lib/api/calendar';
import { PayPeriodRow } from '@/lib/calendar/models';
import { addMonths, currentMonth, todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

/**
 * Payouts: what is owed, what is late, and what lands next.
 *
 * The nearest payday is the headline because it is the question — «когда
 * придут деньги» — and everything under it is the evidence for the answer:
 * one row per period, its status said in a word and in a colour, never in a
 * colour alone.
 */
const STATUS: Record<PayPeriodRow['status'], { label: string; tone: string }> = {
  open: { label: 'Идёт', tone: 'text-muted-foreground' },
  due: { label: 'Ждём', tone: 'text-ink' },
  overdue: { label: 'Задержка', tone: 'text-danger' },
  partial: { label: 'Аванс', tone: 'text-warn' },
  paid: { label: 'Пришло', tone: 'text-good' },
  short: { label: 'Недоплата', tone: 'text-danger' },
  over: { label: 'С запасом', tone: 'text-good' },
};

export function Payouts() {
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  const now = currentMonth();
  const from = `${addMonths(now, -3).year}-${`${addMonths(now, -3).month}`.padStart(2, '0')}-01`;
  const ahead = addMonths(now, 2);
  const last = new Date(ahead.year, ahead.month - 1, 0);
  const to = `${last.getFullYear()}-${`${last.getMonth() + 1}`.padStart(2, '0')}-${`${last.getDate()}`.padStart(2, '0')}`;

  const schedule = useQuery({
    queryKey: ['schedule', from, to],
    queryFn: () => calendarApi.schedule(from, to),
  });

  const next = useMemo(() => {
    const rows = (schedule.data?.periods ?? [])
      .filter((row) => row.settled === null && row.due_on >= todayKey() && row.expected > row.paid)
      .sort((one, two) => one.due_on.localeCompare(two.due_on));

    if (rows.length === 0) return null;

    const day = rows[0].due_on;
    const landing = rows.filter((row) => row.due_on === day);

    return {
      day,
      amount: landing.reduce((sum, row) => sum + (row.expected - row.paid), 0),
      payments: landing.length,
      places: [...new Set(landing.map((row) => row.location_name))],
    };
  }, [schedule.data]);

  const waiting = (schedule.data?.periods ?? [])
    .filter((row) => row.settled === null && row.expected > row.paid)
    .sort((one, two) => one.due_on.localeCompare(two.due_on));
  const settled = (schedule.data?.periods ?? [])
    .filter((row) => row.expected <= row.paid || row.settled !== null)
    .sort((one, two) => two.due_on.localeCompare(one.due_on))
    .slice(0, 8);

  const owed = waiting.reduce((sum, row) => sum + (row.expected - row.paid), 0);
  const late = waiting
    .filter((row) => row.status === 'overdue' || row.status === 'short')
    .reduce((sum, row) => sum + (row.expected - row.paid), 0);

  const days = next === null ? null : Math.round(
    (new Date(`${next.day}T00:00:00`).getTime() - new Date(`${todayKey()}T00:00:00`).getTime()) / 86_400_000,
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Выплаты</h1>
        <Button variant="ghost" size="sm" asChild>
          <a href="/payouts">
            Старая версия
            <ArrowUpRight className="size-3.5" />
          </a>
        </Button>
      </header>

      {schedule.isPending ? (
        <>
          <Skeleton className="h-32 rounded-[var(--radius-card)]" />
          <Skeleton className="h-64 rounded-[var(--radius-card)]" />
        </>
      ) : schedule.isError ? (
        <p className="card p-4 text-sm" style={{ color: 'var(--danger)' }}>
          Не дотянулись до сервера.
        </p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className="card relative overflow-hidden p-5">
              <span
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full blur-2xl"
                style={{ background: 'var(--accent-soft)' }}
              />
              <span className="field-hint flex items-center gap-1.5">
                <CalendarClock className="size-3.5" />
                Ближайшие деньги
              </span>

              {next === null ? (
                <p className="mt-2 text-lg font-semibold">Пока ничего не ждём</p>
              ) : (
                <>
                  <p className="mt-1 text-4xl font-black tabular text-good">{money(next.amount)}</p>
                  <p className="field-hint mt-1">
                    {days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} дн.`} ·{' '}
                    {new Date(`${next.day}T12:00:00`).toLocaleDateString('ru', {
                      day: 'numeric',
                      month: 'long',
                    })}
                    {next.payments > 1 ? ` · ${next.payments} платежа` : ''} · {next.places.join(' + ')}
                  </p>
                </>
              )}
            </section>

            <section className="card p-5">
              <span className="field-hint flex items-center gap-1.5">
                <Coins className="size-3.5" />
                Всего ждём
              </span>
              {/* Counted from the very rows listed below: a headline that
                  disagrees with the list under it is the first thing a
                  person notices, and the last thing they forgive. */}
              <p className="mt-1 text-2xl font-bold tabular">{money(owed)}</p>

              {late > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-danger">
                  <CircleAlert className="size-4" />
                  {money(late)} задерживают
                </p>
              )}
            </section>
          </div>

          <Rows title="Ждём" rows={waiting} money={money} />
          {settled.length > 0 && <Rows title="Закрыто" rows={settled} money={money} muted />}
        </>
      )}
    </div>
  );
}

function Rows({
  title,
  rows,
  money,
  muted = false,
}: {
  title: string;
  rows: PayPeriodRow[];
  money: (value: number) => string;
  muted?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="card p-4">
      <h2 className="mb-2 text-base font-bold">{title}</h2>

      <ul className="flex flex-col">
        {rows.map((row) => {
          const status = STATUS[row.status];

          return (
            <li
              key={`${row.location_id}:${row.period_from}:${row.stream}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2.5 last:border-0"
            >
              <span
                aria-hidden
                className="size-2.5 flex-none rounded-full"
                style={{ background: row.colour }}
              />

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.location_name}</span>
                  <span className={cn('text-xs font-semibold', status.tone)}>{status.label}</span>
                  {row.days_late > 0 && (
                    <span className="text-xs text-danger tabular">+{row.days_late} дн.</span>
                  )}
                </span>
                <span className="field-hint tabular">
                  {row.period_from} — {row.period_to} · выплата{' '}
                  {new Date(`${row.due_on}T12:00:00`).toLocaleDateString('ru', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </span>

              <span className={cn('text-right tabular', muted && 'text-muted-foreground')}>
                <span className="block font-semibold">{money(row.expected)}</span>
                {row.paid > 0 && row.paid !== row.expected && (
                  <span className="field-hint">пришло {money(row.paid)}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
