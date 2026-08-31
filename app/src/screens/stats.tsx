import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';

import { Climb } from '@/components/charts/climb';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { calendarApi } from '@/lib/api/calendar';
import { keysBetween, monthBounds, todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

/**
 * Statistics, rebuilt: one question per card, the climb first.
 *
 * The month against the month before it is the comparison people actually
 * make, so it opens the page; the four figures they quote sit above it, each
 * carrying its own change rather than a separate «vs last month» block.
 */
type Span = 'month' | 'year';

export function Stats() {
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));
  const [span, setSpan] = useState<Span>('month');

  const now = todayKey();
  const year = Number(now.slice(0, 4));
  const bounds =
    span === 'month'
      ? monthBounds(now)
      : { from: `${year}-01-01`, to: `${year}-12-31` };
  const before =
    span === 'month'
      ? monthBounds(`${now.slice(0, 8)}01`.replace(/^(\d{4})-(\d{2})/, (_, y: string, m: string) => {
          const month = Number(m) - 1;

          return month === 0 ? `${Number(y) - 1}-12` : `${y}-${`${month}`.padStart(2, '0')}`;
        }))
      : { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };

  const current = useQuery({
    queryKey: ['days', bounds.from, bounds.to],
    queryFn: () => calendarApi.days(bounds.from, bounds.to),
  });
  const previous = useQuery({
    queryKey: ['days', before.from, before.to],
    queryFn: () => calendarApi.days(before.from, before.to),
  });

  const climb = useMemo(() => {
    if (current.data === undefined) return { line: [], ghost: [] };

    const run = (days: { date: string; earned: number }[], from: string, to: string) => {
      const byDate = new Map(days.map((day) => [day.date, day.earned]));
      let sum = 0;

      return keysBetween(from, to).map((key) => {
        sum += byDate.get(key) ?? 0;

        return { label: key, value: sum };
      });
    };

    return {
      line: run(current.data.days, bounds.from, bounds.to),
      ghost:
        previous.data === undefined ? [] : run(previous.data.days, before.from, before.to),
    };
  }, [current.data, previous.data, bounds.from, bounds.to, before.from, before.to]);

  const summary = current.data;
  const past = previous.data;

  const change = (value: number, was: number) =>
    was > 0 ? Math.round((value / was - 1) * 100) : null;

  const facts =
    summary === undefined
      ? []
      : [
          {
            label: 'Заработано',
            value: money(summary.total_earned),
            delta: past === undefined ? null : change(summary.total_earned, past.total_earned),
          },
          {
            label: 'Часов',
            value: `${Math.round(summary.hours)}`,
            delta: past === undefined ? null : change(summary.hours, past.hours),
          },
          {
            label: 'Смен',
            value: `${summary.days_worked}`,
            delta: past === undefined ? null : change(summary.days_worked, past.days_worked),
          },
          {
            label: 'В час',
            value: summary.hours > 0 ? money(summary.total_earned / summary.hours) : '·',
            delta:
              past === undefined || past.hours === 0 || summary.hours === 0
                ? null
                : change(summary.total_earned / summary.hours, past.total_earned / past.hours),
          },
        ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Статистика</h1>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-border p-0.5">
            {(['month', 'year'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={cn(
                  'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                  span === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-ink',
                )}
                onClick={() => setSpan(value)}
              >
                {value === 'month' ? 'Месяц' : 'Год'}
              </button>
            ))}
          </div>

          <Button variant="ghost" size="sm" asChild>
            <a href="/stats">
              Старая версия
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        </div>
      </header>

      {current.isPending ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24 rounded-[var(--radius-card)]" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-[var(--radius-card)]" />
        </>
      ) : summary === undefined ? (
        <p className="card p-4 text-sm" style={{ color: 'var(--danger)' }}>
          Не дотянулись до сервера.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="card p-4">
                <span className="field-hint">{fact.label}</span>
                <span className="mt-0.5 block text-2xl font-bold tabular">{fact.value}</span>
                {fact.delta !== null && fact.delta !== 0 && (
                  <span
                    className={cn(
                      'text-xs font-semibold tabular',
                      fact.delta > 0 ? 'text-good' : 'text-danger',
                    )}
                  >
                    {fact.delta > 0 ? '↑' : '↓'} {Math.abs(fact.delta)}%
                  </span>
                )}
              </div>
            ))}
          </div>

          <section className="card p-4">
            <h2 className="text-base font-bold">Заработано за период</h2>
            <p className="field-hint mb-2">
              Плотная линия — этот {span === 'month' ? 'месяц' : 'год'}, бледная — прошлый. Веди курсором — цифры дня.
            </p>
            <Climb points={climb.line} ghost={climb.ghost} />
          </section>
        </>
      )}
    </div>
  );
}
