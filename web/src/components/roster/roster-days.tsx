'use client';

import { useMemo } from 'react';

import type { RosterPerson, RosterShift } from '@/lib/api/roster';
import { formatDayLabel } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { ListedDay, dayList } from '@/lib/roster/day-list';
import { compactHours } from '@/lib/roster/hours';
import { RosterDay } from '@/lib/roster/month';
import { Icon } from '@/components/ui/icon';

/** One day of the phone's month: who works it, and everyone else one tap from working it. */
function DayCard({ entry, onCell }: { entry: ListedDay; onCell: (personId: number, date: string) => void }) {
  const { t, lang } = useI18n();
  const { day, on, off } = entry;

  return (
    <li className={`card p-3 ${day.isToday ? '!border-(--accent)' : ''}`}>
      <h2 className="mb-1.5 flex items-center gap-2 text-[0.9rem] font-bold">
        <span className={day.weekend ? 'text-warn-read' : ''}>{formatDayLabel(day.key, lang)}</span>
        {day.isToday && <span className="chip chip-accent">{t('Today')}</span>}
      </h2>

      {on.length > 0 && (
        <ul className="mb-1.5 flex flex-col">
          {on.map(({ person, shift }) => (
            <li key={person.id}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2 rounded px-1 text-left hover:bg-surface-2"
                onClick={() => onCell(person.id, day.key)}
              >
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: person.colour }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.92rem] font-medium">{person.name}</span>
                  {person.position !== null && (
                    <span className="block truncate text-[0.76rem] text-muted">{person.position}</span>
                  )}
                </span>
                <span className="flex-none text-[0.92rem] font-semibold tabular">
                  {compactHours(shift.start_time, shift.end_time)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {off.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {off.map((person) => (
            <button
              key={person.id}
              type="button"
              className="chip min-h-8 max-w-full !text-[0.8rem]"
              onClick={() => onCell(person.id, day.key)}
            >
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: person.colour }} />
              <span className="min-w-0 truncate">{person.name}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

/** The month as a list by day, for a screen with no room for a table. */
export function RosterDays({
  days,
  people,
  shifts,
  onCell,
}: {
  days: RosterDay[];
  people: RosterPerson[];
  shifts: RosterShift[];
  onCell: (personId: number, date: string) => void;
}) {
  const { t, n } = useI18n();
  const { ahead, past } = useMemo(() => dayList(days, people, shifts), [days, people, shifts]);

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {ahead.map((entry) => (
          <DayCard key={entry.day.key} entry={entry} onCell={onCell} />
        ))}
      </ol>

      {past.length > 0 && (
        <details className="group">
          <summary className="btn btn-sm w-full list-none">
            <Icon name="chevron-right" size={14} className="transition-transform group-open:rotate-90" />
            {t('Days already past')}: {n(past.length, 'days')}
          </summary>
          <ol className="mt-2 flex flex-col gap-2">
            {past.map((entry) => (
              <DayCard key={entry.day.key} entry={entry} onCell={onCell} />
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
