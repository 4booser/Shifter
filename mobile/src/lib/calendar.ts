import { t } from '@/lib/i18n';

/** Date helpers shared by the mobile screens. Keys are 'YYYY-MM-DD'. */

export const pad = (value: number) => `${value}`.padStart(2, '0');

export const todayKey = (): string => {
  const now = new Date();

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export interface YearMonth {
  year: number;
  month: number;
}

export const currentMonth = (): YearMonth => {
  const now = new Date();

  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

export const addMonths = ({ year, month }: YearMonth, delta: number): YearMonth => {
  const index = year * 12 + (month - 1) + delta;

  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

export const monthBounds = ({ year, month }: YearMonth) => ({
  from: `${year}-${pad(month)}-01`,
  to: `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`,
});

/** Monday-first cell list for the grid, padded with nulls to full weeks. */
export const monthCells = ({ year, month }: YearMonth): (string | null)[] => {
  const days = new Date(year, month, 0).getDate();
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells: (string | null)[] = new Array<null>(lead).fill(null);

  for (let day = 1; day <= days; day++) cells.push(`${year}-${pad(month)}-${pad(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
};

export const monthLabel = ({ year, month }: YearMonth): string => {
  return `${t(MONTHS[month - 1])} ${year}`;
};

/**
 * Month names by hand rather than through Intl.
 *
 * toLocaleDateString was pinned to 'ru', so every date in the app stayed
 * Russian whatever language somebody chose — and unpinning it would have made
 * the app's dates depend on which locales this particular phone happens to
 * carry. A table is a table in both languages.
 */
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** A day key as people say it out loud: "28 авг". */
export const shortDate = (key: string): string => {
  const [, month, day] = key.split('-');

  return `${Number(day)} ${t(MONTHS_SHORT[Number(month) - 1])}`;
};

/**
 * The same, with the weekday in front. For a shift the weekday is the whole
 * question — "which evening am I giving up" — and a bare number does not
 * answer it.
 */
export const dayLabel = (key: string): string => {
  const date = new Date(`${key}T00:00:00`);

  return `${t(WEEKDAYS_SHORT[date.getDay()])}, ${shortDate(key)}`;
};

export interface GridCell {
  key: string;
  /** False for the neighbouring month's days that fill the corners. */
  inMonth: boolean;
}

/**
 * Six full weeks, Monday first, with the neighbouring months' days in the
 * gaps rather than blanks.
 *
 * Blanks cost twice: the corner of the month reads as broken, and the grid
 * changes height between a five-week month and a six-week one — which on a
 * pager means the page under your thumb grows while you swipe it.
 */
export const monthGrid = ({ year, month }: YearMonth): GridCell[] => {
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const start = new Date(year, month - 1, 1 - lead);
  const cells: GridCell[] = [];

  for (let index = 0; index < 42; index++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);

    cells.push({
      key: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`,
      inMonth: day.getMonth() === month - 1 && day.getFullYear() === year,
    });
  }

  return cells;
};

/** The range the grid actually shows, which overhangs the month at both ends. */
export const gridBounds = (at: YearMonth) => {
  const cells = monthGrid(at);

  return { from: cells[0].key, to: cells[41].key };
};

export const nextDay = (key: string): string => {
  const date = new Date(`${key}T00:00:00`);

  date.setDate(date.getDate() + 1);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** True where the key falls inside an inclusive range. Keys sort as dates. */
export const covers = (from: string, to: string, key: string) => key >= from && key <= to;

/**
 * Day keys collapsed into contiguous stretches.
 *
 * Painting a fortnight of leave should leave one event on the server, not
 * fourteen — the calendar says "Отпуск, 14 дней" instead of repeating itself,
 * and deleting it takes one tap rather than fourteen.
 */
export const runsOf = (keys: string[]): { from: string; to: string }[] => {
  const sorted = [...keys].sort();
  const runs: { from: string; to: string }[] = [];

  for (const key of sorted) {
    const last = runs[runs.length - 1];

    if (last !== undefined && nextDay(last.to) === key) last.to = key;
    else runs.push({ from: key, to: key });
  }

  return runs;
};

/** How many months from `a` to `b`, signed. */
export const monthsBetween = (a: YearMonth, b: YearMonth) =>
  (b.year * 12 + b.month) - (a.year * 12 + a.month);

/** "Август" on its own, for a header that carries the year separately. */
export const monthOnly = ({ year, month }: YearMonth): string => {
  return t(MONTHS[month - 1]);
};

/** Monday first, the way a rota is read in this part of the world. */
export const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** Which of them a day falls on, 0 = Monday. */
export const weekdayOf = (key: string): number =>
  (new Date(`${key}T00:00:00`).getDay() + 6) % 7;

/**
 * Every day of the month that shares a weekday with one already chosen.
 *
 * "Каждый вторник и четверг" is the commonest shape a rota takes here, and
 * painting it by hand is eight separate touches spread across a month — the
 * kind of work people put off until the month is half over.
 */
export const sameWeekdaysIn = (at: YearMonth, chosen: Iterable<string>): string[] => {
  const wanted = new Set<number>();

  for (const key of chosen) wanted.add(weekdayOf(key));

  if (wanted.size === 0) return [];

  return monthGrid(at)
    .filter((cell) => cell.inMonth && wanted.has(weekdayOf(cell.key)))
    .map((cell) => cell.key);
};

export interface Range {
  from: string;
  to: string;
}

/** Days in a month, so a comparison never asks for the 31st of February. */
export const daysIn = ({ year, month }: YearMonth): number => new Date(year, month, 0).getDate();

/**
 * The range a period should be compared against.
 *
 * Cut to the same length where the period being shown has not finished yet.
 * Nineteen days of August against the whole of July is not a comparison, it is
 * a way of telling somebody their month is going badly when it is going fine —
 * and this app is read by people deciding whether to ask for a raise.
 */
export const previousRange = (
  span: 'month' | 'year',
  at: YearMonth,
  today: string,
): { range: Range; partial: boolean } => {
  if (span === 'month') {
    const before = addMonths(at, -1);
    const running = today.startsWith(`${at.year}-${pad(at.month)}`);

    if (!running) return { range: monthBounds(before), partial: false };

    const upTo = Math.min(Number(today.slice(8)), daysIn(before));

    return {
      range: { from: `${before.year}-${pad(before.month)}-01`, to: `${before.year}-${pad(before.month)}-${pad(upTo)}` },
      partial: true,
    };
  }

  const year = at.year - 1;
  const running = today.startsWith(`${at.year}-`);

  if (!running) return { range: { from: `${year}-01-01`, to: `${year}-12-31` }, partial: false };

  // The same date a year back, and 29 February becomes 28 where there was no
  // leap day to compare against.
  const month = Number(today.slice(5, 7));
  const day = Math.min(Number(today.slice(8)), daysIn({ year, month }));

  return { range: { from: `${year}-01-01`, to: `${year}-${pad(month)}-${pad(day)}` }, partial: true };
};

/** How much bigger `now` is than `before`, as a percentage. Null where there is nothing to divide by. */
export const changeOf = (now: number, before: number): number | null =>
  before <= 0 ? null : Math.round(((now - before) / before) * 100);
