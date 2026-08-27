import { punchcard, waterfall } from '@/lib/charts/report-math';
import { CalendarDayData, DaysResponse, EMPTY_SUMMARY } from '@/lib/calendar/models';

describe('waterfall', () => {
  const summary: DaysResponse = {
    ...EMPTY_SUMMARY,
    shifts_earned: 10_000,
    tips_earned: 2_000,
    tip_out: 500,
    total_earned: 11_500,
    tax: 1_150,
    net_earned: 10_350,
  };

  it('walks from the sources through the deductions to the totals', () => {
    const steps = waterfall(summary);

    expect(steps.map((step) => step.key)).toEqual(['Shifts', 'Tips', 'Tip-out', 'Earned', 'Tax', 'Net']);
  });

  it('lands each step where the previous one ended', () => {
    const steps = waterfall(summary);
    const tips = steps.find((step) => step.key === 'Tips');
    const tipOut = steps.find((step) => step.key === 'Tip-out');

    expect(tips).toMatchObject({ from: 10_000, to: 12_000 });
    // A deduction hangs down from the running total.
    expect(tipOut).toMatchObject({ from: 11_500, to: 12_000 });
  });

  it('skips the tax landing when nothing was withheld', () => {
    const untaxed = { ...summary, tax: 0, net_earned: summary.total_earned };
    const steps = waterfall(untaxed);

    expect(steps.at(-1)?.key).toBe('Earned');
  });

  it('is empty on an empty period', () => {
    expect(waterfall(EMPTY_SUMMARY)).toEqual([]);
  });

  it('splits the percentage out of the shifts it was counted inside', () => {
    const steps = waterfall({
      ...summary,
      shifts_earned: 10_000,
      revenue_earned: 2_500,
      revenue_counted: 50_000,
    });

    expect(steps.find((step) => step.key === 'Shifts')?.value).toBe(7_500);
    expect(steps.find((step) => step.key === 'Percentage')?.value).toBe(2_500);
  });

  it('counts the premiums that used to be left out of the bar', () => {
    const steps = waterfall({
      ...summary,
      premium_earned: 1_600,
      overtime_earned: 400,
      total_earned: 13_500,
    });

    // Only the steps before the first landing: tax hangs off it afterwards.
    const earned = steps.findIndex((step) => step.kind === 'total');
    const walked = steps
      .slice(0, earned)
      .reduce((sum, step) => sum + (step.kind === 'plus' ? step.value : -step.value), 0);

    // What the pieces add up to is what the total says.
    expect(walked).toBe(13_500);
    expect(steps[earned]).toMatchObject({ key: 'Earned', value: 13_500 });
  });
});

describe('punchcard', () => {
  const day = (date: string, start: string, hours: number, earned: number): CalendarDayData => ({
    date,
    shifts: [
      {
        shift_id: 1,
        name: 'Bar',
        symbol: null,
        colour: null,
        start_time: start,
        end_time: '23:00',
        hours,
        earned,
        revenue: null,
        revenue_percent: null,
        worked: true,
        needs_cover: false,
        actual_start: null,
        actual_end: null,
        break_minutes: 0,
      },
    ],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_pool: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    below_floor: false,
    hours,
    earned,
    planned: 0,
  });

  it('buckets repeat shifts into one growing cell', () => {
    // Two Mondays at 17:00.
    const card = punchcard([day('2026-03-02', '17:00', 6, 900), day('2026-03-09', '17:00', 6, 900)]);

    expect(card?.cells).toHaveLength(1);
    expect(card?.cells[0]).toMatchObject({ weekday: 0, hour: 17, count: 2, perHour: 150 });
  });

  it('spans only the hours actually worked', () => {
    const card = punchcard([day('2026-03-02', '08:00', 8, 800), day('2026-03-03', '17:00', 6, 900)]);

    expect(card?.hourFrom).toBe(8);
    expect(card?.hourTo).toBe(17);
  });

  it('returns null when nothing was worked', () => {
    expect(punchcard([])).toBeNull();
  });
});

import { hourDial, rateTrend } from '@/lib/charts/report-math';

describe('hourDial', () => {
  const day = (start: string, end: string, hours: number, earned: number) => ({
    date: '2026-03-02',
    shifts: [
      {
        shift_id: 1,
        name: 'Bar',
        symbol: null,
        colour: null,
        start_time: start,
        end_time: end,
        hours,
        earned,
        revenue: null,
        revenue_percent: null,
        worked: true,
        needs_cover: false,
        actual_start: null,
        actual_end: null,
        break_minutes: 0,
      },
    ],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_pool: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    below_floor: false,
    hours,
    earned,
    planned: 0,
  });

  it('spreads a shift evenly across the hours it spans', () => {
    const dial = hourDial([day('10:00', '14:00', 4, 400)]);

    expect(dial[10]).toBe(100);
    expect(dial[13]).toBe(100);
    expect(dial[14]).toBe(0);
  });

  it('wraps an overnight shift past midnight', () => {
    const dial = hourDial([day('22:00', '02:00', 4, 400)]);

    expect(dial[23]).toBe(100);
    expect(dial[1]).toBe(100);
    expect(dial[2]).toBe(0);
  });
});

describe('rateTrend', () => {
  it('groups by Monday-anchored weeks and divides honestly', () => {
    const day = (date: string, hours: number, earned: number) => ({
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
      below_floor: false,
      hours,
      earned,
      planned: 0,
    });

    // Wed 4 March and Sun 8 March share a week; Mon 9 March starts the next.
    const trend = rateTrend([day('2026-03-04', 8, 800), day('2026-03-08', 2, 400), day('2026-03-09', 8, 1600)]);

    expect(trend).toHaveLength(2);
    expect(trend[0]).toMatchObject({ week: '2026-03-02', perHour: 120 });
    expect(trend[1]).toMatchObject({ week: '2026-03-09', perHour: 200 });
  });
});

import { weekBands } from '@/lib/charts/report-math';

describe('weekBands', () => {
  const day = (date: string, start: string, end: string, hours: number, earned: number) => ({
    date,
    shifts: [
      {
        shift_id: 1,
        name: 'Bar',
        symbol: null,
        colour: null,
        start_time: start,
        end_time: end,
        hours,
        earned,
        revenue: null,
        revenue_percent: null,
        worked: true,
        needs_cover: false,
        actual_start: null,
        actual_end: null,
        break_minutes: 0,
      },
    ],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_pool: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    below_floor: false,
    hours,
    earned,
    planned: 0,
  });

  it('widens a weekday band to cover every start and end seen', () => {
    // Two Mondays: 11–22 and 09–18 → the band runs 9 to 22.
    const bands = weekBands([day('2026-03-02', '11:00', '22:00', 11, 1100), day('2026-03-09', '09:00', '18:00', 9, 900)]);

    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({ weekday: 0, from: 9, to: 22, count: 2, perHour: 100 });
  });

  it('lets an overnight shift run past twenty-four', () => {
    const bands = weekBands([day('2026-03-06', '22:00', '06:00', 8, 800)]);

    expect(bands[0].from).toBe(22);
    expect(bands[0].to).toBe(30);
  });

  it('keeps half-hour starts as fractions', () => {
    const bands = weekBands([day('2026-03-03', '10:30', '19:00', 8.5, 850)]);

    expect(bands[0].from).toBeCloseTo(10.5);
  });
});
