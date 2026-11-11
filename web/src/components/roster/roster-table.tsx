'use client';

import { useMemo } from 'react';

import type { RosterPerson, RosterShift } from '@/lib/api/roster';
import { WEEKDAY_LABELS, formatDayLabelShort } from '@/lib/calendar/calendar-date';
import { readableInk } from '@/lib/calendar/contrast';
import { useI18n } from '@/lib/i18n';
import { Brush, sameBrush } from '@/lib/roster/brushes';
import { compactHours } from '@/lib/roster/hours';
import { RosterDay, cellKey } from '@/lib/roster/month';
import { Icon } from '@/components/ui/icon';

/** The hour pairs held ready, plus one to make. */
export function BrushRow({
  brushes,
  active,
  onPick,
  onMake,
}: {
  brushes: Brush[];
  active: Brush | null;
  onPick: (brush: Brush | null) => void;
  onMake: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="field-label !mb-0 mr-1">{t('Brush')}</span>

      {brushes.map((brush) => {
        const chosen = active !== null && sameBrush(active, brush);

        return (
          <button
            key={`${brush.start}-${brush.end}`}
            type="button"
            className={`chip tabular !text-[0.82rem] ${chosen ? 'chip-accent' : 'hover:bg-surface-2'}`}
            aria-pressed={chosen}
            onClick={() => onPick(chosen ? null : brush)}
          >
            {compactHours(brush.start, brush.end)}
          </button>
        );
      })}

      <button type="button" className="chip !text-[0.82rem] hover:bg-surface-2" onClick={onMake}>
        <Icon name="plus" size={12} />
        {t('Other hours')}
      </button>

      <span className="field-hint ml-1">
        {t(active === null ? 'Pick hours and click the days. With none picked, a click opens the cell.' : 'Click a day to set these hours, click it again to clear them.')}
      </span>
    </div>
  );
}

/** People by every day of the month. The names stay put while the days scroll under them. */
export function RosterTable({
  days,
  people,
  cells,
  onCell,
  onPerson,
}: {
  days: RosterDay[];
  people: RosterPerson[];
  cells: Map<string, RosterShift>;
  onCell: (personId: number, date: string) => void;
  onPerson: (person: RosterPerson) => void;
}) {
  const { t, lang } = useI18n();

  // Once per month and not per cell: a date formatter is slow to build, and
  // this table can hold two thousand of them.
  const dates = useMemo(() => days.map((day) => formatDayLabelShort(day.key, lang)), [days, lang]);

  return (
    /* No side padding on the scroller: a sticky column stops at its edge, and the days would show through the gap. */
    <section className="card overflow-x-auto py-3">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-r border-border bg-surface py-1 pl-3 pr-2 text-left text-[0.78rem] font-semibold text-muted">
              <span className="sr-only">{t('Who')}</span>
            </th>
            {days.map((day) => (
              <th
                key={day.key}
                scope="col"
                className={`px-0.5 py-1 text-center text-[0.68rem] font-medium last:pr-3 ${
                  day.weekend ? 'bg-surface-2 text-warn-read' : 'text-faint'
                } ${day.weekday === 0 ? 'border-l border-border' : ''}`}
              >
                <span className="block">{t(WEEKDAY_LABELS[day.weekday])}</span>
                <span
                  className={`mx-auto mt-0.5 grid size-6 place-items-center rounded-full text-[0.74rem] font-semibold tabular ${
                    day.isToday ? 'bg-(--accent) text-(--accent-ink)' : ''
                  }`}
                  aria-current={day.isToday ? 'date' : undefined}
                >
                  {day.dayOfMonth}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-44 border-r border-t border-border bg-surface py-1 pl-2 pr-1 text-left font-normal"
              >
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-surface-2"
                  title={t('Edit this person')}
                  onClick={() => onPerson(person)}
                >
                  <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: person.colour }} />
                  <span className="min-w-0">
                    <span className="block truncate text-[0.84rem] font-medium">{person.name}</span>
                    {person.position !== null && (
                      <span className="block truncate text-[0.7rem] text-muted">{person.position}</span>
                    )}
                  </span>
                </button>
              </th>
              {days.map((day, index) => {
                const shift = cells.get(cellKey(person.id, day.key));
                const hours = shift === undefined ? null : compactHours(shift.start_time, shift.end_time);

                return (
                  <td
                    key={day.key}
                    className={`border-t border-border p-0.5 last:pr-3 ${
                      day.isToday ? 'bg-(--accent-soft)' : day.weekend ? 'bg-surface-2' : ''
                    } ${day.weekday === 0 ? 'border-l' : ''}`}
                  >
                    <button
                      type="button"
                      aria-label={`${person.name}, ${dates[index]}: ${hours ?? t('day off')}`}
                      className="block h-9 w-full min-w-8 whitespace-nowrap rounded text-[0.7rem] font-semibold outline-offset-1 hover:outline hover:outline-1 hover:outline-(--accent)"
                      style={
                        shift === undefined
                          ? undefined
                          : { background: person.colour, color: readableInk(person.colour) }
                      }
                      onClick={() => onCell(person.id, day.key)}
                    >
                      {hours}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
