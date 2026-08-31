import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';

import { TileStrip } from '@/components/tiles/tile-strip';
import { Skeleton } from '@/components/ui/skeleton';
import { calendarApi } from '@/lib/api/calendar';
import { monthBounds, todayKey } from '@/lib/calendar/calendar-date';

/**
 * The calendar page, rebuilt.
 *
 * The strip of facts comes first — it is what somebody opens the app to read
 * — and the month sits under it. Data arrives through Query, so a second
 * visit paints from cache and refetches quietly behind the numbers already
 * on screen.
 */
export function Dashboard() {
  const bounds = monthBounds(todayKey());

  const month = useQuery({
    queryKey: ['days', bounds.from, bounds.to],
    queryFn: () => calendarApi.days(bounds.from, bounds.to),
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Календарь</h1>
        <a
          href="/dashboard"
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
        >
          Старая версия
          <ArrowUpRight className="size-3.5" />
        </a>
      </header>

      {month.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : month.isError ? (
        <p className="card p-4 text-sm" style={{ color: 'var(--danger)' }}>
          Не дотянулись до сервера.
        </p>
      ) : (
        <TileStrip days={month.data.days} summary={month.data} />
      )}
    </div>
  );
}
