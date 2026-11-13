/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  byPosition,
  Defaults,
  defaultHours,
  HoursLike,
  HoursPair,
  openOn,
  PatternLike,
  PositionLike,
  positionGroups,
  restamp,
  ShiftLike,
  venueLine,
  WeekHoursLike,
  worksOn,
} from '@/lib/roster-rules';

/*
 * The cases the server, the web and the phone are all held to. They come in
 * through the phone's own alias, so a broken alias fails here rather than on
 * a device. Fill is the server's alone, and is not run here.
 */

interface Side {
  venue: string;
  people: { id: number; position_id: number | null; hours: HoursLike }[];
  /** Absent means the shared ones. */
  positions?: PositionLike[];
}

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
  readFileSync(
    path.resolve(import.meta.dirname, '../../shared/roster/roster-rules.cases.json'),
    'utf8',
  ),
);

/** Every date of a month, counted out by hand: a walk of Date objects would trip on a clock change. */
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

describe('the shared roster cases, on the phone', () => {
  it('has every section it is meant to run', () => {
    expect(CASES.default_hours.length).toBeGreaterThan(0);
    expect(CASES.works_on.length).toBeGreaterThan(0);
    expect(CASES.open_on.length).toBeGreaterThan(0);
    expect(CASES.venue_line.length).toBeGreaterThan(0);
    expect(CASES.order.length).toBeGreaterThan(0);
    expect(CASES.restamp.length).toBeGreaterThan(0);
  });

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

    it('cuts the same order into groups, the people with no position last', () => {
      const groups = positionGroups(CASES.order[0].people, CASES.positions);

      expect(groups.map(({ position, people }) => [position?.name ?? null, people.map((one) => one.id)])).toEqual([
        ['Бар', [7]],
        ['Кальяны', [5, 8]],
        ['Кухня', [9]],
        [null, [6, 10]],
      ]);
    });
  });

  describe('restamp', () => {
    it.each(CASES.restamp)('$name', ({ today, before, after, shifts, expect: want }) => {
      expect(restamp(shifts, sideOf(before), sideOf(after), today)).toEqual(want);
    });
  });
});
