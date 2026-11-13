import { api } from './api';
import {
  readPerson,
  readSheet,
  Restamped,
  Roster,
  RosterBatch,
  RosterCleared,
  RosterFilled,
  RosterMonth,
  RosterPerson,
  RosterPosition,
  RosterPositionSave,
  RosterRepeated,
} from './roster';
import { createRosterSavers } from './roster-saver';
import { WeekHours } from './types';

/**
 * Every request a roster makes. Apart from the rules, which have to run where
 * nothing native can. Whatever brings people back goes through readSheet or
 * readPerson: a store build outlives a server rolled back under it.
 */

const ROSTERS = '/shifter/v1/rosters';

/** What the phone sends for a person: always every field, and never the position's name, which the server would otherwise read as an older client's. */
export type RosterPersonSave = Omit<RosterPerson, 'id' | 'position'>;

/** A person as the wire takes them, field by field: a spread would carry the position's name along. */
export const personSave = (person: RosterPersonSave): RosterPersonSave => ({
  name: person.name,
  colour: person.colour,
  position_id: person.position_id,
  hours: person.hours,
  pattern: person.pattern,
});

export const rosterApi = {
  list: () => api<Roster[]>(ROSTERS).then((rows) => rows.map(readSheet)),

  create: (title: string) => api<Roster>(ROSTERS, { method: 'POST', body: { title } }).then(readSheet),

  rename: (id: number, title: string) =>
    api<Roster>(`${ROSTERS}/${id}`, { method: 'PUT', body: { title } }).then(readSheet),

  remove: (id: number) => api<void>(`${ROSTERS}/${id}`, { method: 'DELETE' }),

  // Always bare: without it the server leaves out the days with no set time,
  // which only a build from before them needs.
  month: (id: number, month: string) =>
    api<RosterMonth>(`${ROSTERS}/${id}/month/${month}?bare=1`).then(readSheet),

  saveVenueHours: (id: number, venue_hours: WeekHours[]) =>
    api<{ venue_hours: WeekHours[] } & Restamped>(`${ROSTERS}/${id}/venue-hours`, {
      method: 'PUT',
      body: { venue_hours },
    }),

  addPosition: (id: number, save: RosterPositionSave) =>
    api<RosterPosition>(`${ROSTERS}/${id}/positions`, { method: 'POST', body: save }),

  updatePosition: (id: number, positionId: number, save: RosterPositionSave) =>
    api<RosterPosition & Restamped>(`${ROSTERS}/${id}/positions/${positionId}`, { method: 'PUT', body: save }),

  removePosition: (id: number, positionId: number) =>
    api<Restamped>(`${ROSTERS}/${id}/positions/${positionId}`, { method: 'DELETE' }),

  addPerson: (id: number, person: RosterPersonSave) =>
    api<RosterPerson>(`${ROSTERS}/${id}/people`, { method: 'POST', body: personSave(person) }).then(readPerson),

  updatePerson: (id: number, personId: number, person: RosterPersonSave) =>
    api<RosterPerson & Restamped>(`${ROSTERS}/${id}/people/${personId}`, {
      method: 'PUT',
      body: personSave(person),
    }).then(readPerson),

  removePerson: (id: number, personId: number) =>
    api<void>(`${ROSTERS}/${id}/people/${personId}`, { method: 'DELETE' }),

  cells: (id: number, batch: RosterBatch) =>
    api<void>(`${ROSTERS}/${id}/cells`, { method: 'PUT', body: batch }),

  repeat: (id: number, month: string) =>
    api<RosterRepeated>(`${ROSTERS}/${id}/repeat`, { method: 'POST', body: { month } }),

  fill: (id: number, month: string) =>
    api<RosterFilled>(`${ROSTERS}/${id}/fill`, { method: 'POST', body: { month } }),

  clear: (id: number, month: string) =>
    api<RosterCleared>(`${ROSTERS}/${id}/clear`, { method: 'POST', body: { month } }),

  share: (id: number) =>
    api<{ share_slug: string }>(`${ROSTERS}/${id}/share`, { method: 'POST', body: {} }),

  unshare: (id: number) => api<void>(`${ROSTERS}/${id}/share`, { method: 'DELETE' }),
};

/** Module-wide, so closing the screen or changing roster loses nothing that has not landed. */
export const rosterSavers = createRosterSavers({ send: rosterApi.cells });
