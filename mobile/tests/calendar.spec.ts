import { describe, expect, it } from 'vitest';

import {
  addMonths,
  covers,
  gridBounds,
  monthBounds,
  monthGrid,
  monthOnly,
  monthsBetween,
  nextDay,
  runsOf,
  sameWeekdaysIn,
  WEEKDAYS,
  weekdayOf,
} from '@/lib/calendar';

/**
 * The date arithmetic behind the calendar screen. It is worth testing for one
 * reason: every bug in here is invisible until somebody counts the squares,
 * and by then it has already written a shift onto the wrong day.
 */
describe('the grid', () => {
  it('is always six full weeks, so a page never changes height', () => {
    for (const at of [{ year: 2026, month: 2 }, { year: 2026, month: 8 }, { year: 2027, month: 5 }]) {
      expect(monthGrid(at)).toHaveLength(42);
    }
  });

  it('starts on a Monday and runs without a gap', () => {
    const cells = monthGrid({ year: 2026, month: 8 });

    expect(new Date(`${cells[0].key}T00:00:00`).getDay()).toBe(1);

    for (let at = 1; at < cells.length; at++) {
      expect(cells[at].key).toBe(nextDay(cells[at - 1].key));
    }
  });

  it('fills the corners with the neighbouring months rather than blanks', () => {
    const cells = monthGrid({ year: 2026, month: 8 });

    // 1 August 2026 is a Saturday, so five days of July lead the grid.
    expect(cells[0].key).toBe('2026-07-27');
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(cells[5]).toEqual({ key: '2026-08-01', inMonth: true });
    expect(cells[41].inMonth).toBe(false);
  });

  it('marks a month that begins on a Monday without a leading week', () => {
    const cells = monthGrid({ year: 2026, month: 6 });

    expect(cells[0]).toEqual({ key: '2026-06-01', inMonth: true });
  });

  it('reports the range it actually draws, not the month', () => {
    expect(gridBounds({ year: 2026, month: 8 })).toEqual({ from: '2026-07-27', to: '2026-09-06' });
    expect(monthBounds({ year: 2026, month: 8 })).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('gets February right in a leap year and out of one', () => {
    expect(monthBounds({ year: 2028, month: 2 }).to).toBe('2028-02-29');
    expect(monthBounds({ year: 2026, month: 2 }).to).toBe('2026-02-28');
  });
});

describe('stepping months', () => {
  it('crosses a year in both directions', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 8 }, 36)).toEqual({ year: 2029, month: 8 });
    expect(addMonths({ year: 2026, month: 8 }, -36)).toEqual({ year: 2023, month: 8 });
  });

  it('counts back to where it started', () => {
    const from = { year: 2026, month: 8 };

    for (const delta of [-36, -1, 0, 1, 17, 36]) {
      expect(monthsBetween(from, addMonths(from, delta))).toBe(delta);
    }
  });

  it('names the month on its own, capitalised', () => {
    expect(monthOnly({ year: 2026, month: 8 })).toBe('Август');
  });
});

describe('painted days', () => {
  it('collapses a stretch into one run', () => {
    expect(runsOf(['2026-08-03', '2026-08-04', '2026-08-05'])).toEqual([
      { from: '2026-08-03', to: '2026-08-05' },
    ]);
  });

  it('keeps separate stretches apart, whatever order they were painted in', () => {
    expect(runsOf(['2026-08-09', '2026-08-03', '2026-08-04', '2026-08-07'])).toEqual([
      { from: '2026-08-03', to: '2026-08-04' },
      { from: '2026-08-07', to: '2026-08-07' },
      { from: '2026-08-09', to: '2026-08-09' },
    ]);
  });

  it('runs across the end of a month', () => {
    expect(runsOf(['2026-08-30', '2026-08-31', '2026-09-01'])).toEqual([
      { from: '2026-08-30', to: '2026-09-01' },
    ]);
  });

  it('has nothing to say about nothing', () => {
    expect(runsOf([])).toEqual([]);
  });
});

describe('the next day', () => {
  it('steps over a month, a year and a leap day in local time', () => {
    expect(nextDay('2026-08-31')).toBe('2026-09-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
    expect(nextDay('2026-02-28')).toBe('2026-03-01');
  });

  it('does not fall back a day the way a UTC conversion would', () => {
    // The bug this replaces: new Date('2026-08-10T00:00:00').toISOString() is
    // the 9th anywhere east of Greenwich.
    expect(nextDay('2026-08-10')).toBe('2026-08-11');
  });
});

describe('what a stretch covers', () => {
  it('includes both ends', () => {
    expect(covers('2026-08-04', '2026-08-06', '2026-08-04')).toBe(true);
    expect(covers('2026-08-04', '2026-08-06', '2026-08-06')).toBe(true);
    expect(covers('2026-08-04', '2026-08-06', '2026-08-03')).toBe(false);
    expect(covers('2026-08-04', '2026-08-06', '2026-08-07')).toBe(false);
  });
});

describe('spreading a stroke across the weekdays it touches', () => {
  it('finds every matching weekday in the month', () => {
    // 4 August 2026 is a Tuesday.
    const spread = sameWeekdaysIn({ year: 2026, month: 8 }, ['2026-08-04']);

    expect(spread).toEqual(['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25']);
  });

  it('takes every weekday already chosen, not just the first', () => {
    // Tuesday and Thursday — the commonest rota there is.
    const spread = sameWeekdaysIn({ year: 2026, month: 8 }, ['2026-08-04', '2026-08-06']);

    // Four Tuesdays and four Thursdays.
    expect(spread).toHaveLength(8);
    expect(spread).toContain('2026-08-27');
    expect(spread).not.toContain('2026-08-05');
  });

  it('stays inside the month it was asked about', () => {
    const spread = sameWeekdaysIn({ year: 2026, month: 8 }, ['2026-08-04']);

    expect(spread.every((key) => key.startsWith('2026-08'))).toBe(true);
  });

  it('has nothing to spread from nothing', () => {
    expect(sameWeekdaysIn({ year: 2026, month: 8 }, [])).toEqual([]);
  });

  it('numbers the weekdays from Monday, the way the grid does', () => {
    expect(weekdayOf('2026-08-03')).toBe(0);
    expect(weekdayOf('2026-08-09')).toBe(6);
    expect(WEEKDAYS[weekdayOf('2026-08-04')]).toBe('вт');
  });
});
