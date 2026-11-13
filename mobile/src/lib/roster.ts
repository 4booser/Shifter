import {
  byPosition,
  defaultHours,
  HoursPair,
  openOn,
  positionGroups,
  worksOn,
} from '@/lib/roster-rules';

import {
  addMonths,
  covers,
  monthBounds,
  monthCells,
  monthsBetween,
  nextDay,
  pad,
  shortDate,
  WEEK_NAMES,
  YearMonth,
} from './calendar';
import { plural, t } from './i18n';
import { isClock, tidyClock } from './shift-window';
import { WeekHours } from './types';
import { toWeekHours, toWeekRows, WeekRow, weekRowsProblem } from './week-rows';

/**
 * A roster: one person writing a month for a crew who never registered. It
 * stands apart from days, shifts and teams, so nothing here reaches for them,
 * and nothing here is native, so all of it runs under the test runner. Whose
 * default time is what, and who works which day, are the shared rules in
 * @/lib/roster-rules, which the web reads too: none of that is written here.
 */

export type PositionHoursMode = 'none' | 'own' | 'venue';
export type PersonHoursMode = 'inherit' | 'own';

/** Mirrors the wire's hours. Times are set only in own mode. */
export interface RosterHours<Mode extends string = string> {
  mode: Mode;
  start_time: string | null;
  end_time: string | null;
  /** Weekdays that run other hours than the usual pair. */
  week_hours: WeekHours[];
}

/** A person's usual days: none, some weekdays, or a rhythm of days on and off. */
export interface RosterPattern {
  kind: 'none' | 'weekdays' | 'cycle';
  weekdays: number[];
  on: number | null;
  off: number | null;
  /** yyyy-MM-dd, a first working day of the rhythm; it runs both ways from there. */
  from: string | null;
}

/** A job on the roster, Бармен or Кальянщик, and where its hours come from. */
export interface RosterPosition {
  id: number;
  name: string;
  hours: RosterHours<PositionHoursMode>;
}

export type RosterPositionSave = Omit<RosterPosition, 'id'>;

export interface RosterPerson {
  id: number;
  name: string;
  position_id: number | null;
  /** The position's name, as the server last said it. */
  position: string | null;
  colour: string;
  hours: RosterHours<PersonHoursMode>;
  pattern: RosterPattern;
}

export interface Roster {
  id: number;
  title: string;
  /** Null while the link is off. */
  share_slug: string | null;
  /** Open weekdays only; empty is "not set". */
  venue_hours: WeekHours[];
  positions: RosterPosition[];
  people: RosterPerson[];
}

/** Null hours are a day with no set time. */
export interface RosterShift {
  person_id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
}

export interface RosterMonth {
  id: number;
  title: string;
  share_slug: string | null;
  /** "2026-11". */
  month: string;
  venue_hours: WeekHours[];
  positions: RosterPosition[];
  people: RosterPerson[];
  shifts: RosterShift[];
}

/** What decides everybody's default time, which a roster and a month both carry. */
export type RosterSheet = Pick<Roster, 'venue_hours' | 'positions' | 'people'>;

export interface RosterRepeated {
  added: number;
  kept: number;
}

export interface RosterFilled {
  added: number;
  kept: number;
  skipped: number;
  /** yyyy-MM-dd: today in the current month, the 1st in a later one. */
  from: string;
}

export interface RosterCleared {
  cleared: number;
  from: string;
}

/** How many shifts a save moved from the old default time to the new one. */
export interface Restamped {
  restamped: number;
}

/** A cell's hours. Both null is a day with no set time. */
export interface HourPair {
  start_time: string | null;
  end_time: string | null;
}

/** One cell as it should end up. No hours empties it; a pair of nulls fills it with no set time. */
export interface CellEdit {
  person_id: number;
  date: string;
  hours: HourPair | null;
}

/** A save as the wire takes it. */
export interface RosterBatch {
  set: RosterShift[];
  clear: { person_id: number; date: string }[];
}

export const TITLE_MAX = 60;
export const NAME_MAX = 40;
export const POSITION_MAX = 40;
export const MOST_ROSTERS = 20;
export const MOST_PEOPLE = 60;
export const BATCH_MOST = 500;
export const POSITIONS_MOST = 20;
/** The longest run of days on, and of days off, a rhythm can have. */
export const CYCLE_MOST = 28;

/** A day with no set time. */
export const NO_TIME: HourPair = { start_time: null, end_time: null };

