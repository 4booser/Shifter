/*
 * The same tests as on the phone, over the same code. If a platform ever
 * needs its own copy of one of these, something upstream has already gone
 * wrong.
 */
import { describe, expect, it } from 'vitest';

import { MonoStatementItem } from '@/lib/mono/mono';
import {
  cashGap,
  cashTipOffers,
  closingCosts,
  looksLikeCashIn,
  punctuality,
  realHourly,
  spendingByDayKind,
  untilPayday,
  usualDay,
  workedDays,
} from '@/lib/mono/mono-work';
import { WorkedDay } from '@/lib/mono/mono-work';

const at = (day: string, hour = 12, minute = 0): number =>
  Math.floor(
    new Date(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`).getTime()
    / 1000,
  );

const item = (over: Partial<MonoStatementItem> & { day?: string; hour?: number }): MonoStatementItem => {
  const { day, hour, ...rest } = over;

  return {
    id: Math.random().toString(36).slice(2),
    time: at(day ?? '2026-08-10', hour ?? 12),
    description: 'Something',
    mcc: 5411,
    originalMcc: 5411,
    hold: false,
    amount: -10000,
    operationAmount: -10000,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 100000,
    ...rest,
  };
};

const day = (
  date: string,
  over: Partial<WorkedDay> & { start?: string; end?: string; hours?: number } = {},
): WorkedDay => {
  const { start, end, hours, ...rest } = over;
  const worked = over.shifts !== undefined ? over.shifts : start === undefined ? [] : [
    {
      shift_id: 1,
      name: 'Вечер',
      symbol: null,
      colour: null,
      start_time: start,
      end_time: end ?? '02:00',
      hours: hours ?? 9.5,
      earned: 1_710,
      revenue: null,
      guests: null,
      zone: 'unset' as const,
      revenue_percent: null,
      worked: true,
      needs_cover: false,
      actual_start: null,
      actual_end: null,
      break_minutes: 30,
    },
  ];

  return {
    date,
    shifts: worked,
    tips: null,
    tips_cash: null,
    tip_pool: null,
    deductions: 0,
    note: null,
    colour: null,
    hours: worked.reduce((sum, entry) => sum + entry.hours, 0),
    earned: worked.reduce((sum, entry) => sum + (entry as { earned: number }).earned, 0),
    planned: 0,
    ...rest,
  } as WorkedDay;
};

describe('which days were worked', () => {
  it('counts a worked shift and not a planned one', () => {
    const days = [
      day('2026-08-01', { start: '16:00' }),
      day('2026-08-02'),
    ];

    expect([...workedDays(days)]).toEqual(['2026-08-01']);
  });
});

describe('what a working day costs before it pays anything', () => {
  const rota = () =>
    Array.from({ length: 12 }, (_, index) => {
      const date = `2026-08-${String(index + 1).padStart(2, '0')}`;

      return index % 2 === 0 ? day(date, { start: '16:00' }) : day(date);
    });

  it('says nothing when there are not enough of either kind of day', () => {
    // Two shifts is not a sample, and an average of two numbers presented as
    // a habit is a lie with a decimal point in it.
    const days = [day('2026-08-01', { start: '16:00' }), day('2026-08-02')];

    expect(spendingByDayKind([], days, '2026-08-01', '2026-08-31')).toBeNull();
  });

  it('compares the two kinds of day', () => {
    const items = [
      // Taxi home on two working days.
      item({ day: '2026-08-01', mcc: 4121, amount: -30000 }),
      item({ day: '2026-08-03', mcc: 4121, amount: -30000 }),
      // Groceries on a day off.
      item({ day: '2026-08-02', mcc: 5411, amount: -12000 }),
    ];

    const split = spendingByDayKind(items, rota(), '2026-08-01', '2026-08-12')!;

    expect(split.onShiftDays).toBe(6);
    expect(split.offDays).toBe(6);
    expect(split.onShift).toBe(100);
    expect(split.off).toBe(20);
    expect(split.differences[0].kind).toBe('transport');
  });

  it('leaves out categories where the day off costs more', () => {
    const items = [item({ day: '2026-08-02', mcc: 5411, amount: -50000 })];

    const split = spendingByDayKind(items, rota(), '2026-08-01', '2026-08-12')!;

    expect(split.differences).toEqual([]);
  });
});

describe('what an hour is really worth', () => {
  it('takes the cost of getting there out of the hour', () => {
    const days = [day('2026-08-01', { start: '16:00', hours: 10 })];
    const items = [item({ day: '2026-08-01', mcc: 4121, amount: -21000 })];

    const rate = realHourly(items, days, '2026-08-01', '2026-08-31')!;

    expect(rate.hours).toBe(10);
    expect(rate.headline).toBe(171);
    expect(rate.costs).toBe(210);
    expect(rate.real).toBe(150);
  });

  it('does not count a supermarket run as the cost of working', () => {
    // Counting every purchase on a working day would make every job look
    // ruinous, and would be about groceries rather than about work.
    const days = [day('2026-08-01', { start: '16:00', hours: 10 })];
    const items = [item({ day: '2026-08-01', mcc: 5411, amount: -50000 })];

    const rate = realHourly(items, days, '2026-08-01', '2026-08-31')!;

    expect(rate.costs).toBe(0);
    expect(rate.real).toBe(rate.headline);
  });

  it('ignores spending on a day nobody worked', () => {
    const days = [day('2026-08-01', { start: '16:00', hours: 10 }), day('2026-08-02')];
    const items = [item({ day: '2026-08-02', mcc: 4121, amount: -50000 })];

    expect(realHourly(items, days, '2026-08-01', '2026-08-31')!.costs).toBe(0);
  });

  it('has nothing to say about a month with no hours in it', () => {
    expect(realHourly([], [day('2026-08-02')], '2026-08-01', '2026-08-31')).toBeNull();
  });
});

describe('what closing costs', () => {
  it('finds the fare home after a shift that ended overnight', () => {
    const days = [day('2026-08-01', { start: '16:00', end: '02:00' })];
    // The ride is at two in the morning of the 2nd, half an hour after close.
    const ride = item({ day: '2026-08-02', hour: 2, mcc: 4121, amount: -28000 });

    const cost = closingCosts([ride], days, '2026-08-01', '2026-08-31');

    expect(cost.closings).toBe(1);
    expect(cost.ride).toBe(280);
    expect(cost.earned).toBe(1_710);
  });

  it('leaves out a taxi taken in the middle of the afternoon', () => {
    const days = [day('2026-08-01', { start: '16:00', end: '02:00' })];
    const ride = item({ day: '2026-08-01', hour: 14, mcc: 4121, amount: -28000 });

    expect(closingCosts([ride], days, '2026-08-01', '2026-08-31').ride).toBe(0);
  });

  it('does not call a day shift a close', () => {
    const days = [day('2026-08-01', { start: '10:00', end: '18:00' })];

    expect(closingCosts([], days, '2026-08-01', '2026-08-31').closings).toBe(0);
  });
});

describe('how much there is per day until the next money', () => {
  it('takes what still has to leave out of what is left', () => {
    const state = untilPayday(2_740, 9, 700, 480)!;

    expect(state.perDay).toBeCloseTo(226.67, 2);
    expect(state.usual).toBe(480);
  });

  it('says nothing when the money has already landed', () => {
    expect(untilPayday(2_740, 0, 0, 480)).toBeNull();
  });

  it('averages a day over the days there is a record for', () => {
    const items = [
      item({ day: '2026-08-01', amount: -20000 }),
      item({ day: '2026-08-01', amount: -10000 }),
      item({ day: '2026-08-03', amount: -30000 }),
    ];

    // Two days with anything on them, six hundred between them.
    expect(usualDay(items, '2026-08-01', '2026-08-31')).toBe(300);
  });
});

describe('whether a place pays when it says it will', () => {
  const period = (over: Partial<Parameters<typeof punctuality>[0][number]>) => ({
    location_id: 1,
    location_name: 'Бар Дым',
    due_on: '2026-08-10',
    period_to: '2026-07-31',
    expected: 18_000,
    paid: 18_000,
    days_late: 0,
    ...over,
  });

  it('says nothing about a place with fewer than three settled periods', () => {
    // One late wage is a story about one month, not about an employer.
    const rows = punctuality([
      period({ days_late: 5, period_to: '2026-06-30' }),
      period({ days_late: 9, period_to: '2026-07-31' }),
    ]);

    expect(rows).toEqual([]);
  });

  it('averages the lateness and keeps the worst one', () => {
    // An average of two hides a fourteen, so both are reported.
    const rows = punctuality([
      period({ days_late: 0, period_to: '2026-06-15' }),
      period({ days_late: 1, period_to: '2026-06-30' }),
      period({ days_late: 14, period_to: '2026-07-15' }),
    ]);

    expect(rows[0].settled).toBe(3);
    expect(rows[0].averageLate).toBe(5);
    expect(rows[0].worstLate).toBe(14);
  });

  it('counts short payments apart from late ones', () => {
    // Different complaints and different conversations; one number supporting
    // both would support neither.
    const rows = punctuality([
      period({ period_to: '2026-06-15', paid: 12_000 }),
      period({ period_to: '2026-06-30' }),
      period({ period_to: '2026-07-15', days_late: 4 }),
    ]);

    expect(rows[0].short).toBe(1);
    expect(rows[0].averageLate).toBeCloseTo(1.33, 2);
  });

  it('leaves out a period nobody has paid yet', () => {
    // Not a place being late; a place whose turn has not come.
    const rows = punctuality([
      period({ period_to: '2026-06-15' }),
      period({ period_to: '2026-06-30' }),
      period({ period_to: '2026-07-15' }),
      period({ period_to: '2026-07-31', paid: 0, days_late: 40 }),
    ]);

    expect(rows[0].settled).toBe(3);
    expect(rows[0].worstLate).toBe(0);
  });

  it('shows the last three, newest first', () => {
    const rows = punctuality([
      period({ period_to: '2026-05-31', days_late: 9 }),
      period({ period_to: '2026-06-30', days_late: 3 }),
      period({ period_to: '2026-07-15', days_late: 1 }),
      period({ period_to: '2026-07-31', days_late: 0 }),
    ]);

    expect(rows[0].recent.map((one) => one.period)).toEqual([
      '2026-07-31',
      '2026-07-15',
      '2026-06-30',
    ]);
  });

  it('puts the worst payer first', () => {
    const rows = punctuality([
      ...[1, 2, 3].map((n) => period({ period_to: `2026-0${n + 4}-15`, days_late: 1 })),
      ...[1, 2, 3].map((n) =>
        period({ location_id: 2, location_name: 'Кофейня', period_to: `2026-0${n + 4}-15`, days_late: 8 }),
      ),
    ]);

    expect(rows.map((row) => row.place)).toEqual(['Кофейня', 'Бар Дым']);
  });
});

describe('cash that reached the card', () => {
  it('recognises a top-up by its code and by the words the bank uses', () => {
    expect(looksLikeCashIn(item({ amount: 200000, mcc: 6010 }))).toBe(true);
    expect(looksLikeCashIn(item({ amount: 200000, description: 'Поповнення через касу' }))).toBe(true);
    // Money going the other way is not a top-up whatever it is called.
    expect(looksLikeCashIn(item({ amount: -200000, mcc: 6010 }))).toBe(false);
  });

  it('asks about cash banked the morning after a shift', () => {
    const days = [day('2026-08-01', { start: '16:00', end: '02:00' }), day('2026-08-02')];
    const topUp = item({ day: '2026-08-02', hour: 11, amount: 120000, mcc: 6010 });

    const offers = cashTipOffers([topUp], days, '2026-08-01', '2026-08-31');

    expect(offers).toHaveLength(1);
    expect(offers[0].after).toBe('2026-08-01');
    expect(offers[0].amount).toBe(1_200);
  });

  it('says nothing about cash banked on a week off', () => {
    // Later than the morning after and the link is a story rather than an
    // observation.
    const days = [day('2026-08-01', { start: '16:00' }), day('2026-08-06')];
    const topUp = item({ day: '2026-08-06', amount: 120000, mcc: 6010 });

    expect(cashTipOffers([topUp], days, '2026-08-01', '2026-08-31')).toEqual([]);
  });

  it('does not offer the same top-up twice', () => {
    const days = [day('2026-08-01', { start: '16:00' })];
    const topUp = item({ day: '2026-08-01', amount: 120000, mcc: 6010 });

    expect(
      cashTipOffers([topUp], days, '2026-08-01', '2026-08-31', new Set([topUp.id])),
    ).toEqual([]);
  });

  it('shows what was written down against what was banked', () => {
    const days = [
      day('2026-08-01', { start: '16:00', tips_cash: 900 }),
      day('2026-08-02', { start: '16:00', tips_cash: 500 }),
    ];
    const topUp = item({ day: '2026-08-02', amount: 200000, mcc: 6010 });

    const gap = cashGap([topUp], days, '2026-08-01', '2026-08-31');

    expect(gap.declared).toBe(1_400);
    expect(gap.bankedAfterShifts).toBe(2_000);
  });
});
