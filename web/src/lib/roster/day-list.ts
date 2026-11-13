import type { RosterPerson, RosterPosition, RosterShift } from '@/lib/api/roster';
import { byPosition, positionGroups } from '@/lib/roster/rules';
import { RosterDay, cellKey, cellsOf } from './month';

export interface DayEntry {
  person: RosterPerson;
  shift: RosterShift;
}

/** Who works a day under one position. Null is the people with no position, always last. */
export interface DayGroup {
  position: RosterPosition | null;
  /** Earliest start first, the days with no set time after them. */
  on: DayEntry[];
}

export interface ListedDay {
  day: RosterDay;
  /** Who works it, position by position; a position nobody works that day is left out. */
  groups: DayGroup[];
  /** Everyone else, because a person with no shift yet is what the owner taps to give them one. */
  off: RosterPerson[];
  /** Whether the groups say whose position they are: only once the roster has any. */
  labelled: boolean;
}

export interface DayList {
  ahead: ListedDay[];
  /** What the current month has already been through. */
  past: ListedDay[];
}

/** Timed first by start, then the days with no set time. Stable, so people keep their order within each. */
const byStart = (one: DayEntry, two: DayEntry): number => {
  const first = one.shift.start_time;
  const second = two.shift.start_time;

  if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1;

  return first.localeCompare(second);
};

/** The phone's month. In the current one today comes first and the days gone by step aside; any other month runs in date order. Every day is kept, unlike the public page, because an empty day is where the next shift goes. */
export function dayList(
  days: RosterDay[],
  people: RosterPerson[],
  shifts: RosterShift[],
  positions: RosterPosition[] = [],
): DayList {
  const cells = cellsOf(shifts);
  const grouped = positionGroups(people, positions);
  const ordered = byPosition(people, positions);

  const listed = days.map((day): ListedDay => {
    const groups = grouped
      .map(({ position, people: members }): DayGroup => ({
        position,
        on: members
          .flatMap((person) => {
            const shift = cells.get(cellKey(person.id, day.key));

            return shift === undefined ? [] : [{ person, shift }];
          })
          .sort(byStart),
      }))
      .filter((group) => group.on.length > 0);

    const off = ordered.filter((person) => !cells.has(cellKey(person.id, day.key)));

    return { day, groups, off, labelled: positions.length > 0 };
  });

  const today = listed.findIndex((entry) => entry.day.isToday);

  if (today === -1) return { ahead: listed, past: [] };

  return { ahead: listed.slice(today), past: listed.slice(0, today) };
}