/** Hours of their own: none, so the position's or the venue's count. */
export const INHERIT: RosterHours<'inherit'> = { mode: 'inherit', start_time: null, end_time: null, week_hours: [] };

/** No usual days: put on by hand. */
export const NO_PATTERN: RosterPattern = { kind: 'none', weekdays: [], on: null, off: null, from: null };

/** How far the server keeps months. Past either end it refuses, so the pager stops there. */
export const ROSTER_REACH: { first: YearMonth; last: YearMonth } = {
  first: { year: 2000, month: 1 },
  last: { year: 2100, month: 12 },
};

/** A colour for each new face. Lower case, the way the server keeps them. */
export const ROSTER_COLOURS = [
  '#ff5c7a', '#ffa53d', '#f5c518', '#22c55e', '#14b8a6',
  '#38bdf8', '#6366f1', '#a855f7', '#ec4899', '#64748b',
];

/** The first colour nobody has yet, so three people added in a row do not come out the same. */
export const nextColour = (people: RosterPerson[]): string =>
  ROSTER_COLOURS.find((colour) => !people.some((person) => person.colour === colour))
  ?? ROSTER_COLOURS[people.length % ROSTER_COLOURS.length];

/** The wire's name for a month. */
export const monthKey = ({ year, month }: YearMonth): string => `${year}-${pad(month)}`;

/** The month one step away, or null past the ends the server keeps. */
export const stepMonth = (at: YearMonth, by: number): YearMonth | null => {
  const next = addMonths(at, by);

  return monthsBetween(ROSTER_REACH.first, next) >= 0 && monthsBetween(next, ROSTER_REACH.last) >= 0
    ? next
    : null;
};

const shortClock = (time: string): string => {
  const [hours, minutes] = time.split(':');

  return minutes === '00' ? `${Number(hours)}` : `${Number(hours)}:${minutes}`;
};

/**
 * The hours as a crew writes them: 11-22, 11:30-22. The same rule the link
 * draws by, so a phone and the page never disagree about what a cell says.
 * Midnight closes a shift as 24, since 18-0 reads as nothing.
 */
export const compactHours = (start: string, end: string): string =>
  `${shortClock(start)}-${end === '00:00' ? '24' : shortClock(end)}`;

/** What a filled cell says, or null for a day with no set time: the dot in the person's colour already says they work. */
export const cellText = (shift: HourPair): string | null =>
  shift.start_time === null || shift.end_time === null
    ? null
    : compactHours(shift.start_time, shift.end_time);

/** Two cells' hours are the same: both no time, or the same pair. */
export const sameHours = (one: HourPair | null, two: HourPair | null): boolean =>
  one === null || two === null
    ? one === two
    : one.start_time === two.start_time && one.end_time === two.end_time;

/**
 * What somebody typed, as the wire writes a time, or null. A thumb writes 11,
 * 1130 and 11.30 as often as 11:30, and 24 is what the list itself says for a
 * shift that closes at midnight.
 */
export const readClock = (typed: string): string | null => {
  const text = typed.trim().replace(/[.,\- ]/, ':');

  if (text === '24' || text === '24:00') return '00:00';

  const spelled = /^\d{1,2}$/.test(text)
    ? `${text}:00`
    : /^\d{3,4}$/.test(text)
      ? `${text.slice(0, -2)}:${text.slice(-2)}`
      : text;

  return isClock(spelled) ? tidyClock(spelled) : null;
};

/** What is wrong with two typed times, as a phrase for t(), or null. */
export const hoursProblem = (start: string, end: string): string | null => {
  const opens = readClock(start);
  const closes = readClock(end);

  if (opens === null || closes === null) return 'Время пишется как 18:00.';
  if (opens === closes) return 'Начало и конец должны отличаться.';

  return null;
};

/** An end at or before the start runs into the next day and stays on its start date. */
export const crossesMidnight = (start: string, end: string): boolean => end <= start;

/** The hour pairs already used this month, the commonest first: the second week is mostly the first one again. A day with no time is no pair. */
export const hourPairs = (shifts: RosterShift[]): HoursPair[] => {
  const counted = new Map<string, { pair: HoursPair; count: number }>();

  for (const { start_time, end_time } of shifts) {
    if (start_time === null || end_time === null) continue;

    const key = `${start_time}|${end_time}`;
    const known = counted.get(key);

    if (known === undefined) counted.set(key, { pair: { start_time, end_time }, count: 1 });
    else known.count += 1;
  }

  return [...counted.values()].sort((one, two) => two.count - one.count).map((row) => row.pair);
};

