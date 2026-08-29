import { describe, expect, it } from 'vitest';

import { CalendarDayData } from '@/lib/calendar/models';
import { sameMonthLastYear, seasonalCushion, seasonalIndex, yearShape } from '@/lib/calendar/seasonality';

const day = (date: string, earned: number): CalendarDayData =>
  ({
    date,
    shifts: [],
    tips: null,
    tips_cash: null,
    tip_pool: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    below_floor: false,
    hours: 8,
    earned,
    planned: 0,
  }) as unknown as CalendarDayData;

/** One month of a year, earning the same each day it worked. */
const month = (year: number, monthNumber: number, total: number, days = 10): CalendarDayData[] =>
  Array.from({ length: days }, (_, index) =>
    day(
      `${year}-${String(monthNumber).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
      total / days,
    ),
  );

describe('the shape of somebody’s year', () => {
  it('says nothing about a month it has seen once', () => {
    // One December is a December, not a pattern, and calling it one turns a
    // good Christmas into a promise.
    const days = [...month(2025, 12, 40_000), ...month(2025, 6, 20_000)];

    expect(yearShape(days, '2026-03-15')).toEqual([]);
  });

  it('reads a month against a typical one once there are two years of it', () => {
    const days = [
      ...month(2024, 12, 42_000),
      ...month(2025, 12, 38_000),
      ...month(2024, 6, 20_000),
      ...month(2025, 6, 20_000),
    ];

    const shape = yearShape(days, '2026-03-15');
    const december = shape.find((row) => row.month === 12)!;
    const june = shape.find((row) => row.month === 6)!;

    expect(december.years).toBe(2);
    expect(december.average).toBe(40_000);
    // Forty against a typical thirty: a third better than usual.
    expect(december.index).toBeCloseTo(1.333, 2);
    expect(june.index).toBeCloseTo(0.667, 2);
  });

  it('leaves the month in progress out of its own average', () => {
    // A half-recorded March would drag March's average down every time
    // somebody opened the page in March.
    const days = [
      ...month(2024, 3, 30_000),
      ...month(2025, 3, 30_000),
      ...month(2026, 3, 4_000, 2),
    ];

    const march = yearShape(days, '2026-03-05').find((row) => row.month === 3)!;

    expect(march.years).toBe(2);
    expect(march.average).toBe(30_000);
  });

  it('has nothing to say about an empty history', () => {
    expect(yearShape([], '2026-03-15')).toEqual([]);
  });
});

describe('the same month a year ago', () => {
  it('cuts last year at the same day of the month', () => {
    // Comparing a half-finished March against a whole one says nothing except
    // that March is not over.
    const days = month(2025, 3, 31_000, 31);

    const then = sameMonthLastYear(days, '2026-03-10')!;

    expect(then.month).toBe('2025-03');
    expect(then.earned).toBe(31_000);
    expect(then.earnedByNow).toBe(10_000);
    expect(then.daysWorked).toBe(31);
  });

  it('says nothing when there was no such month', () => {
    expect(sameMonthLastYear(month(2025, 6, 20_000), '2026-03-10')).toBeNull();
  });
});

describe('the seasonal correction', () => {
  const shape = yearShape(
    [
      ...month(2024, 12, 42_000),
      ...month(2025, 12, 38_000),
      ...month(2024, 6, 20_000),
      ...month(2025, 6, 20_000),
    ],
    '2026-03-15',
  );

  it('is null where there is no history for the month', () => {
    // Null rather than 1, so a caller cannot accidentally present a flat
    // forecast as a seasonal one.
    expect(seasonalIndex(shape, 3)).toBeNull();
  });

  it('corrects a month it knows', () => {
    expect(seasonalIndex(shape, 12)).toBeCloseTo(1.333, 2);
  });

  it('refuses a correction beyond half in either direction', () => {
    // Almost always one freakish month rather than a season, and applying it
    // turns a forecast into a rumour.
    const wild = yearShape(
      [
        ...month(2024, 12, 100_000),
        ...month(2025, 12, 100_000),
        ...month(2024, 6, 1_000),
        ...month(2025, 6, 1_000),
      ],
      '2026-03-15',
    );

    expect(seasonalIndex(wild, 12)).toBe(1.5);
    expect(seasonalIndex(wild, 6)).toBe(0.5);
  });
});

describe('the seasonal cushion', () => {
  it('says how much of a fat month to put aside', () => {
    const shape = yearShape(
      [
        ...month(2024, 12, 40_000), ...month(2025, 12, 40_000),
        ...month(2024, 1, 20_000), ...month(2025, 1, 20_000),
        ...month(2024, 6, 30_000), ...month(2025, 6, 30_000),
      ],
      '2026-03-15',
    );

    const cushion = seasonalCushion(shape);

    // Only six months of shape here — below the floor, so nothing is said.
    expect(cushion).toBeNull();
  });

  it('needs at least half a year of shape before it speaks', () => {
    const months = [12, 1, 2, 6, 7, 8].flatMap((m) => [
      ...month(2024, m, m === 12 ? 40_000 : m === 1 ? 18_000 : 30_000),
      ...month(2025, m, m === 12 ? 40_000 : m === 1 ? 18_000 : 30_000),
    ]);

    const cushion = seasonalCushion(yearShape(months, '2026-03-15'))!;

    expect(cushion).not.toBeNull();
    expect(cushion.fat.map((row) => row.month)).toEqual([12]);
    expect(cushion.lean.map((row) => row.month)).toEqual([1]);
    expect(cushion.saveShare).toBeGreaterThan(0);
    expect(cushion.saveShare).toBeLessThan(0.5);
  });

  it('has nothing to say about a flat year', () => {
    // Telling somebody with a flat year to build a cushion is inventing a
    // problem to solve.
    const months = [1, 2, 3, 4, 5, 6].flatMap((m) => [
      ...month(2024, m, 30_000),
      ...month(2025, m, 30_000),
    ]);

    expect(seasonalCushion(yearShape(months, '2026-07-15'))).toBeNull();
  });
});
