import type { RosterFilled, RosterMonth, RosterPerson, RosterPersonSave, RosterShift } from '@/lib/api/roster';
import { fromKey, todayKey } from '@/lib/calendar/calendar-date';
import { nWord } from '@/lib/i18n/plural';
import { defaultHours, positionName, restamp } from '@/lib/roster/rules';
import type { Language } from '@/lib/settings/settings';
import { Brush, Tool, sameBrush } from './brushes';
import { pairOf, sameHours } from './hours';
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

/** What a person save sends, field by field: a spread of the person would carry their position's name, and the server would read that as an older client's word. */
export function personSave(person: RosterPersonSave): RosterPersonSave {
  return {
    name: person.name,
    colour: person.colour,
    position_id: person.position_id,
    hours: person.hours,
    pattern: person.pattern,
  };
}

/**
 * The month with one edit laid over it. A person whose usual time changes takes
 * the shifts sitting at the old one along, from today on, as the server does in
 * the same save; laid again over a read that already has it, nothing differs.
 * The screen takes each step as it is made, while the server gets only the
 * last word on a person and moves from what it held, by the owner's today:
 * moves do not add up, so the page reads the month back once that word lands.
 */
export function applyEdit(sheet: RosterMonth, edit: RosterEdit, today = todayKey()): RosterMonth {
  if (edit.kind === 'title') return { ...sheet, title: edit.title };

  if (edit.kind === 'person') {
    const people = sheet.people.map((person) =>
      person.id === edit.id
        ? { ...person, ...personSave(edit.save), position: positionName(sheet.positions, edit.save.position_id) }
        : person,
    );
    const after = { ...sheet, people };

    return { ...after, shifts: restamp(sheet.shifts, sheet, after, today).shifts };
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
  return edits.reduce((month, edit) => applyEdit(month, edit), sheet);
}

const setOf = (personId: number, date: string, hours: Brush | null): RosterEdit => ({
  kind: 'set',
  shift: { person_id: personId, date, start_time: hours?.start ?? null, end_time: hours?.end ?? null },
});

/** What a click does with a brush in hand: the same hours again clear the cell, anything else takes them. */
export function stamp(current: RosterShift | undefined, personId: number, date: string, brush: Brush): RosterEdit {
  const pair = current === undefined ? null : pairOf(current);

  if (pair !== null && sameBrush(pair, brush)) return { kind: 'clear', person_id: personId, date };

  return setOf(personId, date, brush);
}

/** A person's usual time on a date as a brush, or null when nothing gives them one. */
export function usualFor(
  person: Pick<RosterPerson, 'position_id' | 'hours'>,
  sheet: Pick<RosterMonth, 'positions' | 'venue_hours'>,
  date: string,
): Brush | null {
  const hours = defaultHours(person, sheet.positions, sheet.venue_hours, date);

  return hours === null ? null : { start: hours.start_time, end: hours.end_time };
}

/**
 * What a click does with a tool in hand. Hour brushes paint over anything. The
 * usual time and no time only fill an empty cell or take off exactly what they
 * would put: a cell holding anything else was set by hand on purpose, so it
 * opens rather than being overwritten.
 */
export function press(
  tool: Tool,
  current: RosterShift | undefined,
  personId: number,
  date: string,
  usual: Brush | null,
): RosterEdit | 'open' {
  if (tool.kind === 'hours') return stamp(current, personId, date, tool.brush);

  const putting = tool.kind === 'usual' ? usual : null;

  if (current === undefined) return setOf(personId, date, putting);
  if (sameHours(pairOf(current), putting)) return { kind: 'clear', person_id: personId, date };

  return 'open';
}

/** Somebody else takes a day. Hand-set hours go with the day; a day at the first person's usual time takes the second's usual time instead. */
export function swap(
  current: RosterShift | undefined,
  fromId: number,
  toId: number,
  date: string,
  usualFrom: Brush | null,
  usualTo: Brush | null,
): RosterEdit[] {
  const held = current === undefined ? null : pairOf(current);

  return [
    { kind: 'clear', person_id: fromId, date },
    setOf(toId, date, sameHours(held, usualFrom) ? usualTo : held),
  ];
}

/** The edits that put every cell these touch back as it was. */
export function undoOf(edits: RosterEdit[], cells: Map<string, RosterShift>): RosterEdit[] {
  const back = new Map<string, RosterEdit>();

  for (const edit of edits) {
    if (edit.kind !== 'set' && edit.kind !== 'clear') continue;

    const personId = edit.kind === 'set' ? edit.shift.person_id : edit.person_id;
    const date = edit.kind === 'set' ? edit.shift.date : edit.date;
    const key = cellKey(personId, date);

    // The first touch is the one that knows what the cell held.
    if (back.has(key)) continue;

    const was = cells.get(key);

    back.set(key, was === undefined ? { kind: 'clear', person_id: personId, date } : { kind: 'set', shift: was });
  }

  return [...back.values()];
}

/** What a fill started from: the roster and month it filled, and their cells as the screen held them. */
export interface FillStart {
  id: number;
  month: string;
  was: Map<string, RosterShift>;
}

/**
 * The edits that take a fill back: a clear for each cell it found empty and
 * left filled. Null when the month read after it is another roster's or
 * month's, since the owner may have moved on while it was out, and none of
 * those shifts were ever empty to it. A cell the owner changed meanwhile, its
 * key among those touched, is theirs and stays.
 */
export function fillUndo(
  start: FillStart,
  after: Pick<RosterMonth, 'id' | 'month' | 'shifts'>,
  touched: ReadonlySet<string>,
): RosterEdit[] | null {
  if (after.id !== start.id || after.month !== start.month) return null;

  return after.shifts
    .filter((shift) => !start.was.has(cellKey(shift.person_id, shift.date)))
    .map((shift): RosterEdit => ({ kind: 'clear', person_id: shift.person_id, date: shift.date }))
    .filter((clear) => !touched.has(editKey(clear)));
}

/** Who a fill leaves to the owner, or 'ask' when nobody has working days at all: then the press opens the list to mark them, rather than filling nothing. */
export function fillScope(people: Pick<RosterPerson, 'name' | 'pattern'>[]): { leftOut: string[] } | 'ask' {
  const leftOut = people.filter((person) => person.pattern.kind === 'none').map((person) => person.name);

  return leftOut.length === people.length ? 'ask' : { leftOut };
}

/** What filling the month did, in one sentence: the server's own count, from the day it started at, and who was left for the owner. */
export function fillNotice(
  filled: RosterFilled,
  firstOfMonth: string,
  leftOut: string[],
  t: (key: string) => string,
  lang: Language,
): string {
  const { added, kept, skipped, from } = filled;
  const n = (count: number, key: string) => nWord(lang, count, key);
  const closed = skipped > 0 ? ` ${t('Not placed, the venue is closed')}: ${n(skipped, 'days')}.` : '';

  let said: string;

  if (added + kept + skipped === 0) {
    said = t(from > firstOfMonth ? 'Nobody has working days left this month.' : 'Nobody has working days this month.');
  } else if (added === 0 && kept === 0) {
    said = t('Nobody was put on: the venue is closed on those days.');
  } else if (added === 0) {
    said = `${t('No new shifts, the filled days stayed as they were.')}${closed}`;
  } else {
    const date = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }).format(fromKey(from));
    const since = from > firstOfMonth ? `${t('Added from')} ${date}` : t('Added');

    said = `${since}: ${n(added, 'shifts')}.${kept > 0 ? ` ${t('Already there')}: ${n(kept, 'shifts')}.` : ''}${closed}`;
  }

  return leftOut.length === 0 ? said : `${said} ${t('No working days')}: ${leftOut.join(', ')} — ${t('put them on by hand.')}`;
}