export const cellKey = (person: number, date: string): string => `${person}|${date}`;

/** Edits laid over a month, the ones that belong to it. A month read from the server has not heard of what is still on its way. */
export const withEdits = (month: RosterMonth, edits: CellEdit[]): RosterMonth => {
  const here = edits.filter((edit) => edit.date.startsWith(`${month.month}-`));

  if (here.length === 0) return month;

  const touched = new Set(here.map((edit) => cellKey(edit.person_id, edit.date)));

  return {
    ...month,
    shifts: [
      ...month.shifts.filter((shift) => !touched.has(cellKey(shift.person_id, shift.date))),
      ...here.flatMap(({ person_id, date, hours }) =>
        hours === null ? [] : [{ person_id, date, ...hours }],
      ),
    ],
  };
};

export const toBatch = (edits: CellEdit[]): RosterBatch => ({
  set: edits.flatMap(({ person_id, date, hours }) =>
    hours === null ? [] : [{ person_id, date, ...hours }],
  ),
  clear: edits
    .filter((edit) => edit.hours === null)
    .map(({ person_id, date }) => ({ person_id, date })),
});

/** Who works a day with one position, by start time. */
export interface DayGroup {
  /** Null for the people with no position, always last. */
  position: RosterPosition | null;
  working: { person: RosterPerson; shift: RosterShift }[];
}

export interface RosterDay {
  date: string;
  /** The venue does not open: the day is dimmed, and fill puts nobody on it. */
  closed: boolean;
  /** Who works it, a group per position in the order the web and the link list them. */
  groups: DayGroup[];
  /** Who does not, in the same order. The day has to offer them, or an empty day could never be filled. */
  free: RosterPerson[];
  /** Whether the groups get a label: only once the roster has positions at all. */
  labelled: boolean;
}

export interface DayList {
  /** Today and what is left of the month, or all of it where today is not in it. */
  coming: RosterDay[];
  /** The days of this month already behind, in date order. */
  past: RosterDay[];
}

/** Earliest start first; a day with no time after every timed one, and the sort is stable, so ties keep the roster's order. */
const byStart = (one: { shift: RosterShift }, two: { shift: RosterShift }): number => {
  const [first, second] = [one.shift.start_time, two.shift.start_time];

  if (first === null || second === null) return (first === null ? 1 : 0) - (second === null ? 1 : 0);

  return first.localeCompare(second);
};

/** The month by day, with today on top. Empty days stay in: this is where they get filled. */
export const dayList = (
  at: YearMonth,
  people: RosterPerson[],
  shifts: RosterShift[],
  today: string,
  positions: RosterPosition[] = [],
  venueHours: WeekHours[] = [],
): DayList => {
  const { from, to } = monthBounds(at);
  const held = new Map(shifts.map((shift) => [cellKey(shift.person_id, shift.date), shift]));
  const ordered = byPosition(people, positions);
  const days: RosterDay[] = [];

  for (let date = from; date <= to; date = nextDay(date)) {
    const working: RosterPerson[] = [];
    const free: RosterPerson[] = [];

    for (const person of ordered) {
      if (held.has(cellKey(person.id, date))) working.push(person);
      else free.push(person);
    }

    days.push({
      date,
      closed: !openOn(venueHours, date),
      groups: positionGroups(working, positions).map(({ position, people: group }) => ({
        position,
        working: group
          .map((person) => ({ person, shift: held.get(cellKey(person.id, date)) as RosterShift }))
          .sort(byStart),
      })),
      free,
      labelled: positions.length > 0,
    });
  }

  if (!covers(from, to, today)) return { coming: days, past: [] };

  return {
    coming: days.filter((day) => day.date >= today),
    past: days.filter((day) => day.date < today),
  };
};

/** The line left after a repeat. Kept is everything already in the month, whether or not the month before had it. */
export const repeatLine = ({ added, kept }: RosterRepeated): string => {
  if (added === 0) {
    return kept === 0
      ? t('В прошлом месяце смен нет, повторять нечего.')
      : t('Новых смен нет, заполненные дни остались как были.');
  }

  const filled = `${t('Добавлено')}: ${plural(added, t('смена'), t('смены'), t('смен'))}`;

  return kept === 0 ? `${filled}.` : `${filled}, ${t('уже стояло')}: ${kept}.`;
};

