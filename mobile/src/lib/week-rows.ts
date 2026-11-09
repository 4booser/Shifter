import { WEEK_NAMES } from './calendar';
import { isClock, tidyClock } from './shift-window';
import { WeekHours } from './types';

/**
 * The template form's weekday hours: rows of days sharing one pair of times,
 * where the wire has one flat entry per weekday. Rows are how a person thinks
 * about it («пятница до 23, выходные с 13»); the flat list is what is stored.
 */
export interface WeekRow {
  days: number[];
  start: string;
  end: string;
}

/** The stored list as rows, one for each distinct pair of times. */
export const toWeekRows = (entries: WeekHours[]): WeekRow[] => {
  const rows: WeekRow[] = [];

  for (const entry of [...entries].sort((one, two) => one.weekday - two.weekday)) {
    const start = entry.start_time.slice(0, 5);
    const end = entry.end_time.slice(0, 5);
    const row = rows.find((known) => known.start === start && known.end === end);

    if (row === undefined) rows.push({ days: [entry.weekday], start, end });
    else row.days.push(entry.weekday);
  }

  return rows;
};

/** The rows as the flat list the server takes. A row with no days says nothing. */
export const toWeekHours = (rows: WeekRow[]): WeekHours[] =>
  rows
    .flatMap((row) =>
      row.days.map((weekday) => ({
        weekday,
        start_time: tidyClock(row.start.trim()),
        end_time: tidyClock(row.end.trim()),
      })),
    )
    .sort((one, two) => one.weekday - two.weekday);

/** Taps a weekday in one row. A weekday lives in one row, so taking it here takes it from any other. */
export const toggleWeekday = (rows: WeekRow[], at: number, weekday: number): WeekRow[] => {
  const taking = !rows[at].days.includes(weekday);

  return rows.map((row, index) => {
    const others = row.days.filter((day) => day !== weekday);

    return {
      ...row,
      days:
        index === at && taking ? [...others, weekday].sort((one, two) => one - two) : others,
    };
  });
};

/** What is wrong with the rows, as a phrase for t(), or null. Only rows with days count. */
export const weekRowsProblem = (rows: WeekRow[]): string | null => {
  for (const row of rows) {
    if (row.days.length === 0) continue;

    if (!isClock(row.start.trim()) || !isClock(row.end.trim())) {
      return 'Часы по дням: время пишется как 18:00.';
    }

    if (tidyClock(row.start.trim()) === tidyClock(row.end.trim())) {
      return 'Часы по дням: начало и конец должны отличаться.';
    }
  }

  return null;
};

/** A line for the list of shifts: "Пт 11:00–23:00 · Сб, Вс 13:00–23:00". */
export const weekRowsLine = (entries: WeekHours[], say: (phrase: string) => string): string =>
  toWeekRows(entries)
    .map(
      (row) =>
        `${row.days.map((day) => say(WEEK_NAMES[day - 1])).join(', ')} ${row.start}–${row.end}`,
    )
    .join(' · ');

/** A template's hours where there is one line for them: the usual ones, marked where some days run others. */
export const hoursLabel = (
  template: { start_time: string; end_time: string; week_hours?: WeekHours[] },
  say: (phrase: string) => string,
): string => {
  const usual = `${template.start_time.slice(0, 5)}–${template.end_time.slice(0, 5)}`;

  return (template.week_hours ?? []).length === 0 ? usual : `${usual} · ${say('по дням')}`;
};
