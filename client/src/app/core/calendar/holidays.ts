/**
 * Public holidays, worked out here rather than fetched. The application is
 * offline-first — a month opened on a train has to render the same as one
 * opened at a desk — and a calendar that loses its holidays without a network
 * is a calendar nobody trusts.
 *
 * The cost of that choice is that moving feasts have to be computed. Only the
 * Easter-relative ones actually move, and they all hang off one calculation,
 * so it is a small amount of arithmetic rather than a table of dates that
 * silently runs out in a few years.
 */

export interface Holiday {
  /** 'YYYY-MM-DD'. */
  date: string;
  name: string;
  /** False for observances people work through: still worth showing, quietly. */
  publicHoliday: boolean;
}

export interface HolidayCountry {
  code: string;
  label: string;
}

/**
 * Deliberately short. Each entry is a set of rules someone has to keep right,
 * and a list of forty countries nobody checks is worse than a list of six that
 * are correct.
 */
export const HOLIDAY_COUNTRIES: HolidayCountry[] = [
  { code: '', label: 'None' },
  { code: 'UA', label: 'Ukraine' },
  { code: 'PL', label: 'Poland' },
  { code: 'DE', label: 'Germany' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
];

type Rule = (year: number) => Holiday | null;

const pad = (value: number): string => String(value).padStart(2, '0');

const key = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`;

/** Days since the epoch, for arithmetic that has to cross month boundaries. */
const shift = (date: string, days: number): string => {
  const parsed = new Date(`${date}T00:00:00Z`);

  parsed.setUTCDate(parsed.getUTCDate() + days);

  return parsed.toISOString().slice(0, 10);
};

const fixed = (month: number, day: number, name: string, publicHoliday = true): Rule =>
  (year) => ({ date: key(year, month, day), name, publicHoliday });

/**
 * The nth weekday of a month — "third Monday in January". A negative index
 * counts back from the end, which is how "last Monday in May" is written.
 */
const nth = (
  month: number,
  weekday: number,
  index: number,
  name: string,
  publicHoliday = true,
): Rule =>
  (year) => {
    if (index > 0) {
      const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
      const offset = (weekday - first + 7) % 7;

      return {
        date: key(year, month, 1 + offset + (index - 1) * 7),
        name,
        publicHoliday,
      };
    }

    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const last = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
    const back = (last - weekday + 7) % 7;

    return { date: key(year, month, lastDay - back), name, publicHoliday };
  };

/**
 * Gauss's algorithm for Gregorian Easter. Everything that moves in the Western
 * calendars below is expressed as a number of days from this one date.
 */
const gregorianEaster = (year: number): string => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return key(year, month, day);
};

/**
 * Julian Easter, mapped onto the Gregorian calendar — the Orthodox date, and
 * the one Ukrainian holidays hang off. The thirteen-day offset holds for the
 * whole of the twenty-first century, which is as far as this needs to be right.
 */
const julianEaster = (year: number): string => {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;

  return shift(key(year, month, day), 13);
};

const fromEaster = (
  easter: (year: number) => string,
  offset: number,
  name: string,
  publicHoliday = true,
): Rule =>
  (year) => ({ date: shift(easter(year), offset), name, publicHoliday });

/**
 * A holiday landing on a weekend moves — but not the same way everywhere, and
 * the difference is not cosmetic. The United States takes a Saturday holiday
 * on the Friday before; the United Kingdom gives a substitute day after, so
 * the same date can be a Monday there and a Friday in the States.
 */
const weekendShift = (date: string, saturdayGoesBack: boolean): string => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

  if (weekday === 6) return shift(date, saturdayGoesBack ? -1 : 2);
  if (weekday === 0) return shift(date, 1);

  return date;
};

/** Substitute day after the weekend: the British and Canadian rule. */
const observed = (rule: Rule): Rule =>
  (year) => {
    const holiday = rule(year);

    return holiday === null
      ? null
      : { ...holiday, date: weekendShift(holiday.date, false) };
  };

/** Saturday is taken on the Friday before: the American rule. */
const observedUs = (rule: Rule): Rule =>
  (year) => {
    const holiday = rule(year);

    return holiday === null
      ? null
      : { ...holiday, date: weekendShift(holiday.date, true) };
  };

const RULES: Record<string, Rule[]> = {
  UA: [
    fixed(1, 1, 'New Year'),
    fixed(12, 25, 'Christmas'),
    fixed(3, 8, "International Women's Day"),
    fixed(5, 1, 'Labour Day'),
    fixed(5, 8, 'Day of Remembrance and Victory'),
    fixed(6, 28, 'Constitution Day'),
    fixed(7, 15, 'Ukrainian Statehood Day'),
    fixed(8, 24, 'Independence Day'),
    fixed(10, 1, 'Defenders Day'),
    fromEaster(julianEaster, 0, 'Easter'),
    fromEaster(julianEaster, 49, 'Trinity Sunday'),
  ],
  PL: [
    fixed(1, 1, 'New Year'),
    fixed(1, 6, 'Epiphany'),
    fromEaster(gregorianEaster, 0, 'Easter Sunday'),
    fromEaster(gregorianEaster, 1, 'Easter Monday'),
    fixed(5, 1, 'Labour Day'),
    fixed(5, 3, 'Constitution Day'),
    fromEaster(gregorianEaster, 49, 'Pentecost'),
    fromEaster(gregorianEaster, 60, 'Corpus Christi'),
    fixed(8, 15, 'Assumption'),
    fixed(11, 1, "All Saints' Day"),
    fixed(11, 11, 'Independence Day'),
    fixed(12, 25, 'Christmas Day'),
    fixed(12, 26, 'Second Day of Christmas'),
  ],
  DE: [
    fixed(1, 1, 'New Year'),
    fromEaster(gregorianEaster, -2, 'Good Friday'),
    fromEaster(gregorianEaster, 1, 'Easter Monday'),
    fixed(5, 1, 'Labour Day'),
    fromEaster(gregorianEaster, 39, 'Ascension Day'),
    fromEaster(gregorianEaster, 50, 'Whit Monday'),
    fixed(10, 3, 'German Unity Day'),
    fixed(12, 25, 'Christmas Day'),
    fixed(12, 26, 'Boxing Day'),
  ],
  GB: [
    observed(fixed(1, 1, 'New Year')),
    fromEaster(gregorianEaster, -2, 'Good Friday'),
    fromEaster(gregorianEaster, 1, 'Easter Monday'),
    nth(5, 1, 1, 'Early May Bank Holiday'),
    nth(5, 1, -1, 'Spring Bank Holiday'),
    nth(8, 1, -1, 'Summer Bank Holiday'),
    observed(fixed(12, 25, 'Christmas Day')),
    observed(fixed(12, 26, 'Boxing Day')),
  ],
  US: [
    observedUs(fixed(1, 1, 'New Year')),
    nth(1, 1, 3, 'Martin Luther King Jr. Day'),
    nth(2, 1, 3, "Presidents' Day"),
    nth(5, 1, -1, 'Memorial Day'),
    observedUs(fixed(6, 19, 'Juneteenth')),
    observedUs(fixed(7, 4, 'Independence Day')),
    nth(9, 1, 1, 'Labor Day'),
    nth(11, 4, 4, 'Thanksgiving'),
    observedUs(fixed(11, 11, 'Veterans Day')),
    observedUs(fixed(12, 25, 'Christmas Day')),
  ],
  CA: [
    observed(fixed(1, 1, 'New Year')),
    fromEaster(gregorianEaster, -2, 'Good Friday'),
    nth(5, 1, -1, 'Victoria Day'),
    observed(fixed(7, 1, 'Canada Day')),
    nth(9, 1, 1, 'Labour Day'),
    observed(fixed(9, 30, 'Truth and Reconciliation Day')),
    nth(10, 1, 2, 'Thanksgiving'),
    observed(fixed(11, 11, 'Remembrance Day')),
    observed(fixed(12, 25, 'Christmas Day')),
    observed(fixed(12, 26, 'Boxing Day')),
  ],
};

/**
 * Every holiday of one year, keyed by date. A year at a time because that is
 * the unit the rules are written in; callers asking about a month take the
 * years it touches and merge them, which the cache below makes cheap.
 */
const cache = new Map<string, ReadonlyMap<string, Holiday>>();

export function holidaysForYear(country: string, year: number): ReadonlyMap<string, Holiday> {
  if (country === '') return new Map();

  const cacheKey = `${country}:${year}`;
  const cached = cache.get(cacheKey);

  if (cached !== undefined) return cached;

  const rules = RULES[country] ?? [];
  const found = new Map<string, Holiday>();

  for (const rule of rules) {
    const holiday = rule(year);

    // A country whose rules collide on one date — Easter falling on Labour
    // Day, say — keeps the first, rather than showing the cell twice.
    if (holiday !== null && !found.has(holiday.date)) found.set(holiday.date, holiday);
  }

  cache.set(cacheKey, found);

  return found;
}

/** Holidays across a span of dates, which may cross a new year. */
export function holidaysInRange(
  country: string,
  from: string,
  to: string,
): ReadonlyMap<string, Holiday> {
  if (country === '') return new Map();

  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  const merged = new Map<string, Holiday>();

  for (let year = firstYear; year <= lastYear; year += 1) {
    for (const [date, holiday] of holidaysForYear(country, year)) {
      if (date >= from && date <= to) merged.set(date, holiday);
    }
  }

  return merged;
}
