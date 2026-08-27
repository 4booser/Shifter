import { describe, expect, it } from 'vitest';

import { clopenings } from '@/lib/calendar/clopening';
import { forecastFor } from '@/lib/calendar/forecast';
import { whatIfBaseline, whatIfProject } from '@/lib/calendar/whatif';
import { CalendarDayData } from '@/lib/calendar/models';

function day(date: string, earned: number): CalendarDayData {
  return {
    date,
    shifts: [],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_pool: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    hours: earned > 0 ? 8 : 0,
    earned,
    planned: 0,
  };
}

describe('whatIfBaseline', () => {
  it('averages the worked days and paces them over the fixed window', () => {
    // 16 worked days in 8 weeks = 2 per week, 1500 each.
    const days = Array.from({ length: 16 }, (_, i) =>
      day(`2026-08-${String(i + 5).padStart(2, '0')}`, 1500),
    );
    const base = whatIfBaseline(days, '2026-08-24');

    expect(base).not.toBeNull();
    expect(base!.perShift).toBe(1500);
    expect(base!.shiftsPerWeek).toBeCloseTo(2, 5);
    expect(base!.sample).toBe(16);
  });

  it('ignores days outside the window and days that earned nothing', () => {
    const days = [
      day('2026-01-01', 9000), // long gone
      day('2026-08-20', 0), // planned, never worked
      day('2026-08-21', 1200),
    ];
    const base = whatIfBaseline(days, '2026-08-24');

    expect(base!.sample).toBe(1);
    expect(base!.perShift).toBe(1200);
  });

  it('is null with nothing worked — the card has nothing honest to say', () => {
    expect(whatIfBaseline([day('2026-08-20', 0)], '2026-08-24')).toBeNull();
    expect(whatIfBaseline([], '2026-08-24')).toBeNull();
  });
});

describe('whatIfProject', () => {
  it('prices the pace and dates the target', () => {
    // 3 × 1000 = 3000/week; 12000 gap = 4 weeks exactly.
    const result = whatIfProject(1000, 3, 12_000, 0, '2026-08-24');

    expect(result.weekly).toBe(3000);
    expect(result.monthly).toBeCloseTo(3000 * (365.25 / 7 / 12), 5);
    expect(result.weeksToTarget).toBeCloseTo(4, 5);
    expect(result.etaKey).toBe('2026-09-21');
    expect(result.extraShifts).toBe(12);
    expect(result.reached).toBe(false);
  });

  it('rounds shifts up — a target is crossed, not approached', () => {
    const result = whatIfProject(1000, 3, 12_500, 0, '2026-08-24');

    expect(result.extraShifts).toBe(13);
  });

  it('marks a banked target as reached with zero distance', () => {
    const result = whatIfProject(1000, 3, 5000, 6000, '2026-08-24');

    expect(result.reached).toBe(true);
    expect(result.weeksToTarget).toBe(0);
    expect(result.extraShifts).toBe(0);
  });

  it('keeps the date honest across the autumn DST switch', () => {
    // 10 weeks from late August crosses the October clock change; midday
    // arithmetic means the lost hour cannot pull the ETA back a day.
    const result = whatIfProject(800, 5, 40_000, 0, '2026-08-26');

    expect(result.etaKey).toBe('2026-11-04');
  });

  it('refuses a date when the dial is at zero', () => {
    const result = whatIfProject(1000, 0, 5000, 0, '2026-08-24');

    expect(result.weekly).toBe(0);
    expect(result.weeksToTarget).toBeNull();
    expect(result.etaKey).toBeNull();
  });
});

describe('forecastFor with leave', () => {
  const workdays = (dates: string[]) =>
    dates.map((date) => day(date, 1000));

  it('leaves the pace alone across a fortnight off', () => {
    // Four worked days out of the first six; then a week of leave.
    const days = workdays(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']);
    const away = new Set(
      ['09', '10', '11', '12', '13', '14', '15'].map((d) => `2026-03-${d}`),
    );

    const naive = forecastFor(days, '2026-03-01', '2026-03-31');
    const honest = forecastFor(days, '2026-03-01', '2026-03-31', away);

    // The same money over fewer counted days is a higher, truer pace.
    expect(honest.perDay).toBeGreaterThan(naive.perDay);
    expect(honest.earnedSoFar).toBe(naive.earnedSoFar);
  });

  it('still counts a leave day that somehow earned money', () => {
    const days = [day('2026-03-10', 1500)];
    const away = new Set(['2026-03-10']);

    expect(forecastFor(days, '2026-03-01', '2026-03-31', away).earnedSoFar).toBe(1500);
  });
});

describe('clopenings', () => {
  const shift = (start: string, end: string) => ({
    shift_id: 1,
    name: 'Bar',
    symbol: null,
    colour: null,
    start_time: start,
    end_time: end,
    worked: true,
    needs_cover: false,
    actual_start: null as string | null,
    actual_end: null as string | null,
    break_minutes: null,
    earned: 1000,
    hours: 8,
  });

  const withShifts = (date: string, shifts: ReturnType<typeof shift>[]) => ({
    ...day(date, 1000),
    shifts: shifts as never,
  });

  it('catches the classic close-then-open', () => {
    // Ends 02:00, back at 08:00 — six hours of life in between.
    const found = clopenings([
      withShifts('2026-03-02', [shift('18:00', '02:00')]),
      withShifts('2026-03-03', [shift('08:00', '16:00')]),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0].gap).toBe(6);
  });

  it('leaves a humane turnaround alone', () => {
    const found = clopenings([
      withShifts('2026-03-02', [shift('10:00', '18:00')]),
      withShifts('2026-03-03', [shift('10:00', '18:00')]),
    ]);

    expect(found).toHaveLength(0);
  });

  it('does not count a day off as a clopening', () => {
    const found = clopenings([
      withShifts('2026-03-02', [shift('18:00', '02:00')]),
      withShifts('2026-03-04', [shift('08:00', '16:00')]),
    ]);

    expect(found).toHaveLength(0);
  });

  it('measures from the recorded clock when there is one', () => {
    const late = { ...shift('18:00', '02:00'), actual_end: '03:30' };
    const found = clopenings([
      withShifts('2026-03-02', [late]),
      withShifts('2026-03-03', [shift('08:00', '16:00')]),
    ]);

    expect(found[0].gap).toBe(4.5);
  });
});
