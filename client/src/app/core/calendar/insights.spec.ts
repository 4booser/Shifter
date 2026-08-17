import { describe, expect, it } from 'vitest';

import { CalendarDayData, DaysResponse, EMPTY_SUMMARY } from './calendar.models';
import { averagesFor, bestWeek, change, longestStreak, restDays } from './insights';

function day(date: string, earned: number, shifts = 1): CalendarDayData {
  return {
    date,
    shifts: Array.from({ length: shifts }, () => ({
      shift_id: 1,
      name: 'Bar',
      symbol: null,
      colour: null,
      start_time: '10:00',
      end_time: '18:00',
      hours: 8,
      earned,
      worked: true,
      needs_cover: false,
    })),
    sales: [],
    tips: null,
    tips_cash: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    hours: 8 * shifts,
    earned,
    planned: 0,
  };
}

function summary(days: CalendarDayData[], overrides: Partial<DaysResponse> = {}): DaysResponse {
  return {
    ...EMPTY_SUMMARY,
    days,
    hours: days.reduce((total, entry) => total + entry.hours, 0),
    total_earned: days.reduce((total, entry) => total + entry.earned, 0),
    days_worked: days.length,
    ...overrides,
  };
}

describe('averagesFor', () => {
  it('divides by worked days, hours and shifts', () => {
    const result = averagesFor(
      summary([day('2026-03-02', 1000), day('2026-03-03', 2000, 2)], { tips_earned: 300 }),
    );

    expect(result.perDay).toBe(1500);
    expect(result.perHour).toBe(125);
    expect(result.shifts).toBe(3);
    expect(result.perShift).toBe(1000);
    expect(result.tipsPerDay).toBe(150);
    expect(result.tipShare).toBe(10);
  });

  it('returns zeros rather than dividing by nothing', () => {
    const result = averagesFor(EMPTY_SUMMARY);

    expect(result.perDay).toBe(0);
    expect(result.perHour).toBe(0);
    expect(Number.isFinite(result.perShift)).toBe(true);
  });
});

describe('change', () => {
  it('reports the percent moved', () => {
    expect(change(150, 100)).toBe(50);
    expect(change(50, 100)).toBe(-50);
  });

  it('has nothing to say without a baseline', () => {
    expect(change(500, 0)).toBeNull();
  });
});

describe('longestStreak', () => {
  it('counts only consecutive calendar days', () => {
    const run = longestStreak([
      day('2026-03-01', 100),
      day('2026-03-02', 100),
      day('2026-03-03', 100),
      day('2026-03-05', 100),
    ]);

    expect(run).toEqual({ length: 3, from: '2026-03-01', to: '2026-03-03' });
  });

  it('crosses a month boundary', () => {
    const run = longestStreak([day('2026-03-31', 100), day('2026-04-01', 100)]);

    expect(run?.length).toBe(2);
  });

  it('is null with nothing worked', () => {
    expect(longestStreak([])).toBeNull();
  });
});

describe('bestWeek', () => {
  it('buckets by the Monday of each week', () => {
    // 2026-03-02 is a Monday; the 8th is the Sunday closing that same week.
    const best = bestWeek([
      day('2026-03-02', 500),
      day('2026-03-08', 700),
      day('2026-03-09', 400),
    ]);

    expect(best).toEqual({ from: '2026-03-02', to: '2026-03-08', value: 1200 });
  });
});

describe('restDays', () => {
  it('counts the days in the range with no work on them', () => {
    expect(restDays([day('2026-03-02', 100)], '2026-03-01', '2026-03-05')).toBe(4);
  });
});
