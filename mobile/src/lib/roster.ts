import { addMonths, covers, monthBounds, monthsBetween, nextDay, pad, YearMonth } from './calendar';
import { plural, t } from './i18n';
import { isClock, tidyClock } from './shift-window';

/**
 * A roster: one person writing a month for a crew who never registered. It
 * stands apart from days, shifts and teams, so nothing here reaches for them,
 * and nothing here is native, so all of it runs under the test runner.
 */

export interface RosterPerson {
  id: number;
  name: string;
  position: string | null;
  colour: string;
}

export interface Roster {
  id: number;
  title: string;
  /** Null while the link is off. */
  share_slug: string | null;
  people: RosterPerson[];
}

export interface RosterShift {
  person_id: number;
  date: string;
  start_time: string;
  end_time: string;
}

export interface RosterMonth {
  id: number;
  title: string;
  share_slug: string | null;
  /** "2026-11". */
  month: string;
  people: RosterPerson[];
  shifts: RosterShift[];
}

export interface RosterRepeated {
  added: number;
  kept: number;
}

export interface HourPair {
  start_time: string;
  end_time: string;
}

/** One cell as it should end up. No hours empties it. */
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

/** The hour pairs already used this month, the commonest first: the second week is mostly the first one again. */
export const hourPairs = (shifts: RosterShift[]): HourPair[] => {
  const counted = new Map<string, { pair: HourPair; count: number }>();

  for (const { start_time, end_time } of shifts) {
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

export interface RosterDay {
  date: string;
  /** Who works it, earliest start first, as the web and the link have it. */
  working: { person: RosterPerson; shift: RosterShift }[];
  /** Who does not. The day has to offer them, or an empty day could never be filled. */
  free: RosterPerson[];
}

export interface DayList {
  /** Today and what is left of the month, or all of it where today is not in it. */
  coming: RosterDay[];
  /** The days of this month already behind, in date order. */
  past: RosterDay[];
}

/** The month by day, with today on top. Empty days stay in: this is where they get filled. */
export const dayList = (
  at: YearMonth,
  people: RosterPerson[],
  shifts: RosterShift[],
  today: string,
): DayList => {
  const { from, to } = monthBounds(at);
  const held = new Map(shifts.map((shift) => [cellKey(shift.person_id, shift.date), shift]));
  const days: RosterDay[] = [];

  for (let date = from; date <= to; date = nextDay(date)) {
    const day: RosterDay = { date, working: [], free: [] };

    for (const person of people) {
      const shift = held.get(cellKey(person.id, date));

      if (shift === undefined) day.free.push(person);
      else day.working.push({ person, shift });
    }

    day.working.sort((one, two) => one.shift.start_time.localeCompare(two.shift.start_time));
    days.push(day);
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
