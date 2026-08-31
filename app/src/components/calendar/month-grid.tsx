import { useMemo } from 'react';

import { CalendarDayData, CalendarEvent } from '@/lib/calendar/models';
import { fromKey, keyOf, todayKey } from '@/lib/calendar/calendar-date';
import { formatMoney, formatMoneyCompact } from '@/lib/settings/money';
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
const SUNDAY_FIRST = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function MonthGrid({
  month,
  days,
  events = [],
  selected,
  onSelect,
}: {
  /** Any day inside the month being drawn. */
  month: string;
  days: CalendarDayData[];
  /**
   * Everything overlapping the month, once each rather than per day it
   * covers — a fortnight of leave arrives as one event and is spread across
   * the cells here.
   */
  events?: CalendarEvent[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const settings = useSettings((state) => state.settings);
  const mondayFirst = settings.mondayFirst;
  const onDay = (key: string) =>
    events.filter((event) => event.start_date <= key && key <= event.end_date);
  const today = todayKey();

  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);

  const cells = useMemo(() => {
    const at = fromKey(month);
    const first = new Date(at.getFullYear(), at.getMonth(), 1);
    const start = new Date(first);

    // Monday-first is the trade's default, but the setting is offered and so
    // it has to be honoured — a switch that reorders one bar chart and leaves
    // the calendar alone is worse than no switch.
    start.setDate(
      first.getDate() - (mondayFirst ? (first.getDay() + 6) % 7 : first.getDay()),
    );

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);

      date.setDate(start.getDate() + index);

      return {
        key: keyOf(date),
        inMonth: date.getMonth() === at.getMonth(),
        weekend: date.getDay() === 0 || date.getDay() === 6,
      };
    });
  }, [month, mondayFirst]);

  return (
    <div className="card overflow-hidden p-3">
      <div className="mb-1 grid grid-cols-7 gap-1.5">
        {(mondayFirst ? WEEKDAYS : SUNDAY_FIRST).map((name, index) => (
          <span
            key={name}
            className={cn(
              'px-1 text-2xs font-semibold uppercase tracking-wide',
              (mondayFirst ? index >= 5 : index === 0 || index === 6)
                ? 'text-warn'
                : 'text-faint',
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
                cell.inMonth &&
                  cell.weekend &&
                  settings.highlightWeekends &&
                  'bg-[var(--warn-soft)]',
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
                  <span className="hidden text-2xs text-faint tabular sm:inline">
                    {Math.round(day.hours * 10) / 10}ч
                  </span>
                )}
              </span>

              <span className="flex min-w-0 flex-col gap-0.5">
                {onDay(cell.key).map((event) => (
                  <span
                    key={event.id}
                    className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground"
                  >
                    <span
                      aria-hidden
                      className="size-1.5 flex-none rounded-full"
                      style={{ background: event.colour }}
                    />
                    <span className="hidden truncate sm:inline">{event.name}</span>
                  </span>
                ))}
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
                    {settings.showShiftNamesInCells && (
                      <span className="hidden truncate sm:inline">{entry.name}</span>
                    )}
                    {settings.cellTimes !== 'none' && (
                      <span className="hidden truncate tabular sm:inline">
                        {(entry.actual_start ?? entry.start_time).slice(0, 5)}
                        {settings.cellTimes === 'range' &&
                          `–${(entry.actual_end ?? entry.end_time).slice(0, 5)}`}
                      </span>
                    )}
                  </span>
                ))}
                {shifts.length > 2 && (
                  <span className="text-2xs text-faint">+{shifts.length - 2}</span>
                )}
              </span>

              {earned > 0 && settings.showEarningsInCells && (
                <span className="mt-auto text-xs font-semibold tabular text-good">
                  <span className="sm:hidden">
                    {formatMoneyCompact(settings, Math.round(earned))}
                  </span>
                  <span className="hidden sm:inline">
                    {formatMoney(settings, Math.round(earned))}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
