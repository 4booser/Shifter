import type { RosterMonth, RosterPerson, RosterPersonSave, RosterShift } from '@/lib/api/roster';
import { Brush, sameBrush } from './brushes';
import { cellKey } from './month';

/** One change the screen already shows and the server has not heard yet. */
export type RosterEdit =
  | { kind: 'title'; title: string }
  | { kind: 'person'; id: number; save: RosterPersonSave }
  | { kind: 'set'; shift: RosterShift }
  | { kind: 'clear'; person_id: number; date: string };

/** What an edit is about. Two with one key are one change in two steps, and only the later goes out. */
export function editKey(edit: RosterEdit): string {
  if (edit.kind === 'title') return 'title';
  if (edit.kind === 'person') return `person:${edit.id}`;
  if (edit.kind === 'set') return `cell:${cellKey(edit.shift.person_id, edit.shift.date)}`;

  return `cell:${cellKey(edit.person_id, edit.date)}`;
}

/** Whether a queued edit is about this person, for the moment they are removed: left in, it would fail the whole batch it rides in. */
export const aboutPerson = (personId: number) => (key: string): boolean =>
  key === `person:${personId}` || key.startsWith(`cell:${personId}:`);

/** Whose edit this is. A title is nobody's. */
export function personOf(edit: RosterEdit): number | null {
  if (edit.kind === 'title') return null;
  if (edit.kind === 'person') return edit.id;

  return edit.kind === 'set' ? edit.shift.person_id : edit.person_id;
}

/** Who these edits name that the roster no longer holds, each once. */
export function peopleGone(edits: Iterable<RosterEdit>, people: RosterPerson[]): number[] {
  const here = new Set(people.map((person) => person.id));
  const named = [...edits].map(personOf).filter((id) => id !== null);

  return [...new Set(named)].filter((id) => !here.has(id));
}

/** The month with one edit laid over it. */
export function applyEdit(sheet: RosterMonth, edit: RosterEdit): RosterMonth {
  if (edit.kind === 'title') return { ...sheet, title: edit.title };

  if (edit.kind === 'person') {
    return {
      ...sheet,
      people: sheet.people.map((person) => (person.id === edit.id ? { ...person, ...edit.save } : person)),
    };
  }

  const personId = edit.kind === 'set' ? edit.shift.person_id : edit.person_id;
  const date = edit.kind === 'set' ? edit.shift.date : edit.date;

  // A queue outlives a month on screen, and this edit may belong to another.
  if (!date.startsWith(sheet.month)) return sheet;

  const others = sheet.shifts.filter((shift) => shift.person_id !== personId || shift.date !== date);

  return { ...sheet, shifts: edit.kind === 'set' ? [...others, edit.shift] : others };
}

/** A month as read, with what has not landed yet back on top, so a read cannot take a shift off the screen. */
export function overlay(sheet: RosterMonth, edits: RosterEdit[]): RosterMonth {
  return edits.reduce(applyEdit, sheet);
}

/** What a click does with a brush in hand: the same hours again clear the cell, anything else takes them. */
export function stamp(current: RosterShift | undefined, personId: number, date: string, brush: Brush): RosterEdit {
  if (current !== undefined && sameBrush({ start: current.start_time, end: current.end_time }, brush)) {
    return { kind: 'clear', person_id: personId, date };
  }

  return { kind: 'set', shift: { person_id: personId, date, start_time: brush.start, end_time: brush.end } };
}