/** What a person's day is put on at by one tap: their default time, or no set time when nothing gives one. */
export const usualPair = (
  person: Pick<RosterPerson, 'position_id' | 'hours'>,
  sheet: Pick<RosterSheet, 'positions' | 'venue_hours'>,
  date: string,
): HourPair => defaultHours(person, sheet.positions, sheet.venue_hours, date) ?? NO_TIME;

/**
 * One person's day handed to another. A day at the first one's usual time
 * goes over at the second one's usual time, since that is what the owner
 * would have put; hand-set hours, or no time, go over as they are.
 */
export const swapEdits = (
  current: RosterShift,
  from: RosterPerson,
  to: RosterPerson,
  date: string,
  sheet: Pick<RosterSheet, 'positions' | 'venue_hours'>,
): CellEdit[] => {
  const held: HourPair = { start_time: current.start_time, end_time: current.end_time };
  const hours = sameHours(held, usualPair(from, sheet, date)) ? usualPair(to, sheet, date) : held;

  return [
    { person_id: from.id, date, hours: null },
    { person_id: to.id, date, hours },
  ];
};

/** The edits that put every cell these touch back the way it was. */
export const undoOf = (edits: CellEdit[], shifts: RosterShift[]): CellEdit[] => {
  const held = new Map(shifts.map((shift) => [cellKey(shift.person_id, shift.date), shift]));
  const touched = new Map<string, CellEdit>();

  for (const { person_id, date } of edits) {
    const was = held.get(cellKey(person_id, date));

    touched.set(cellKey(person_id, date), {
      person_id,
      date,
      hours: was === undefined ? null : { start_time: was.start_time, end_time: was.end_time },
    });
  }

  return [...touched.values()];
};

/**
 * What takes a fill back: every cell that was empty before it and is not now.
 * A cell that was there stays, whatever fill kept, and so does one the owner
 * put by hand while the fill was out: that one is theirs, not the fill's.
 */
export const undoFill = (before: RosterShift[], after: RosterShift[], theirs: CellEdit[] = []): CellEdit[] => {
  const had = new Set([...before, ...theirs].map((cell) => cellKey(cell.person_id, cell.date)));

  return after
    .filter((shift) => !had.has(cellKey(shift.person_id, shift.date)))
    .map(({ person_id, date }) => ({ person_id, date, hours: null }));
};

/** Where a fill or a clear starts: today in the current month, the 1st of a later one, and null for a month already over. Days gone by are what happened. */
export const fillFrom = (at: YearMonth, today: string): string | null => {
  const { from, to } = monthBounds(at);

  if (today > to) return null;

  return today > from ? today : from;
};

/** The months a date is said with: "13 ноября". */
const MONTHS_OF = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** A date as somebody would say it: "13 ноября". */
export const dayMonth = (date: string): string => {
  const [, month, day] = date.split('-');

  return `${Number(day)} ${t(MONTHS_OF[Number(month) - 1])}`;
};

/**
 * The line after a fill. It tells "nobody has working days" apart from "the
 * venue is closed on them", says from when it filled in a month already under
 * way, and names who it could not place because they have no usual days.
 */
export const fillLine = (
  { added, kept, skipped, from }: RosterFilled,
  at: YearMonth,
  leftOut: string[],
): string => {
  const closed = skipped > 0 ? `, ${t('не поставлено — заведение закрыто')}: ${skipped}` : '';
  let said: string;

  if (added + kept + skipped === 0) {
    said = from === monthBounds(at).from
      ? t('В этом месяце ни у кого нет рабочих дней.')
      : t('До конца месяца ни у кого нет рабочих дней.');
  } else if (added === 0 && kept === 0) {
    said = t('Никого не поставили — в эти дни заведение закрыто.');
  } else if (added === 0) {
    said = closed === ''
      ? t('Новых смен нет, заполненные дни остались как были.')
      : `${t('Новых смен нет, заполненные дни остались как были.').replace(/\.$/, '')}${closed}.`;
  } else {
    const since = from > monthBounds(at).from ? `${t('Добавлено с')} ${dayMonth(from)}` : t('Добавлено');
    const already = kept > 0 ? `, ${t('уже стояло')}: ${kept}` : '';

    said = `${since}: ${plural(added, t('смена'), t('смены'), t('смен'))}${already}${closed}.`;
  }

  return leftOut.length === 0
    ? said
    : `${said} ${t('Без рабочих дней')}: ${leftOut.join(', ')} — ${t('их ставьте вручную.')}`;
};

/** The line after a save that moved shifts sitting at the old usual time. */
export const restampLine = (restamped: number): string =>
  `${t('Время обновлено в уже поставленных сменах')}: ${restamped}.`;

