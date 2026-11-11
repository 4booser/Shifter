import type { RosterPerson, RosterShift } from '@/lib/api/roster';
import { RosterDay, cellKey, cellsOf } from './month';

export interface DayEntry {
  person: RosterPerson;
  shift: RosterShift;
}

export interface ListedDay {
  day: RosterDay;
  /** Who works it, earliest start first. */
  on: DayEntry[];
  /** Everyone else, because a person with no shift yet is what the owner taps to give them one. */
  off: RosterPerson[];
}

export interface DayList {
  ahead: ListedDay[];
  /** What the current month has already been through. */
  past: ListedDay[];
}

/** The phone's month. In the current one today comes first and the days gone by step aside; any other month runs in date order. Every day is kept, unlike the public page, because an empty day is where the next shift goes. */
export function dayList(days: RosterDay[], people: RosterPerson[], shifts: RosterShift[]): DayList {
  const cells = cellsOf(shifts);

  const listed = days.map((day): ListedDay => {
    const on: DayEntry[] = [];
    const off: RosterPerson[] = [];

    for (const person of people) {
      const shift = cells.get(cellKey(person.id, day.key));

      if (shift === undefined) off.push(person);
      else on.push({ person, shift });
    }

    on.sort((one, two) => one.shift.start_time.localeCompare(two.shift.start_time));

    return { day, on, off };
  });

  const today = listed.findIndex((entry) => entry.day.isToday);

  if (today === -1) return { ahead: listed, past: [] };

  return { ahead: listed.slice(today), past: listed.slice(0, today) };
}
