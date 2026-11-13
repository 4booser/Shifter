'use client';

import { useMemo } from 'react';

import type { RosterPerson, RosterPosition, RosterShift } from '@/lib/api/roster';
import { formatDayLabel } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { ListedDay, dayList } from '@/lib/roster/day-list';
import { cellText } from '@/lib/roster/hours';
import { RosterDay } from '@/lib/roster/month';
import { Icon } from '@/components/ui/icon';
import { LongPressHandlers, useLongPress } from './long-press';

/** One day of the phone's month: who works it, position by position, and everyone else one tap from working it. */
function DayCard({
  entry,
  hold,
  onCell,
  onFree,
  onFreeMenu,
}: {
  entry: ListedDay;
  hold: (onPress: () => void, onHold: () => void) => LongPressHandlers;
  onCell: (personId: number, date: string) => void;
  onFree: (personId: number, date: string) => void;
  onFreeMenu: (personId: number, date: string) => void;
}) {
  const { t, lang } = useI18n();
  const { day, groups, off, labelled } = entry;

  return (
    <li className={`card p-3 ${day.isToday ? '!border-(--accent)' : ''} ${day.closed ? 'opacity-70' : ''}`}>
      <h2 className="mb-1.5 flex flex-wrap items-center gap-2 text-[0.9rem] font-bold">
        <span className={day.weekend ? 'text-warn-read' : ''}>{formatDayLabel(day.key, lang)}</span>
        {day.isToday && <span className="chip chip-accent">{t('Today')}</span>}
        {day.closed && <span className="chip font-medium">{t('the venue is closed')}</span>}
      </h2>

      {groups.map(({ position, on }) => (
        <div key={position?.id ?? 'none'} className="mb-1.5">
          {labelled && (
            <p className="px-1 pt-0.5 text-[0.7rem] font-semibold text-muted">{position?.name ?? t('No position')}</p>
          )}
          <ul className="flex flex-col">
            {on.map(({ person, shift }) => {
              const hours = cellText(shift);

              return (
                <li key={person.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 rounded px-1 text-left hover:bg-surface-2"
                    onClick={() => onCell(person.id, day.key)}
                  >
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: person.colour }} />
                    <span className="min-w-0 flex-1 truncate text-[0.92rem] font-medium">{person.name}</span>
                    <span className="flex-none text-[0.92rem] font-semibold tabular">
                      {/* The dot already says they work; a day with no set time has nothing more to say. */}
                      {hours ?? <span className="sr-only">{t('no set time')}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {off.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {off.map((person) => (
            <button
              key={person.id}
              type="button"
              aria-label={`${t('Put on')} ${person.name}`}
              className="chip min-h-8 max-w-full touch-manipulation select-none !text-[0.8rem] [-webkit-touch-callout:none]"
              {...hold(
                () => onFree(person.id, day.key),
                () => onFreeMenu(person.id, day.key),
              )}
            >
              <Icon name="plus" size={11} className="flex-none" />
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
  positions,
  shifts,
  onCell,
  onFree,
  onFreeMenu,
}: {
  days: RosterDay[];
  people: RosterPerson[];
  positions: RosterPosition[];
  shifts: RosterShift[];
  /** A working row: open the day. */
  onCell: (personId: number, date: string) => void;
  /** A free name, tapped: on at their usual time. */
  onFree: (personId: number, date: string) => void;
  /** A free name, held: open the day. */
  onFreeMenu: (personId: number, date: string) => void;
}) {
  const { t, n } = useI18n();
  const hold = useLongPress();
  const { ahead, past } = useMemo(() => dayList(days, people, shifts, positions), [days, people, shifts, positions]);

  const card = (entry: ListedDay) => (
    <DayCard key={entry.day.key} entry={entry} hold={hold} onCell={onCell} onFree={onFree} onFreeMenu={onFreeMenu} />
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="field-hint">{t('Tap a name to put them on at their usual time; hold it to open the day.')}</p>

      <ol className="flex flex-col gap-2">{ahead.map(card)}</ol>

      {past.length > 0 && (
        <details className="group">
          <summary className="btn btn-sm w-full list-none">
            <Icon name="chevron-right" size={14} className="transition-transform group-open:rotate-90" />
            {t('Days already past')}: {n(past.length, 'days')}
          </summary>
          <ol className="mt-2 flex flex-col gap-2">{past.map(card)}</ol>
        </details>
      )}
    </div>
  );
}
