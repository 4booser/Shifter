'use client';

import { useState } from 'react';

import type { RosterPattern, RosterPerson, RosterPersonSave, RosterPosition } from '@/lib/api/roster';
import type { YearMonth } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { personSave } from '@/lib/roster/edits';
import { cleanPerson, draftOf, patternLabel } from '@/lib/roster/people';
import { byPosition } from '@/lib/roster/rules';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { PatternFields } from './pattern-fields';

/** The whole crew's positions and working days on one screen, so ten people are set up without opening ten dialogs. Each change saves as it goes, once it is a whole one. */
export function CrewDays({
  people,
  positions,
  month,
  forFill,
  onEditPerson,
}: {
  people: RosterPerson[];
  positions: RosterPosition[];
  month: YearMonth;
  /** Opened by a fill that found nobody with working days. */
  forFill: boolean;
  onEditPerson: (id: number, save: RosterPersonSave) => void;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  // A rhythm half set up, held here until it is one the server takes.
  const [drafts, setDrafts] = useState<Map<number, RosterPattern>>(new Map());

  const save = (person: RosterPerson, positionId: number | null, pattern: RosterPattern) => {
    const clean = cleanPerson({
      name: person.name,
      colour: person.colour,
      positionId,
      hours: draftOf(person.hours),
      pattern,
    });

    if (clean !== null) onEditPerson(person.id, personSave(clean));
  };

  const draft = (person: RosterPerson, pattern: RosterPattern) => {
    setDrafts((held) => new Map(held).set(person.id, pattern));
    save(person, person.position_id, pattern);
  };

  return (
    <div className="flex flex-col gap-2">
      {forFill && <Alert kind="info">{t('Mark who works which days, then press “Fill the month” again.')}</Alert>}

      <ul className="flex flex-col divide-y divide-border">
        {byPosition(people, positions).map((person) => {
          const pattern = drafts.get(person.id) ?? person.pattern;
          const expanded = open === person.id;
          const days = patternLabel(pattern, t, lang);

          return (
            <li key={person.id} className="flex flex-col gap-1.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: person.colour }} />
                <span className="min-w-0 flex-1 truncate text-[0.92rem] font-medium">{person.name}</span>
                {/* Whose, in the name a screen reader gives each control: tabbing passes the name by, and every row is alike. */}
                <button
                  type="button"
                  className={`chip max-w-[60%] !text-[0.8rem] ${expanded ? 'chip-accent' : 'hover:bg-surface-2'}`}
                  aria-label={`${person.name}, ${t('Working days')}: ${days}`}
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : person.id)}
                >
                  <Icon name="calendar" size={12} className="flex-none" />
                  <span className="min-w-0 truncate">{days}</span>
                </button>
              </div>

              {positions.length > 0 && (
                <div className="flex flex-wrap gap-1" role="group" aria-label={`${person.name}: ${t('Position')}`}>
                  {[null, ...positions].map((position) => {
                    const id = position?.id ?? null;
                    const chosen = person.position_id === id;

                    return (
                      <button
                        key={id ?? 'none'}
                        type="button"
                        className={`chip !px-2 !text-[0.74rem] ${chosen ? 'chip-accent' : 'hover:bg-surface-2'}`}
                        aria-pressed={chosen}
                        onClick={() => save(person, id, person.pattern)}
                      >
                        {position?.name ?? t('No position')}
                      </button>
                    );
                  })}
                </div>
              )}

              {expanded && (
                <div className="rounded-(--radius) border border-border p-2.5">
                  <PatternFields pattern={pattern} month={month} onChange={(next) => draft(person, next)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
