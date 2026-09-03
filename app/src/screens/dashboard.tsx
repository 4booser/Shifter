import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';

import { DayPanel } from '@/components/calendar/day-panel';
import { GoalCard } from '@/components/dashboard/goal-card';
import { StartLive } from '@/components/live/live-bar';
import { MonthGrid } from '@/components/calendar/month-grid';
import { TileStrip } from '@/components/tiles/tile-strip';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { calendarApi } from '@/lib/api/calendar';
import { useSettings } from '@/lib/settings/store';
import { fromKey, gridBounds, keyOf, todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';

/**
 * The calendar page, rebuilt.
 *
 * The strip of facts comes first — it is what somebody opens the app to read
 * — and the month sits under it. Data arrives through Query, so a second
 * visit paints from cache and refetches quietly behind the numbers already
 * on screen.
 */
export function Dashboard() {
  const { t } = useI18n();
  const [month, setMonth] = useState(todayKey());
  const [selected, setSelected] = useState<string | null>(todayKey());
  const mondayFirst = useSettings((state) => state.settings.mondayFirst);
  /* The six weeks the grid draws, not the month it is named after: a month
     query left the leading and trailing cells empty, so the first days of
     next month read as days with nothing on them and opened a panel that
     said exactly that. */
  const bounds = gridBounds(month, mondayFirst);

  const days = useQuery({
    queryKey: ['days', bounds.from, bounds.to],
    queryFn: () => calendarApi.days(bounds.from, bounds.to),
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight first-letter:uppercase">
            {/* Month and year are formatted apart because asking for both at
                once gets «август 2026 г.» in Russian, and the trailing «г.» is
                an abbreviation no headline needs. `first-letter:uppercase`
                rather than `capitalize`, which would title-case the year's
                abbreviation too. */}
            {fromKey(month).toLocaleDateString('ru', { month: 'long' })}{' '}
            {fromKey(month).getFullYear()}
          </h1>
          <span className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label={t('Previous month')}
              onClick={() => setMonth((was) => shiftMonth(was, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('Next month')}
              onClick={() => setMonth((was) => shiftMonth(was, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMonth(todayKey())}>
              {t('Today')}
            </Button>
          </span>
        </div>
        <StartLive />
        <a
          href="/dashboard"
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
        >
          Старая версия
          <ArrowUpRight className="size-3.5" />
        </a>
      </header>

      {days.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : days.isError ? (
        <p className="card p-4 text-sm" style={{ color: 'var(--danger)' }}>
          Не дотянулись до сервера.
        </p>
      ) : (
        <>
          <TileStrip days={days.data.days} summary={days.data} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
            <MonthGrid
              month={month}
              days={days.data.days}
              events={days.data.events}
              selected={selected}
              onSelect={setSelected}
            />
            <div className="flex flex-col gap-4">
              <GoalCard />
              <DayPanel
                day={
                  selected === null
                    ? null
                    : days.data.days.find((row) => row.date === selected) ?? null
                }
                date={selected}
                events={days.data.events}
                onSaved={() => void days.refetch()}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** A month either side, keeping the day-of-month sane at the edges. */
function shiftMonth(key: string, delta: number): string {
  const at = fromKey(key);

  return keyOf(new Date(at.getFullYear(), at.getMonth() + delta, 1));
}
