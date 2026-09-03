/** A calendar month. Deliberately not a Date: a month has no instant. */
export interface YearMonth {
  year: number;
  /** 1-12, not the 0-based month of Date. */
  month: number;
}

export interface CalendarDay {
  /** 'YYYY-MM-DD' — stable, comparable, and usable as a Map key. */
  key: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

/** Monday-first, matching how shift rotas are usually written. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LABELS_SUNDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function currentMonth(): YearMonth {
  const now = new Date();

  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  // Date normalises overflow for us: month 13 rolls into January of year + 1.
  const shifted = new Date(year, month - 1 + delta, 1);

  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 };
}

/* These are plain functions, so they cannot reach the settings the way a
   component can; the caller passes the language it already holds. English is the
   default because it is the app's own fallback language, and because the tests
   call these directly. */

/**
 * A locale string with its first letter lifted, and only its first.
 *
 * `text-transform: capitalize` lifts every word, which in Russian and
 * Ukrainian turns «сентябрь 2026 г.» into «Сентябрь 2026 Г.» and «вторник,
 * 1 сентября» into «Вторник, 1 Сентября». A sentence starts once.
 */
export function sentenceCase(text: string, locale = 'en'): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * «Сентябрь 2026 г.» — capitalised here, not by CSS.
 *
 * Russian and Ukrainian name a month in lower case and abbreviate the year to
 * «г.», and every heading in the app used `text-transform: capitalize` to
 * lift the first letter. That rule lifts every word: eleven headings across
 * the app read «Сентябрь 2026 Г.», with a capital on an abbreviation that
 * has no business carrying one. A sentence starts once.
 */
export function monthLabel({ year, month }: YearMonth, locale = 'en'): string {
  const said = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));

  return sentenceCase(said, locale);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function formatDayLabel(key: string, locale = 'en'): string {
  return sentenceCase(
    new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(fromKey(key)),
    locale,
  );
}

/**
 * The same day, short: «вт, 1 сент.».
 *
 * The long form runs to a hundred and fifty pixels, and in a panel heading
 * beside a sum it was being cut to «пусто · вторник, 1 сентя…». A date that
 * ends mid-word is worse than an abbreviated one.
 */
export function formatDayLabelShort(key: string, locale = 'en'): string {
  return sentenceCase(
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(fromKey(key)),
    locale,
  );
}

/**
 * A month's short name in the reader's language, from its number.
 *
 * The seasonality chart carried its own list of «Jan, Feb, Mar» and passed
 * them through the dictionary, which had never been given translations for
 * them — so a year's shape was labelled in English under a Russian heading.
 * The platform knows the twelve names in every language it has.
 */
export function monthShort(month: number, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2000, month - 1, 1));
}

/**
 * One date as a person says it: «15 сент. 2026», «3 марта» when it is this year.
 *
 * The database's own spelling reached the screen in eleven places — a payout
 * received on «2026-08-31», a medical book expiring on «2027-04-02», the
 * period line on the card people post. Same rule as the range below it: the
 * year appears only when it is not the current one.
 */
export function formatDate(key: string, locale = 'en'): string {
  const date = fromKey(key);
  const dated = date.getFullYear() !== new Date().getFullYear();

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(dated ? { year: 'numeric' } : {}),
  }).format(date);
}

/**
 * A pay period as a person says it: «1 — 15 марта», «16 марта — 2 апреля».
 *
 * The payout list printed «2026-03-01 — 2026-03-15», which is how a database
 * says it. The year appears only when the period is not in this one, because
 * on a screen about money owed this month it is four characters of noise.
 */
export function formatPeriod(from: string, to: string, locale = 'en'): string {
  const start = fromKey(from);
  const end = fromKey(to);
  const thisYear = new Date().getFullYear();
  const dated = start.getFullYear() !== thisYear || end.getFullYear() !== thisYear;

  const day = new Intl.DateTimeFormat(locale, { day: 'numeric' });
  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const whole = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  if (dated) return `${whole.format(start)} — ${whole.format(end)}`;

  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();

  return `${(sameMonth ? day : dayMonth).format(start)} — ${dayMonth.format(end)}`;
}

