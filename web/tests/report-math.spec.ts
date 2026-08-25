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
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
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
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
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
      tip_out: 0,
      deductions: 0,
      note: null,
      colour: null,
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
