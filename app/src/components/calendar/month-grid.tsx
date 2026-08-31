import { useMemo } from 'react';

import { CalendarDayData } from '@/lib/calendar/models';
import { fromKey, keyOf, todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

/**
 * The month.
 *
 * Six rows of seven, and every cell says the three things somebody scans
 * for: what was on, how long, and what it came to. A day the calendar has
 * been told to paint wears its colour as a top edge rather than as a fill —
 * a filled cell makes its own text unreadable at exactly the moment the
 * money matters.
 */
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function MonthGrid({
  month,
  days,
  selected,
  onSelect,
}: {
  /** Any day inside the month being drawn. */
  month: string;
  days: CalendarDayData[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const settings = useSettings((state) => state.settings);
  const today = todayKey();

  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);

  const cells = useMemo(() => {
    const at = fromKey(month);
    const first = new Date(at.getFullYear(), at.getMonth(), 1);
    const start = new Date(first);

    // Monday-first, like every rota in the trade.
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);

      date.setDate(start.getDate() + index);

      return {
        key: keyOf(date),
        inMonth: date.getMonth() === at.getMonth(),
        weekend: date.getDay() === 0 || date.getDay() === 6,
      };
    });
  }, [month]);

  return (
    <div className="card overflow-hidden p-3">
      <div className="mb-1 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((name, index) => (
          <span
            key={name}
            className={cn(
              'px-1 text-2xs font-semibold uppercase tracking-wide',
              index >= 5 ? 'text-warn' : 'text-faint',
            )}
          >
            {name}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell) => {
          const day = byDate.get(cell.key);
          const worked = day?.shifts.filter((entry) => entry.worked) ?? [];
          const planned = day?.shifts.filter((entry) => !entry.worked) ?? [];
          const shifts = [...worked, ...planned];
          const earned = day?.earned ?? 0;
          const isToday = cell.key === today;

          return (
            <button
              key={cell.key}
              type="button"
              data-day={cell.key}
              onClick={() => onSelect(cell.key)}
              className={cn(
                'relative flex min-h-[5.5rem] flex-col gap-1 overflow-hidden rounded-[var(--radius-field)] border p-1.5 text-left transition-colors',
                cell.inMonth ? 'border-border bg-surface' : 'border-transparent bg-surface-2/40',
                selected === cell.key && 'ring-2 ring-[var(--accent)]',
                cell.inMonth && 'hover:bg-surface-2',
              )}
            >
              {day?.colour != null && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: day.colour }}
                />
              )}

              <span className="flex items-baseline justify-between gap-1">
                <span
                  className={cn(
                    'text-sm font-semibold tabular',
                    !cell.inMonth && 'text-faint',
                    isToday &&
                      'grid size-6 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]',
                  )}
                >
                  {Number(cell.key.slice(8))}
                </span>
                {day !== undefined && day.hours > 0 && (
                  <span className="text-2xs text-faint tabular">{Math.round(day.hours * 10) / 10}ч</span>
                )}
              </span>

              <span className="flex min-w-0 flex-col gap-0.5">
                {shifts.slice(0, 2).map((entry, index) => (
                  <span
                    key={`${entry.shift_id}-${index}`}
                    className={cn(
                      'flex min-w-0 items-center gap-1 text-2xs',
                      entry.worked ? 'text-ink' : 'text-muted-foreground',
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-1.5 flex-none rounded-full"
                      style={{ background: entry.colour ?? 'var(--accent)' }}
                    />
                    <span className="truncate">{entry.name}</span>
                  </span>
                ))}
                {shifts.length > 2 && (
                  <span className="text-2xs text-faint">+{shifts.length - 2}</span>
                )}
              </span>

              {earned > 0 && (
                <span className="mt-auto text-xs font-semibold tabular text-good">
                  {formatMoney(settings, Math.round(earned))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
