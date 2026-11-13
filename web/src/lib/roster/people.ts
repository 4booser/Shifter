import type { PersonHoursMode, RosterHours, RosterPattern, RosterPerson, RosterPersonSave } from '@/lib/api/roster';
import { WEEKDAY_LABELS, fromKey, shiftDays } from '@/lib/calendar/calendar-date';
import { WeekRow, flatOf, hasEmptyRow, rowsOf } from '@/lib/calendar/shift-hours';
import { validHours } from './hours';

/** The colours a roster is drawn in. Lower case, which is how the server holds them. */
export const ROSTER_COLOURS = [
  '#6366f1',
  '#d97706',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#a855f7',
  '#059669',
  '#dc2626',
  '#2563eb',
  '#78716c',
] as const;

/** The most positions a roster holds, as the server counts them. */
export const MAX_POSITIONS = 20;

/** The longest a position's name may be. */
export const POSITION_LENGTH = 40;

/** A person who takes their position's time, or the venue's. */
export const INHERIT: RosterHours<'inherit'> = { mode: 'inherit', start_time: null, end_time: null, week_hours: [] };

/** Nobody said which days they work: they are put on by hand. */
export const NO_PATTERN: RosterPattern = { kind: 'none', weekdays: [], on: null, off: null, from: null };

/** The next person's colour: one nobody wears yet, then round again. */
export function nextColour(people: RosterPerson[]): string {
  const worn = new Set(people.map((person) => person.colour));

  return ROSTER_COLOURS.find((colour) => !worn.has(colour)) ?? ROSTER_COLOURS[people.length % ROSTER_COLOURS.length];
}

/** The names behind these ids, for a sentence. Whoever the page never knew is left out rather than shown as a number. */
export function namesOf(ids: number[], people: RosterPerson[]): string {
  const known = new Map(people.map((person) => [person.id, person.name]));

  return ids.flatMap((id) => known.get(id) ?? []).join(', ');
}

/** Hours as a form holds them: the times as typed and the overrides as rows, either of which can be half made. */
export interface HoursDraft<Mode extends string = string> {
  mode: Mode;
  start: string;
  end: string;
  rows: WeekRow[];
}

/** Stored hours, ready to edit. */
export const draftOf = <Mode extends string>(hours: RosterHours<Mode>): HoursDraft<Mode> => ({
  mode: hours.mode,
  start: hours.start_time ?? '',
  end: hours.end_time ?? '',
  rows: rowsOf(hours.week_hours),
});

/** Whether every override row has its days and two different times. A row with no days would vanish on save and leave those days on the main time. */
export const rowsReady = (rows: WeekRow[]): boolean =>
  !hasEmptyRow(rows) && rows.every((row) => validHours(row.start, row.end));

/** A draft as the server keeps it, or null while own hours are half typed. Any other mode carries no times. */
export function hoursOf<Mode extends string>(draft: HoursDraft<Mode>): RosterHours<Mode> | null {
  if (draft.mode !== 'own') return { mode: draft.mode, start_time: null, end_time: null, week_hours: [] };

  if (!validHours(draft.start, draft.end) || !rowsReady(draft.rows)) return null;

  return { mode: draft.mode, start_time: draft.start, end_time: draft.end, week_hours: flatOf(draft.rows) };
}

const inCycle = (days: number | null): days is number => days !== null && Number.isInteger(days) && days >= 1 && days <= 28;

/** A pattern as the server keeps it, the fields of the other kinds let go, or null while it is not one yet. */
export function patternOf(pattern: RosterPattern): RosterPattern | null {
  if (pattern.kind === 'weekdays') {
    if (pattern.weekdays.length === 0) return null;

    return { ...NO_PATTERN, kind: 'weekdays', weekdays: [...new Set(pattern.weekdays)].sort((one, two) => one - two) };
  }

  if (pattern.kind === 'cycle') {
    if (!inCycle(pattern.on) || !inCycle(pattern.off) || pattern.from === null) return null;

    return { ...NO_PATTERN, kind: 'cycle', on: pattern.on, off: pattern.off, from: pattern.from };
  }

  return NO_PATTERN;
}

/** Everything the person form holds. */
export interface PersonFields {
  name: string;
  colour: string;
  positionId: number | null;
  hours: HoursDraft<PersonHoursMode>;
  pattern: RosterPattern;
}

/** A form's values the way the server will keep them, so the screen is not corrected by the answer; null while a section is half done, which holds the save back. Built field by field, so no position name can ride along. */
export function cleanPerson(fields: PersonFields): RosterPersonSave | null {
  const name = fields.name.trim();
  const hours = hoursOf(fields.hours);
  const pattern = patternOf(fields.pattern);

  if (name === '' || hours === null || pattern === null) return null;

  return { name, colour: fields.colour, position_id: fields.positionId, hours, pattern };
}

/** The next person's rhythm: a cycle moved on by its working days, so the second of a 2/2 pair is not put on the same days as the first. */
export function nextFrom(pattern: RosterPattern): RosterPattern {
  if (pattern.kind !== 'cycle' || pattern.from === null || pattern.on === null) return pattern;

  return { ...pattern, from: shiftDays(pattern.from, pattern.on) };
}

/** A pattern in a few words, for a chip: «Вручную», «Пн Ср Пт», «2/2 · с 13 нояб.». */
export function patternLabel(pattern: RosterPattern, t: (key: string) => string, lang: string): string {
  if (pattern.kind === 'weekdays' && pattern.weekdays.length > 0) {
    return [...pattern.weekdays]
      .sort((one, two) => one - two)
      .map((weekday) => t(WEEKDAY_LABELS[weekday - 1]))
      .join(' ');
  }

  if (pattern.kind === 'cycle' && pattern.on !== null && pattern.off !== null) {
    const rhythm = `${pattern.on}/${pattern.off}`;

    if (pattern.from === null) return rhythm;

    const date = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(fromKey(pattern.from));

    return `${rhythm} · ${t('from')} ${date}`;
  }

  return t('By hand');
}
