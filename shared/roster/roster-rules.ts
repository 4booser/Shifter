/*
 * A roster's rules: whose default time is what, who works which day, when the
 * venue is open, and the order people are listed in. One copy, read by the
 * web and by the phone.
 *
 * The server and both clients carry this same rule, held to one set of cases in
 * shared/roster/roster-rules.cases.json: a change here is a change in both copies.
 *
 * Dates are yyyy-MM-dd and are counted as calendar days in UTC, never as local
 * instants: a clock change would otherwise stretch a day or shrink it.
 */

/** One open weekday, ISO: Monday is 1, Sunday is 7. */
export interface WeekHoursLike {
  weekday: number;
  /** "HH:mm". */
  start_time: string;
  end_time: string;
}

/** A position's or a person's hours. Times are set only in own mode. */
export interface HoursLike {
  /** none, own or venue for a position; inherit or own for a person. */
  mode: string;
  start_time: string | null;
  end_time: string | null;
  /** Weekdays that run other hours than the usual pair. */
  week_hours: WeekHoursLike[];
}

/** A person's usual days: some weekdays, or a rhythm of days on and days off. */
export interface PatternLike {
  /** none, weekdays or cycle. */
  kind: string;
  weekdays: number[];
  on: number | null;
  off: number | null;
  /** yyyy-MM-dd, a first working day of the rhythm. */
  from: string | null;
}

export interface PositionLike {
  id: number;
  name: string;
  hours: HoursLike;
}

export interface PersonLike {
  id: number;
  /** A position since deleted counts as none. */
  position_id: number | null;
  hours: HoursLike;
}

/** Null hours are a day with no set time. */
export interface ShiftLike {
  person_id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
}

/** Everything that decides people's default times, as it stands before or after a save. */
export interface Defaults {
  /** Open weekdays only; empty is "not set". */
  venue_hours: WeekHoursLike[];
  positions: PositionLike[];
  people: PersonLike[];
}

/** "HH:mm" both; an end at or before the start runs past midnight. */
export interface HoursPair {
  start_time: string;
  end_time: string;
}

const DAY = 86_400_000;

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

const utcOf = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number);

  return Date.UTC(year, month - 1, day);
};

/** ISO, the numbering week hours are written in. Read in UTC, so a date has its own weekday wherever the device is. */
export const isoWeekday = (date: string): number => new Date(utcOf(date)).getUTCDay() || 7;

/** A week's own entry for the weekday where it has one, the usual pair otherwise. Not hoursOn: both clients already have one, for templates. */
export const hoursOnWeek = (
  start: string,
  end: string,
  week: WeekHoursLike[],
  weekday: number,
): HoursPair => {
  const own = week.find((entry) => entry.weekday === weekday);

  return own === undefined
    ? { start_time: start, end_time: end }
    : { start_time: own.start_time, end_time: own.end_time };
};

/** Own hours on a weekday. Own mode always holds both times, and half a pair gives no time rather than half a shift. */
const ownOn = (hours: HoursLike, weekday: number): HoursPair | null =>
  hours.start_time === null || hours.end_time === null
    ? null
    : hoursOnWeek(hours.start_time, hours.end_time, hours.week_hours, weekday);

/** The venue's hours on a weekday, or null when it is closed then or has no hours set. */
const venueOn = (venueHours: WeekHoursLike[], weekday: number): HoursPair | null => {
  const open = venueHours.find((entry) => entry.weekday === weekday);

  return open === undefined ? null : { start_time: open.start_time, end_time: open.end_time };
};

/** Whether the venue opens on a date. With no hours set no day is closed. */
export const openOn = (venueHours: WeekHoursLike[], date: string): boolean =>
  venueHours.length === 0 || venueHours.some((entry) => entry.weekday === isoWeekday(date));

/**
 * A person's default time on a weekday, or null for no set time. Their own
 * hours win over everything, a closed day too; then the position's own; a
 * position with no set time stops there; anybody else takes the venue's hours
 * on a day it is open. The weekday alone decides it, which is what lets a save
 * move the shifts at the old time by person and weekday.
 */
export const defaultOnWeekday = (
  person: Pick<PersonLike, 'position_id' | 'hours'>,
  positions: PositionLike[],
  venueHours: WeekHoursLike[],
  weekday: number,
): HoursPair | null => {
  if (person.hours.mode === 'own') return ownOn(person.hours, weekday);

  const position =
    person.position_id === null
      ? undefined
      : positions.find((one) => one.id === person.position_id);

  if (position !== undefined) {
    if (position.hours.mode === 'own') return ownOn(position.hours, weekday);
    // No set time is an answer, not a gap for the venue to fill.
    if (position.hours.mode === 'none') return null;
  }

  return venueOn(venueHours, weekday);
};

/** A person's default time on a date. */
export const defaultHours = (
  person: Pick<PersonLike, 'position_id' | 'hours'>,
  positions: PositionLike[],
  venueHours: WeekHoursLike[],
  date: string,
): HoursPair | null => defaultOnWeekday(person, positions, venueHours, isoWeekday(date));

/** Whether anything on the roster gives anybody a time, which is when «Как обычно» starts out chosen. */
export const hasUsualTime = (
  people: Pick<PersonLike, 'position_id' | 'hours'>[],
  positions: PositionLike[],
  venueHours: WeekHoursLike[],
): boolean =>
  people.some((person) =>
    WEEKDAYS.some((weekday) => defaultOnWeekday(person, positions, venueHours, weekday) !== null),
  );