/** A day counted on from another in whole calendar days, in UTC so a clock change cannot stretch one. */
const addDays = (date: string, days: number): string => {
  const [year, month, day] = date.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

/** A person's usual days in a few words, for a chip: Вручную, Пн Ср Пт, or 2/2 · Выходит с 13 ноя. */
export const patternLabel = (pattern: RosterPattern, at: YearMonth): string => {
  if (pattern.kind === 'weekdays' && pattern.weekdays.length > 0) {
    return [...pattern.weekdays]
      .sort((one, two) => one - two)
      .map((weekday) => t(WEEK_NAMES[weekday - 1]))
      .join(' ');
  }

  if (pattern.kind !== 'cycle' || pattern.on === null || pattern.off === null) return t('Вручную');

  const rhythm = `${pattern.on}/${pattern.off}`;

  if (pattern.from === null) return rhythm;

  // A rhythm anchored in another year would read as this one's without it.
  const year = Number(pattern.from.slice(0, 4)) === at.year ? '' : ` ${pattern.from.slice(0, 4)}`;

  return `${rhythm} · ${t('Выходит с')} ${shortDate(pattern.from)}${year}`;
};

/** The next person's rhythm after this one's: moved on by its days on, so the second of a 2/2 pair is not on the same days as the first. */
export const nextFrom = (pattern: RosterPattern): RosterPattern =>
  pattern.kind === 'cycle' && pattern.from !== null && pattern.on !== null
    ? { ...pattern, from: addDays(pattern.from, pattern.on) }
    : pattern;

/** Where a new rhythm starts: today when today is in the month shown, else its 1st. */
export const cycleStart = (at: YearMonth, today: string): string => {
  const { from, to } = monthBounds(at);

  return covers(from, to, today) ? today : from;
};

/** The month shown as weeks of seven, Monday first, with nulls either side of it. */
export const monthWeeks = (at: YearMonth): (string | null)[][] => {
  const cells = monthCells(at);

  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
};

/** What is wrong with somebody's usual days, as a phrase for t(), or null. */
export const patternProblem = (pattern: RosterPattern): string | null => {
  if (pattern.kind === 'weekdays' && pattern.weekdays.length === 0) return 'Выберите хотя бы один день.';

  if (pattern.kind !== 'cycle') return null;

  const fits = (days: number | null) => days !== null && Number.isInteger(days) && days >= 1 && days <= CYCLE_MOST;

  if (!fits(pattern.on) || !fits(pattern.off) || pattern.from === null) {
    return 'В цикле от 1 до 28 рабочих дней и от 1 до 28 выходных.';
  }

  return null;
};

/** A typed count of days, or null for anything that is not a whole number. */
export const readDays = (typed: string): number | null => (/^\d{1,2}$/.test(typed.trim()) ? Number(typed.trim()) : null);

/** Whether a name is already a position on the roster, by the server's rule: trimmed, and in any case. Renaming one to itself is no clash. */
export const positionTaken = (positions: RosterPosition[], name: string, except: number | null = null): boolean =>
  positions.some(
    (position) => position.id !== except && position.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );

/** A position's hours in one line: Без времени, С открытия до закрытия, or 18:00–02:00 · по дням. */
export const positionHoursLine = (hours: RosterHours): string => {
  if (hours.mode === 'venue') return t('С открытия до закрытия');

  if (hours.mode !== 'own' || hours.start_time === null || hours.end_time === null) return t('Без времени');

  const usual = `${hours.start_time}–${hours.end_time}`;

  return hours.week_hours.length === 0 ? usual : `${usual} · ${t('по дням')}`;
};

/**
 * A person as any server so far sends them. One rolled back to before
 * positions sends no position id, hours or days, and a phone already on this
 * build would fall over reading them: each is taken as not set.
 */
export const readPerson = <P extends RosterPerson>(person: P): P => ({
  ...person,
  position_id: person.position_id ?? null,
  hours: person.hours ?? INHERIT,
  pattern: person.pattern ?? NO_PATTERN,
});

/** A roster or a month as any server so far sends it: one from before positions has no venue hours or positions either. */
export const readSheet = <S extends RosterSheet>(sheet: S): S => ({
  ...sheet,
  venue_hours: sheet.venue_hours ?? [],
  positions: sheet.positions ?? [],
  people: sheet.people.map(readPerson),
});

/** The sheet with one person as the server last answered for them, added if they are new. */
export const withPerson = <S extends RosterSheet>(sheet: S, person: RosterPerson): S => ({
  ...sheet,
  people: sheet.people.some((one) => one.id === person.id)
    ? sheet.people.map((one) => (one.id === person.id ? person : one))
    : [...sheet.people, person],
});

/** The sheet with one position as saved. A rename reaches the name everybody on it carries. */
export const withPosition = <S extends RosterSheet>(sheet: S, position: RosterPosition): S => ({
  ...sheet,
  positions: sheet.positions.some((one) => one.id === position.id)
    ? sheet.positions.map((one) => (one.id === position.id ? position : one))
    : [...sheet.positions, position],
  people: sheet.people.map((person) =>
    person.position_id === position.id ? { ...person, position: position.name } : person,
  ),
});

/** The sheet once a position is deleted: its people stay, with none. */
export const withoutPosition = <S extends RosterSheet>(sheet: S, positionId: number): S => ({
  ...sheet,
  positions: sheet.positions.filter((one) => one.id !== positionId),
  people: sheet.people.map((person) =>
    person.position_id === positionId ? { ...person, position_id: null, position: null } : person,
  ),
});

/** Hours as a form holds them while they are typed: the usual pair as text, and rows of weekdays that run other hours. */
export interface HoursDraft<Mode extends string = string> {
  mode: Mode;
  start: string;
  end: string;
  rows: WeekRow[];
}

/** A form's start on some hours. Hours with none of their own open on the pair given, for somebody about to switch to own. */
export const draftOf = <Mode extends string>(
  hours: RosterHours<Mode>,
  start = '18:00',
  end = '02:00',
): HoursDraft<Mode> => ({
  mode: hours.mode,
  start: hours.start_time ?? start,
  end: hours.end_time ?? end,
  rows: toWeekRows(hours.week_hours),
});

/** What is wrong with a form's own hours, as a phrase for t(), or null. Anything but own has no times to be wrong. */
export const draftProblem = (draft: HoursDraft): string | null =>
  draft.mode === 'own' ? (hoursProblem(draft.start, draft.end) ?? weekRowsProblem(draft.rows)) : null;

/** The hours a form says, as the wire takes them. Only own mode carries times. */
export const hoursOf = <Mode extends string>(draft: HoursDraft<Mode>): RosterHours<Mode> =>
  draft.mode === 'own'
    ? {
        mode: draft.mode,
        start_time: readClock(draft.start),
        end_time: readClock(draft.end),
        week_hours: toWeekHours(draft.rows),
      }
    : { mode: draft.mode, start_time: null, end_time: null, week_hours: [] };

/** Whether anybody on the roster has usual days, which is what fill works from. */
export const anyPattern = (people: RosterPerson[]): boolean =>
  people.some((person) => person.pattern.kind !== 'none');

/** Who fill passes over, by name and in list order: nobody said which days they work. */
export const withoutPattern = (people: RosterPerson[], positions: RosterPosition[]): string[] =>
  byPosition(people, positions)
    .filter((person) => person.pattern.kind === 'none')
    .map((person) => person.name);

/** The days a rhythm or a week lands on in a month, for the month picker to light up. */
export const workingDays = (pattern: RosterPattern, at: YearMonth): Set<string> =>
  new Set(monthCells(at).filter((date): date is string => date !== null && worksOn(pattern, date)));

export const rosterLink = (base: string, slug: string): string => `${base}/r/${slug}`;

/** The two presses that end an address sitting in a group chat. */
export type LinkStep = 'renew' | 'off';

/** One press arms, a second on the same button goes through. The other button takes the arming over, so a stray tap on it is not half of anything. */
export const pressLink = (
  armed: LinkStep | null,
  pressed: LinkStep,
): { armed: LinkStep | null; go: boolean } =>
  armed === pressed ? { armed: null, go: true } : { armed: pressed, go: false };

/** A batch naming somebody who has gone is refused whole, and would be refused the same way for good. */
export const goneFromServer = (caught: unknown): boolean =>
  (caught as { status?: number } | null)?.status === 404;

/**
 * What went wrong, as a phrase for t(). The server words these in English with
 * no code behind them, so the phone says them itself.
 */
export const rosterProblem = (caught: unknown, otherwise: string): string => {
  const status = (caught as { status?: number } | null)?.status;

  if (status === undefined || status >= 500) return 'Не дотянулись до сервера.';
  if (status === 404) return 'Этого уже нет: график изменили на другом устройстве.';
  if (status === 429) return 'Слишком часто, подождите минуту.';

  return otherwise;
};
