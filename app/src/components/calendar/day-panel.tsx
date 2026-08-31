import { CalendarDayData } from '@/lib/calendar/models';
import { fromKey } from '@/lib/calendar/calendar-date';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';

/**
 * The day, opened.
 *
 * Read-only for now: the new front is being built screen by screen, and a
 * half-wired editor that silently drops a shift would be worse than a panel
 * that plainly says what the day holds and sends editing to the page that
 * already does it properly.
 */
export function DayPanel({ day, date }: { day: CalendarDayData | null; date: string | null }) {
  const settings = useSettings((state) => state.settings);
  const money = (value: number) => formatMoney(settings, Math.round(value));

  if (date === null) {
    return (
      <aside className="card p-4">
        <p className="field-hint">Выберите день в календаре.</p>
      </aside>
    );
  }

  const worked = day?.shifts.filter((entry) => entry.worked) ?? [];
  const planned = day?.shifts.filter((entry) => !entry.worked) ?? [];
  const tips = (day?.tips ?? 0) + (day?.tips_cash ?? 0);

  return (
    <aside className="card flex flex-col gap-3 p-4">
      <header>
        <h2 className="text-base font-bold first-letter:uppercase">
          {fromKey(date).toLocaleDateString('ru', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </h2>
        {day !== undefined && day !== null && day.earned > 0 && (
          <p className="text-2xl font-bold tabular text-good">{money(day.earned)}</p>
        )}
      </header>

      {worked.length === 0 && planned.length === 0 ? (
        <p className="field-hint">В этот день смен нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...worked, ...planned].map((entry, index) => (
            <li key={`${entry.shift_id}-${index}`} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1.5 size-2 flex-none rounded-full"
                style={{ background: entry.colour ?? 'var(--accent)' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{entry.name}</span>
                <span className="field-hint tabular">
                  {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)} · {entry.hours} ч
                  {entry.worked ? '' : ' · план'}
                </span>
              </span>
              {entry.earned > 0 && (
                <span className="text-sm font-semibold tabular">{money(entry.earned)}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {tips > 0 && (
        <p className="flex items-baseline justify-between border-t border-border pt-2 text-sm">
          <span className="field-hint">Чаевые</span>
          <span className="font-semibold tabular">{money(tips)}</span>
        </p>
      )}

      {day?.note != null && day.note !== '' && (
        <p className="border-t border-border pt-2 text-sm text-muted-foreground">{day.note}</p>
      )}

      <a
        href={`/dashboard?day=${date}`}
        className="text-sm font-semibold text-accent-foreground hover:underline"
      >
        Открыть в редакторе →
      </a>
    </aside>
  );
}
