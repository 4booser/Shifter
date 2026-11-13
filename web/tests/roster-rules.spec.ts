/* The cases the server and both clients are held to, run through the one TypeScript copy. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  Defaults,
  HoursLike,
  HoursPair,
  PatternLike,
  PositionLike,
  ShiftLike,
  WeekHoursLike,
  byPosition,
  defaultHours,
  hasUsualTime,
  openOn,
  positionGroups,
  restamp,
  venueLine,
  worksOn,
} from '@/lib/roster/rules';

interface Side {
  venue: string;
  people: { id: number; position_id: number | null; hours: HoursLike }[];
  /** Absent means the shared ones. */
  positions?: PositionLike[];
}

/** The sections the TypeScript copy runs; fill is the server's alone. */
interface Cases {
  venues: Record<string, WeekHoursLike[]>;
  positions: PositionLike[];
  default_hours: {
    name: string;
    venue: string;
    date: string;
    person: { position_id: number | null; hours: HoursLike };
    expect: HoursPair | null;
  }[];
  works_on: { name: string; pattern: PatternLike; month: string; expect: string[] }[];
  open_on: { name: string; venue: string; date: string; expect: boolean }[];
  venue_line: { name: string; venue: string; ru: string | null; uk: string | null }[];
  order: { name: string; people: { id: number; position_id: number | null }[]; expect: number[] }[];
  restamp: {
    name: string;
    today: string;
    before: Side;
    after: Side;
    shifts: ShiftLike[];
    expect: { restamped: number; shifts: ShiftLike[] };
  }[];
}

const CASES: Cases = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../shared/roster/roster-rules.cases.json'), 'utf8'),
);

/** Every date of a yyyy-MM, worked out without a Date walk that a clock change could trip. */
const daysOf = (month: string): string[] => {
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();

  return Array.from({ length: last }, (_, at) => `${month}-${`${at + 1}`.padStart(2, '0')}`);
};

const sideOf = ({ venue, people, positions }: Side): Defaults => ({
  venue_hours: CASES.venues[venue],
  positions: positions ?? CASES.positions,
  people,
});

const INHERIT: HoursLike = { mode: 'inherit', start_time: null, end_time: null, week_hours: [] };

describe('the shared roster cases', () => {
  describe('default_hours', () => {
    it.each(CASES.default_hours)('$name', ({ venue, date, person, expect: want }) => {
      expect(defaultHours(person, CASES.positions, CASES.venues[venue], date)).toEqual(want);
    });
  });

  describe('works_on', () => {
    it.each(CASES.works_on)('$name', ({ pattern, month, expect: want }) => {
      expect(daysOf(month).filter((date) => worksOn(pattern, date))).toEqual(want);
    });
  });

  describe('open_on', () => {
    it.each(CASES.open_on)('$name', ({ venue, date, expect: want }) => {
      expect(openOn(CASES.venues[venue], date)).toBe(want);
    });
  });

  describe('venue_line', () => {
    it.each(CASES.venue_line)('$name', ({ venue, ru, uk }) => {
      expect(venueLine(CASES.venues[venue], 'ru')).toBe(ru);
      expect(venueLine(CASES.venues[venue], 'uk')).toBe(uk);
    });
  });

  describe('order', () => {
    it.each(CASES.order)('$name', ({ people, expect: want }) => {
      expect(byPosition(people, CASES.positions).map((person) => person.id)).toEqual(want);
    });
  });

  describe('restamp', () => {
    it.each(CASES.restamp)('$name', ({ today, before, after, shifts, expect: want }) => {
      expect(restamp(shifts, sideOf(before), sideOf(after), today)).toEqual(want);
    });
  });

  it('writes the venue line in English too', () => {
    expect(venueLine(CASES.venues.bar, 'en')).toBe('Mon–Thu 12:00–00:00 · Fri–Sat 12:00–02:00 · Sun closed');
    expect(venueLine(CASES.venues.shut_early_week, 'en')).toBe('Mon–Tue closed · Wed–Sun 12:00–00:00');
    expect(venueLine(CASES.venues.none, 'en')).toBeNull();
  });

  it('knows when nothing gives anybody a time', () => {
    const on = (position_id: number | null, hours: HoursLike = INHERIT) => [{ position_id, hours }];
    const own: HoursLike = { mode: 'own', start_time: '09:00', end_time: '17:00', week_hours: [] };

    expect(hasUsualTime([], CASES.positions, CASES.venues.bar)).toBe(false);
    expect(hasUsualTime(on(null), CASES.positions, CASES.venues.none)).toBe(false);
    expect(hasUsualTime(on(3), CASES.positions, CASES.venues.bar)).toBe(false);
    expect(hasUsualTime(on(2), CASES.positions, CASES.venues.none)).toBe(false);
    expect(hasUsualTime(on(99), CASES.positions, CASES.venues.none)).toBe(false);

    expect(hasUsualTime(on(null), CASES.positions, CASES.venues.bar)).toBe(true);
    expect(hasUsualTime(on(2), CASES.positions, CASES.venues.saturday_only)).toBe(true);
    expect(hasUsualTime(on(1), CASES.positions, CASES.venues.none)).toBe(true);
    expect(hasUsualTime(on(3, own), CASES.positions, CASES.venues.none)).toBe(true);
  });

  it('cuts the same order into groups, the people with no position last', () => {
    const groups = positionGroups(CASES.order[0].people, CASES.positions);

    expect(groups.map(({ position, people }) => [position?.name ?? null, people.map((person) => person.id)])).toEqual([
      ['Бар', [7]],
      ['Кальяны', [5, 8]],
      ['Кухня', [9]],
      [null, [6, 10]],
    ]);
  });
});
