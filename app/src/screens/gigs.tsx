import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, MapPin, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { gigApi } from '@/lib/api/gigs';
import { addMonths, currentMonth, todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

/**
 * The board: one-off shifts somebody could take this fortnight.
 *
 * Every card answers the only question that matters before the details —
 * «is this worth more than my own hour?» — and answers it in the reader's own
 * figures, not in a rating out of five.
 */
export function Gigs() {
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));
  // The city filter is a text field on the old page; the board simply
  // shows everything until the picker moves across.
  const city = '';

  const ahead = addMonths(currentMonth(), 1);
  const to = `${ahead.year}-${`${ahead.month}`.padStart(2, '0')}-28`;

  const board = useQuery({
    queryKey: ['gigs', todayKey(), to, city],
    queryFn: () => gigApi.board(todayKey(), to, null, city, 'freelance'),
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Подработки</h1>
        <Button variant="ghost" size="sm" asChild>
          <a href="/gigs">
            Старая версия
            <ArrowUpRight className="size-3.5" />
          </a>
        </Button>
      </header>

      {board.isPending ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-40 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : board.isError ? (
        <p className="card p-4 text-sm" style={{ color: 'var(--danger)' }}>
          Не дотянулись до сервера.
        </p>
      ) : board.data.length === 0 ? (
        <section className="card p-6 text-center">
          <Sparkles className="mx-auto mb-2 size-6 text-accent-foreground" />
          <p className="text-lg font-semibold">Пока никто не ищет смену</p>
          <p className="field-hint">
            Загляните позже — или разместите своё объявление на старой странице.
          </p>
        </section>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {board.data.map((gig) => {
            const better = gig.worth !== null && gig.worth.difference_percent > 0;

            return (
              <article key={gig.id} className="card flex flex-col gap-2 p-4">
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold">{gig.title}</h2>
                    <p className="field-hint flex items-center gap-1">
                      <MapPin className="size-3" />
                      {gig.venue} · {gig.city}
                    </p>
                  </div>
                  {gig.urgent && (
                    <span
                      className="flex-none rounded-full px-2 py-0.5 text-2xs font-bold"
                      style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
                    >
                      срочно
                    </span>
                  )}
                </header>

                <p className="text-sm tabular">
                  {new Date(`${gig.date}T12:00:00`).toLocaleDateString('ru', {
                    day: 'numeric',
                    month: 'long',
                  })}{' '}
                  · {gig.start.slice(0, 5)}–{gig.end.slice(0, 5)}
                </p>

                <p className="text-lg font-bold tabular">
                  {money(gig.pay_amount)}
                  <span className="field-hint ml-1">
                    {gig.pay_period === 'hour' ? 'в час' : gig.pay_period === 'shift' ? 'за смену' : 'в месяц'}
                  </span>
                </p>

                {gig.worth !== null && (
                  <p
                    className={cn(
                      'flex items-center gap-1 text-sm font-semibold',
                      better ? 'text-good' : 'text-danger',
                    )}
                  >
                    {better ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                    {money(gig.worth.offered_per_hour)}/час — на{' '}
                    {Math.abs(Math.round(gig.worth.difference_percent))}%{' '}
                    {better ? 'выше вашего' : 'ниже вашего'}
                  </p>
                )}

                <Button className="mt-auto" variant="outline" size="sm" asChild>
                  <a href={`/gigs?gig=${gig.id}`}>
                    Открыть и откликнуться
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
