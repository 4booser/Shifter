import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, MapPin, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { GIG_CATEGORIES, GIG_GROUPS, GigEmployment, gigApi } from '@/lib/api/gigs';
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

  const [employment, setEmployment] = useState<GigEmployment>('freelance');
  const [group, setGroup] = useState<string | null>(null);
  const [city, setCity] = useState('');
  /* The typed city is held back from the query: a request per keystroke
     against a board of hundreds is a lot of work to show somebody a list
     that empties as they type «Дн». */
  const [asked, setAsked] = useState('');

  const ahead = addMonths(currentMonth(), 1);
  const to = `${ahead.year}-${`${ahead.month}`.padStart(2, '0')}-28`;

  const board = useQuery({
    queryKey: ['gigs', todayKey(), to, asked, employment],
    queryFn: () => gigApi.board(todayKey(), to, null, asked, employment),
  });

  /* The group filter is applied here rather than asked of the server: the
     API narrows by one category, and a group is eight of them. */
  const shown = (board.data ?? []).filter(
    (gig) =>
      group === null ||
      GIG_CATEGORIES.find((entry) => entry.id === gig.category)?.group === group,
  );

  const groupsPresent = GIG_GROUPS.filter((one) =>
    (board.data ?? []).some(
      (gig) => GIG_CATEGORIES.find((entry) => entry.id === gig.category)?.group === one,
    ),
  );

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

      {/* One row of filters above the board, the way every list of things to
          apply for is read: what kind of work, where, and in what part of the
          house. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-border p-0.5">
          {(
            [
              ['freelance', 'разовые'],
              ['permanent', 'постоянные'],
            ] as [GigEmployment, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setEmployment(value)}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                employment === value
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            setAsked(city.trim());
          }}
        >
          <Input
            className="h-8 w-36"
            value={city}
            placeholder="Город"
            onChange={(event) => setCity(event.target.value)}
          />
          {city.trim() !== asked && (
            <Button type="submit" size="sm" variant="outline">
              Найти
            </Button>
          )}
        </form>

        {groupsPresent.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setGroup(null)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                group === null
                  ? 'border-transparent bg-accent text-accent-foreground'
                  : 'border-border text-muted-foreground hover:text-ink',
              )}
            >
              все
            </button>
            {groupsPresent.map((one) => (
              <button
                key={one}
                type="button"
                onClick={() => setGroup(one)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  group === one
                    ? 'border-transparent bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground hover:text-ink',
                )}
              >
                {GROUP_NAMES[one] ?? one}
              </button>
            ))}
          </div>
        )}
      </div>

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
      ) : shown.length === 0 ? (
        <section className="card flex flex-col items-center gap-2 p-6 text-center">
          <Sparkles className="size-6 text-accent-foreground" />
          {/* «Ничего нет» и «ничего не подошло» — разные новости, и вторая
              лечится кнопкой, которая тут же и стоит. */}
          {(board.data ?? []).length > 0 ? (
            <>
              <p className="text-lg font-semibold">Под фильтры ничего не подошло</p>
              <p className="field-hint">
                На доске есть {board.data!.length}, но не в этой части дома.
              </p>
              <Button variant="outline" size="sm" onClick={() => setGroup(null)}>
                Показать все
              </Button>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">
                {asked === ''
                  ? 'Пока никто не ищет смену'
                  : `В городе «${asked}» пока пусто`}
              </p>
              <p className="field-hint">Загляните позже — или разместите своё объявление.</p>
              <Button variant="outline" size="sm" asChild>
                <a href="/gigs">
                  Разместить на старой странице
                  <ArrowUpRight className="size-3.5" />
                </a>
              </Button>
            </>
          )}
        </section>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((gig) => {
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

/** The eight parts of a house, said the way people say them. */
const GROUP_NAMES: Record<string, string> = {
  Management: 'управление',
  Bar: 'бар',
  Floor: 'зал',
  Kitchen: 'кухня',
  Bakery: 'пекарня',
  'Back of house': 'подсобка',
  Delivery: 'доставка',
  Events: 'мероприятия',
};