/** Whether a person's usual days take in a date. A rhythm runs both ways from its first day, so any working day of it can anchor it. */
export const worksOn = (pattern: PatternLike, date: string): boolean => {
  if (pattern.kind === 'weekdays') return pattern.weekdays.includes(isoWeekday(date));

  if (pattern.kind !== 'cycle' || pattern.on === null || pattern.off === null || pattern.from === null) {
    return false;
  }

  const length = pattern.on + pattern.off;
  const day = Math.round((utcOf(date) - utcOf(pattern.from)) / DAY);

  return ((day % length) + length) % length < pattern.on;
};

const WEEKDAY_NAMES = {
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  uk: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

/** The venue is closed, never «выходной»: that word is a person's day off. */
const CLOSED = { ru: 'закрыто', uk: 'зачинено', en: 'closed' };

/** The venue's week in one line, Пн–Чт 12:00–00:00 · Пт–Сб 12:00–02:00 · Вс закрыто: neighbouring days with the same hours run together, Monday to Sunday with no wrap. Null when no hours are set. */
export const venueLine = (venueHours: WeekHoursLike[], lang: 'ru' | 'uk' | 'en'): string | null => {
  if (venueHours.length === 0) return null;

  const groups: { first: number; last: number; says: string }[] = [];

  for (const weekday of WEEKDAYS) {
    const open = venueOn(venueHours, weekday);
    const says = open === null ? CLOSED[lang] : `${open.start_time}–${open.end_time}`;
    const previous = groups[groups.length - 1];

    if (previous !== undefined && previous.says === says) previous.last = weekday;
    else groups.push({ first: weekday, last: weekday, says });
  }

  const name = (weekday: number): string => WEEKDAY_NAMES[lang][weekday - 1];

  return groups
    .map(({ first, last, says }) =>
      `${first === last ? name(first) : `${name(first)}–${name(last)}`} ${says}`,
    )
    .join(' · ');
};

/** Positions in id order, and where a person's group stands among them: no position, or one since deleted, comes after them all. */
const ranking = <Q extends Pick<PositionLike, 'id'>>(positions: Q[]) => {
  const ordered = [...positions].sort((one, two) => one.id - two.id);
  const places = new Map(ordered.map((position, at) => [position.id, at]));

  const rank = (person: Pick<PersonLike, 'position_id'>): number =>
    (person.position_id === null ? undefined : places.get(person.position_id)) ?? ordered.length;

  return { ordered, rank };
};

/** People in the order they are listed everywhere: by position, positions in id order, then those with none, each group by id. */
export const byPosition = <P extends Pick<PersonLike, 'id' | 'position_id'>>(
  people: P[],
  positions: Pick<PositionLike, 'id'>[],
): P[] => {
  const { rank } = ranking(positions);

  return [...people].sort((one, two) => rank(one) - rank(two) || one.id - two.id);
};

export interface PositionGroup<P, Q> {
  /** Null for the people with no position, always last. */
  position: Q | null;
  people: P[];
}

/** byPosition cut where the position changes, so a list can label each group. A position nobody is on has no group. */
export const positionGroups = <
  P extends Pick<PersonLike, 'id' | 'position_id'>,
  Q extends Pick<PositionLike, 'id'>,
>(
  people: P[],
  positions: Q[],
): PositionGroup<P, Q>[] => {
  const { ordered, rank } = ranking(positions);
  const groups: PositionGroup<P, Q>[] = [];
  let current = -1;

  for (const person of byPosition(people, positions)) {
    const its = rank(person);

    if (its !== current) groups.push({ position: ordered[its] ?? null, people: [] });

    groups[groups.length - 1].people.push(person);
    current = its;
  }

  return groups;
};

/** A position's name by its id, for a person's position as text; null for none, or one since deleted. */
export const positionName = (
  positions: Pick<PositionLike, 'id' | 'name'>[],
  id: number | null,
): string | null => (id === null ? null : positions.find((position) => position.id === id)?.name ?? null);

const samePair = (one: HoursPair | null, two: HoursPair | null): boolean =>
  one === null || two === null
    ? one === two
    : one.start_time === two.start_time && one.end_time === two.end_time;

/** Each person and weekday whose default was a time and is now something else, keyed person|weekday. */
const restamps = (
  before: Defaults,
  after: Defaults,
): Map<string, { old: HoursPair; next: HoursPair | null }> => {
  const moves = new Map<string, { old: HoursPair; next: HoursPair | null }>();

  for (const person of after.people) {
    const was = before.people.find((one) => one.id === person.id);

    if (was === undefined) continue;

    for (const weekday of WEEKDAYS) {
      const old = defaultOnWeekday(was, before.positions, before.venue_hours, weekday);
      const next = defaultOnWeekday(person, after.positions, after.venue_hours, weekday);

      if (old !== null && !samePair(old, next)) moves.set(`${person.id}|${weekday}`, { old, next });
    }
  }

  return moves;
};

/**
 * The shifts as a save that changed somebody's default time leaves them: a
 * timed shift from today on that sits exactly at the old default moves to the
 * new one, which may be no time. A day with no time stays so, since it may
 * have been put there on purpose; hand-set hours differ from the old default
 * and stay; days gone by are what happened. The server runs the same rule as
 * one UPDATE, in the save's own transaction.
 */
export const restamp = <S extends ShiftLike>(
  shifts: S[],
  before: Defaults,
  after: Defaults,
  today: string,
): { shifts: S[]; restamped: number } => {
  const moves = restamps(before, after);
  let restamped = 0;

  const moved = shifts.map((shift): S => {
    if (shift.start_time === null || shift.end_time === null || shift.date < today) return shift;

    const move = moves.get(`${shift.person_id}|${isoWeekday(shift.date)}`);

    if (move === undefined || !samePair(move.old, { start_time: shift.start_time, end_time: shift.end_time })) {
      return shift;
    }

    restamped += 1;

    return { ...shift, start_time: move.next?.start_time ?? null, end_time: move.next?.end_time ?? null };
  });

  return { shifts: moved, restamped };
};
