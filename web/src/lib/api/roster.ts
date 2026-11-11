'use client';

import type { RosterEdit } from '@/lib/roster/edits';
import { HttpError, api } from './http';

/** A name on a roster. Mirrors RosterPersonDto; no account stands behind it. */
export interface RosterPerson {
  id: number;
  name: string;
  position: string | null;
  /** #rrggbb, lower case. */
  colour: string;
}

export type RosterPersonSave = Omit<RosterPerson, 'id'>;

/** Mirrors RosterDto. */
export interface Roster {
  id: number;
  title: string;
  /** Null means the link is off. */
  share_slug: string | null;
  people: RosterPerson[];
}

/** One filled cell, in "HH:mm". A shift past midnight is held on its start date. */
export interface RosterShift {
  person_id: number;
  date: string;
  start_time: string;
  end_time: string;
}

export interface RosterCellClear {
  person_id: number;
  date: string;
}

/** Mirrors RosterMonthDto. */
export interface RosterMonth extends Roster {
  /** yyyy-MM. */
  month: string;
  shifts: RosterShift[];
}

export interface RosterRepeated {
  added: number;
  /** Cells that already held a shift and were left alone. */
  kept: number;
}

const ROOT = '/shifter/v1/rosters';

/*
 * Both reads ask the server itself. What they answer decides the next write,
 * since a brush clears a cell it finds holding the same hours, and the worker's
 * copy would keep the owner's names on the device after they left the page.
 */
export const rosterApi = {
  list: () => api<Roster[]>(ROOT, { fresh: true }),

  create: (title: string) => api<Roster>(ROOT, { method: 'POST', body: { title } }),

  rename: (id: number, title: string, keepalive?: boolean) =>
    api<Roster>(`${ROOT}/${id}`, { method: 'PUT', body: { title }, keepalive }),

  remove: (id: number) => api<void>(`${ROOT}/${id}`, { method: 'DELETE' }),

  month: (id: number, month: string) => api<RosterMonth>(`${ROOT}/${id}/month/${month}`, { fresh: true }),

  addPerson: (id: number, person: RosterPersonSave) =>
    api<RosterPerson>(`${ROOT}/${id}/people`, { method: 'POST', body: person }),

  updatePerson: (id: number, personId: number, person: RosterPersonSave, keepalive?: boolean) =>
    api<RosterPerson>(`${ROOT}/${id}/people/${personId}`, { method: 'PUT', body: person, keepalive }),

  removePerson: (id: number, personId: number) =>
    api<void>(`${ROOT}/${id}/people/${personId}`, { method: 'DELETE' }),

  /** All of it or none of it, at most 500 entries, answered with no content. */
  saveCells: (id: number, set: RosterShift[], clear: RosterCellClear[], keepalive?: boolean) =>
    api<void>(`${ROOT}/${id}/cells`, { method: 'PUT', body: { set, clear }, keepalive }),

  repeat: (id: number, month: string) =>
    api<RosterRepeated>(`${ROOT}/${id}/repeat`, { method: 'POST', body: { month } }),

  /** Turns the link on, or replaces it, which kills the old one at once. */
  share: (id: number) => api<{ share_slug: string }>(`${ROOT}/${id}/share`, { method: 'POST' }),

  unshare: (id: number) => api<void>(`${ROOT}/${id}/share`, { method: 'DELETE' }),
};

/** The server turning a save down, as against the save not getting through. Asking again gets the same answer, so holding on to it would stop every edit behind it. */
export function refusedForGood(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 400 || error.status === 404);
}

/**
 * One batch off the save queue, sent one request at a time, so a roster never
 * has two writes crossing. The cells go first: on the way out of a page only
 * the first request is sure to leave, and the cells are the work of the burst.
 */
export async function sendEdits(id: number, edits: RosterEdit[], keepalive?: boolean): Promise<void> {
  const set: RosterShift[] = [];
  const clear: RosterCellClear[] = [];

  for (const edit of edits) {
    if (edit.kind === 'set') set.push(edit.shift);
    else if (edit.kind === 'clear') clear.push({ person_id: edit.person_id, date: edit.date });
  }

  if (set.length + clear.length > 0) await rosterApi.saveCells(id, set, clear, keepalive);

  for (const edit of edits) {
    if (edit.kind === 'title') await rosterApi.rename(id, edit.title, keepalive);
    else if (edit.kind === 'person') await rosterApi.updatePerson(id, edit.id, edit.save, keepalive);
  }
}
