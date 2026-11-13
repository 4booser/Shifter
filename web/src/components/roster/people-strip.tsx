'use client';

import type { RosterPerson, RosterPosition } from '@/lib/api/roster';
import { useI18n } from '@/lib/i18n';
import { byPosition } from '@/lib/roster/rules';
import { Icon } from '@/components/ui/icon';

/** How many people the strip shows outright. Past this they fold away, or the crew pushes the month it came for off the screen. */
const PEOPLE_SHOWN = 8;

/** Who is on the roster, in the order every list of them goes, and the way to edit them on a screen with no name column to press. */
export function PeopleStrip({
  people,
  positions = [],
  onPerson,
  onAdd,
}: {
  people: RosterPerson[];
  positions?: RosterPosition[];
  onPerson: (person: RosterPerson) => void;
  onAdd: () => void;
}) {
  const { t, n } = useI18n();

  const strip = (
    <>
      {byPosition(people, positions).map((person) => (
        <button key={person.id} type="button" className="chip min-h-7 max-w-full hover:bg-surface-2" onClick={() => onPerson(person)}>
          <span className="h-2 w-2 flex-none rounded-full" style={{ background: person.colour }} />
          <span className="min-w-0 truncate">
            {person.name}
            {person.position !== null && <span className="text-faint"> · {person.position}</span>}
          </span>
        </button>
      ))}
      <button type="button" className="btn btn-sm" onClick={onAdd}>
        <Icon name="plus" size={14} />
        {t('Add a person')}
      </button>
    </>
  );

  if (people.length <= PEOPLE_SHOWN) {
    return <section className="card flex flex-wrap items-center gap-1.5 p-3">{strip}</section>;
  }

  return (
    <details className="card group p-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[0.88rem] font-semibold">
        <Icon name="chevron-right" size={14} className="transition-transform group-open:rotate-90" />
        {n(people.length, 'people')}
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">{strip}</div>
    </details>
  );
}
