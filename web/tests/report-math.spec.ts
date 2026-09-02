import { punchcard, tipsByWeekday, waterfall } from '@/lib/charts/report-math';
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

    expect(steps.map((step) => step.key)).toEqual(['Shifts', 'Tips', 'Tip-out', 'Gross', 'Tax', 'Net']);
  });

  /*
   * The landing the cuts hang off is the sum of the sources, not the figure
   * that already has them taken out. Hung off `total_earned`, a month of
   * ₴4 in shifts and ₴80 of withholding read «earned −₴76, minus ₴80,
   * net −₴77» — three numbers that cannot all be true.
   */
  it('lands on the gross, so the cuts have something to come out of', () => {
    const steps = waterfall(summary);
    const gross = steps.find((step) => step.key === 'Gross');
    const cuts = steps
      .filter((step) => step.kind === 'minus')
      .reduce((sum, step) => sum + step.value, 0);

    expect(gross?.value).toBe(12_000);
    expect((gross?.value ?? 0) - cuts).toBe(summary.net_earned);
  });

  it('reaches the net even where nothing was withheld', () => {
    const shortfall: DaysResponse = {
      ...EMPTY_SUMMARY,
      shifts_earned: 4,
      deductions: 80,
      total_earned: -76,
      tax: 1,
      net_earned: -77,
    };
    const steps = waterfall(shortfall);

    expect(steps.find((step) => step.key === 'Gross')?.value).toBe(4);
    expect(steps.at(-1)).toMatchObject({ key: 'Net', value: -77 });
  });

  it('lands each step where the previous one ended', () => {
    const steps = waterfall(summary);
    const tips = steps.find((step) => step.key === 'Tips');
    const tipOut = steps.find((step) => step.key === 'Tip-out');

    expect(tips).toMatchObject({ from: 10_000, to: 12_000 });
    // A deduction hangs down from the running total.
    expect(tipOut).toMatchObject({ from: 11_500, to: 12_000 });
  });

  it('skips the tax step when nothing was withheld, and still lands on net', () => {
    const untaxed = { ...summary, tax: 0, net_earned: summary.total_earned };
    const steps = waterfall(untaxed);

    expect(steps.some((step) => step.key === 'Tax')).toBe(false);
    expect(steps.at(-1)).toMatchObject({ key: 'Net', value: summary.total_earned });
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
    const landing = steps.findIndex((step) => step.kind === 'total');
    const walked = steps
      .slice(0, landing)
      .reduce((sum, step) => sum + (step.kind === 'plus' ? step.value : -step.value), 0);

    // What the pieces add up to is what the total says.
    expect(walked).toBe(13_500);
    // The landing is the gross; the tip-out already walked out of it above.
    expect(steps[landing]).toMatchObject({ key: 'Gross', value: 14_000 });
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
  guests: null,
  zone: 'unset' as const,
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
        guests: null,
        zone: 'unset' as const,
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
        guests: null,
        zone: 'unset' as const,
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

describe('tipsByWeekday', () => {
  const worked = (
    date: string,
    tips: number | null,
    earned = 1_000,
    hasShift = true,
  ): CalendarDayData => ({
    date,
    shifts: hasShift
      ? [
          {
            shift_id: 1,
            name: 'Bar',
            symbol: null,
            colour: null,
            start_time: '18:00',
            end_time: '23:00',
            hours: 5,
            earned,
            revenue: null,
            guests: null,
            zone: 'unset' as const,
            revenue_percent: null,
            worked: true,
            needs_cover: false,
            actual_start: null,
            actual_end: null,
            break_minutes: 0,
          },
        ]
      : [],
    sales: [],
    tips,
    tips_cash: null,
    tip_pool: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    below_floor: false,
    hours: hasShift ? 5 : 0,
    earned,
    planned: 0,
  });

  it('averages over the days worked, not the days counted', () => {
    // Two Fridays at 200 and 400 average 300, however many Mondays there are.
    const rows = tipsByWeekday([
      worked('2026-03-06', 200),
      worked('2026-03-13', 400),
      worked('2026-03-02', 100),
      worked('2026-03-09', 100),
      worked('2026-03-16', 100),
    ]);

    const friday = rows.find((row) => row.weekday === 4);

    expect(friday?.average).toBe(300);
    expect(friday?.days).toBe(2);
  });

  it('leaves a day with no tips figure out rather than calling it zero', () => {
    const rows = tipsByWeekday([worked('2026-03-06', 500), worked('2026-03-13', null)]);

    expect(rows.find((row) => row.weekday === 4)?.days).toBe(1);
    expect(rows.find((row) => row.weekday === 4)?.average).toBe(500);
  });

  it('reports tips as a share of what those days earned', () => {
    const rows = tipsByWeekday([worked('2026-03-06', 250, 1_000)]);

    expect(rows.find((row) => row.weekday === 4)?.share).toBeCloseTo(0.25);
  });

  it('ignores days with nothing worked on them', () => {
    expect(tipsByWeekday([worked('2026-03-06', 900, 0, false)])).toEqual([]);
  });
});