/**
 * Always six weeks, so the grid keeps its height when the month changes and
 * the layout below it does not jump.
 */
export function buildMonthGrid(
  { year, month }: YearMonth,
  mondayFirst = true,
): CalendarDay[][] {
  const firstOfMonth = new Date(year, month - 1, 1);

  // getDay() is Sunday-based; shift it when the week starts on Monday.
  const offset = mondayFirst
    ? (firstOfMonth.getDay() + 6) % 7
    : firstOfMonth.getDay();
  const today = todayKey();

  const weeks: CalendarDay[][] = [];

  for (let week = 0; week < 6; week++) {
    const days: CalendarDay[] = [];

    for (let weekday = 0; weekday < 7; weekday++) {
      // Day-of-month arithmetic rolls over month and year boundaries by itself.
      const date = new Date(year, month - 1, 1 - offset + week * 7 + weekday);
      const key = toKey(date);

      days.push({
        key,
        dayOfMonth: date.getDate(),
        inCurrentMonth: date.getMonth() === month - 1,
        isToday: key === today,
      });
    }

    weeks.push(days);
  }

  return weeks;
}

/**
 * Built from local components on purpose. toISOString() converts to UTC first,
 * which turns the 1st into the 31st for anyone east of Greenwich.
 */
function toKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Parsed field by field for the same reason: new Date('2026-03-14') is UTC. */
export function fromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);

  return new Date(year, month - 1, day);
}

export function keyOf(date: Date): string {
  return toKey(date);
}

/** Every key from one end to the other, inclusive, in ascending order. */
export function keysBetween(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const cursor = fromKey(from);
  const last = fromKey(to);
  const keys: string[] = [];

  while (cursor <= last) {
    keys.push(toKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

/**
 * A rotating rota: `on` days worked, then `off` days free, repeating from the
 * start date for the given number of days.
 */
export function rotationKeys(start: string, on: number, off: number, span: number): string[] {
  const cycle = on + off;

  if (on < 1 || off < 0 || cycle < 1) return [];

  const cursor = fromKey(start);
  const keys: string[] = [];

  for (let index = 0; index < span; index++) {
    if (index % cycle < on) keys.push(toKey(cursor));

    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

/** First and last day of the month a key falls in. */
export function monthBounds(key: string): { from: string; to: string } {
  const date = fromKey(key);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return { from: toKey(first), to: toKey(last) };
}

/** Monday-to-Sunday week containing the key. */
export function weekBounds(key: string): { from: string; to: string } {
  const date = fromKey(key);
  const offset = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

  return { from: toKey(monday), to: toKey(sunday) };
}

/** Steps a key by whole days, letting Date roll month and year boundaries. */
export function shiftDays(key: string, days: number): string {
  const date = fromKey(key);

  date.setDate(date.getDate() + days);

  return toKey(date);
}

/** The single week containing a key, as one row of the same cell shape. */
export function buildWeekGrid(key: string, mondayFirst = true): CalendarDay[][] {
  const date = fromKey(key);
  const offset = mondayFirst ? (date.getDay() + 6) % 7 : date.getDay();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  const today = todayKey();
  const month = date.getMonth();

  const days: CalendarDay[] = [];

  for (let index = 0; index < 7; index++) {
    const cell = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const cellKey = toKey(cell);

    days.push({
      key: cellKey,
      dayOfMonth: cell.getDate(),
      inCurrentMonth: cell.getMonth() === month,
      isToday: cellKey === today,
    });
  }

  return [days];
}

/** Twelve compact months, for scanning a year at a glance. */
export function buildYearGrid(year: number, mondayFirst = true, locale = 'en'): {
  month: number;
  label: string;
  weeks: CalendarDay[][];
}[] {
  const months = new Intl.DateTimeFormat(locale, { month: 'short' });

  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    // Capitalised here rather than by CSS: the year cards lost their capital
    // when the month name stopped being wrapped in a `capitalize` class.
    label: sentenceCase(months.format(new Date(year, index, 1)), locale),
    weeks: buildMonthGrid({ year, month: index + 1 }, mondayFirst),
  }));
}
