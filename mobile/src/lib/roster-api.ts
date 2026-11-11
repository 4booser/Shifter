import { api } from './api';
import { Roster, RosterBatch, RosterMonth, RosterPerson, RosterRepeated } from './roster';
import { createRosterSavers } from './roster-saver';

/** Every request a roster makes. Apart from the rules, which have to run where nothing native can. */

const ROSTERS = '/shifter/v1/rosters';

export type RosterPersonSave = Pick<RosterPerson, 'name' | 'position' | 'colour'>;

export const rosterApi = {
  list: () => api<Roster[]>(ROSTERS),

  create: (title: string) => api<Roster>(ROSTERS, { method: 'POST', body: { title } }),

  rename: (id: number, title: string) =>
    api<Roster>(`${ROSTERS}/${id}`, { method: 'PUT', body: { title } }),

  remove: (id: number) => api<void>(`${ROSTERS}/${id}`, { method: 'DELETE' }),

  month: (id: number, month: string) => api<RosterMonth>(`${ROSTERS}/${id}/month/${month}`),

  addPerson: (id: number, person: RosterPersonSave) =>
    api<RosterPerson>(`${ROSTERS}/${id}/people`, { method: 'POST', body: person }),

  updatePerson: (id: number, personId: number, person: RosterPersonSave) =>
    api<RosterPerson>(`${ROSTERS}/${id}/people/${personId}`, { method: 'PUT', body: person }),

  removePerson: (id: number, personId: number) =>
    api<void>(`${ROSTERS}/${id}/people/${personId}`, { method: 'DELETE' }),

  cells: (id: number, batch: RosterBatch) =>
    api<void>(`${ROSTERS}/${id}/cells`, { method: 'PUT', body: batch }),

  repeat: (id: number, month: string) =>
    api<RosterRepeated>(`${ROSTERS}/${id}/repeat`, { method: 'POST', body: { month } }),

  share: (id: number) =>
    api<{ share_slug: string }>(`${ROSTERS}/${id}/share`, { method: 'POST', body: {} }),

  unshare: (id: number) => api<void>(`${ROSTERS}/${id}/share`, { method: 'DELETE' }),
};

/** Module-wide, so closing the screen or changing roster loses nothing that has not landed. */
export const rosterSavers = createRosterSavers({ send: rosterApi.cells });
