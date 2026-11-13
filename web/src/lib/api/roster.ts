'use client';

import type { WeekHours } from '@/lib/calendar/models';
import type { RosterEdit } from '@/lib/roster/edits';
import { HttpError, api } from './http';

export type PositionHoursMode = 'none' | 'own' | 'venue';
export type PersonHoursMode = 'inherit' | 'own';

/** Mirrors RosterHoursDto. Times are set only in own mode. */
export interface RosterHours<Mode extends string = string> {
  mode: Mode;
  start_time: string | null;
  end_time: string | null;
  /** Weekdays that run other hours than the pair above. */
  week_hours: WeekHours[];
}

/** Mirrors RosterPatternDto: the days somebody usually works. */
export interface RosterPattern {
  kind: 'none' | 'weekdays' | 'cycle';
  /** ISO, Monday 1. */
  weekdays: number[];
  on: number | null;
  off: number | null;
  /** yyyy-MM-dd, a first working day of the rhythm. */
  from: string | null;
}

/** Mirrors RosterPositionDto. */
export interface RosterPosition {
  id: number;
  name: string;
  hours: RosterHours<PositionHoursMode>;
}

export type RosterPositionSave = Omit<RosterPosition, 'id'>;

/** A name on a roster. Mirrors RosterPersonDto; no account stands behind it. */
export interface RosterPerson {
  id: number;
  name: string;
  position_id: number | null;
  /** The position's name, as the server last said it. */
  position: string | null;
  /** #rrggbb, lower case. */
  colour: string;
  hours: RosterHours<PersonHoursMode>;
  pattern: RosterPattern;
}

/** What the page sends: always every field, and never the position's name, which the server would take for an older client's. */
export type RosterPersonSave = Omit<RosterPerson, 'id' | 'position'>;

/** Mirrors RosterDto. */
export interface Roster {
  id: number;
  title: string;
  /** Null means the link is off. */
  share_slug: string | null;
  /** Open weekdays only; empty is "not set". */
  venue_hours: WeekHours[];
  positions: RosterPosition[];
  people: RosterPerson[];
}

/** One filled cell, in "HH:mm". A shift past midnight is held on its start date. Null hours are a day with no set time. */
export interface RosterShift {
  person_id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
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

export interface RosterFilled {
  added: number;
  kept: number;
  /** Working days left empty because the venue is closed. */
  skipped: number;
  /** yyyy-MM-dd: today in the current month, the 1st in a later one. */
  from: string;
}

export interface RosterCleared {
  cleared: number;
  /** yyyy-MM-dd. */
  from: string;
}

/** How many shifts already placed a save moved to the new usual time. */
export interface Restamped {
  restamped: number;
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

  /** With the days that have no set time, which a build from before them would trip on and so only gets when it asks. */
  month: (id: number, month: string) => api<RosterMonth>(`${ROOT}/${id}/month/${month}?bare=1`, { fresh: true }),

  /** Replaces the list; empty is "not set". */
  saveVenueHours: (id: number, venue_hours: WeekHours[]) =>
    api<{ venue_hours: WeekHours[] } & Restamped>(`${ROOT}/${id}/venue-hours`, {
      method: 'PUT',
      body: { venue_hours },
    }),

  addPosition: (id: number, save: RosterPositionSave) =>
    api<RosterPosition>(`${ROOT}/${id}/positions`, { method: 'POST', body: save }),

  updatePosition: (id: number, positionId: number, save: RosterPositionSave) =>
    api<RosterPosition & Restamped>(`${ROOT}/${id}/positions/${positionId}`, { method: 'PUT', body: save }),

  /** Its people stay, with no position. */
  removePosition: (id: number, positionId: number) =>
    api<Restamped>(`${ROOT}/${id}/positions/${positionId}`, { method: 'DELETE' }),

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

  /** Everybody on their working days and usual hours, into the empty cells from the owner's today on. */
  fill: (id: number, month: string) =>
    api<RosterFilled>(`${ROOT}/${id}/fill`, { method: 'POST', body: { month } }),

  /** Every shift from the owner's today to the month's end. */
  clear: (id: number, month: string) =>
    api<RosterCleared>(`${ROOT}/${id}/clear`, { method: 'POST', body: { month } }),

  /** Turns the link on, or replaces it, which kills the old one at once. */
  share: (id: number) => api<{ share_slug: string }>(`${ROOT}/${id}/share`, { method: 'POST' }),

  unshare: (id: number) => api<void>(`${ROOT}/${id}/share`, { method: 'DELETE' }),
};

/** The server turning a save down, as against the save not getting through. Asking again gets the same answer, so holding on to it would stop every edit behind it. */
export function refusedForGood(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 400 || error.status === 404);
}

/** Cells that go out together, in one request. */
interface CellsStep {
  kind: 'cells';
  set: RosterShift[];
  clear: RosterCellClear[];
}

/**
 * One batch off the save queue, sent one request at a time, so a roster never
 * has two writes crossing. The cells go first: on the way out of a page only
 * the first request is sure to leave, and the cells are the work of the burst.
 * All but those of somebody whose own edit came before them in the batch: the
 * server moves that person's shifts at their old usual time as it saves them,
 * and a cell set since would be moved with them, though the screen put it
 * there after the move. Those follow their person, in the order they were put.
 */
export async function sendEdits(id: number, edits: RosterEdit[], keepalive?: boolean): Promise<void> {
  const first: CellsStep = { kind: 'cells', set: [], clear: [] };
  const steps: (CellsStep | RosterEdit)[] = [first];
  const saved = new Set<number>();

  for (const edit of edits) {
    if (edit.kind === 'title' || edit.kind === 'person') {
      steps.push(edit);

      if (edit.kind === 'person') saved.add(edit.id);

      continue;
    }

    const personId = edit.kind === 'set' ? edit.shift.person_id : edit.person_id;
    const last = steps[steps.length - 1];
    let cells = first;

    if (saved.has(personId)) {
      cells = last.kind === 'cells' ? last : { kind: 'cells', set: [], clear: [] };

      if (cells !== last) steps.push(cells);
    }

    if (edit.kind === 'set') cells.set.push(edit.shift);
    else cells.clear.push({ person_id: edit.person_id, date: edit.date });
  }

  for (const step of steps) {
    if (step.kind === 'cells') {
      if (step.set.length + step.clear.length > 0) await rosterApi.saveCells(id, step.set, step.clear, keepalive);
    } else if (step.kind === 'title') {
      await rosterApi.rename(id, step.title, keepalive);
    } else if (step.kind === 'person') {
      await rosterApi.updatePerson(id, step.id, step.save, keepalive);
    }
  }
}
