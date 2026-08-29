import { describe, expect, it } from 'vitest';

import { MonoStatementItem } from '@/lib/mono';
import {
  balanceCurve,
  biggestDays,
  monthDelta,
  spendingHeat,
  weekdayShape,
  yearOfStanding,
} from '@/lib/mono-shape';

const at = (day: string, hour = 12): number =>
  Math.floor(new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).getTime() / 1000);

const item = (over: Partial<MonoStatementItem> & { day?: string; hour?: number }): MonoStatementItem => {
  const { day, hour, ...rest } = over;

  return {
    id: Math.random().toString(36).slice(2),
    time: at(day ?? '2026-08-10', hour ?? 12),
    description: 'SILPO',
    mcc: 5411,
    originalMcc: 5411,
    hold: false,
    amount: -10_000,
    operationAmount: -10_000,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 1_000_000,
    ...rest,
  };
};

describe('the balance curve', () => {
  it('reads the bank’s own running balance rather than reconstructing one', () => {
    // monobank stamps the balance onto every transaction — the one figure on
    // the page nobody has to trust our arithmetic for.
    const curve = balanceCurve(
      [
        item({ day: '2026-08-01', balance: 500_000 }),
        item({ day: '2026-08-03', balance: 300_000 }),
      ],
      '2026-08-01',
      '2026-08-31',
    )!;

    expect(curve[0]).toEqual({ day: '2026-08-01', balance: 5_000 });
    expect(curve.at(-1)).toEqual({ day: '2026-08-03', balance: 3_000 });
  });

  it('carries quiet days forward, which is a fact and not an estimate', () => {
    // A balance nothing touched did not move.
    const curve = balanceCurve(
      [
        item({ day: '2026-08-01', balance: 500_000 }),
        item({ day: '2026-08-04', balance: 200_000 }),
      ],
      '2026-08-01',
      '2026-08-31',
    )!;

    expect(curve.map((point) => point.day)).toEqual([
      '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04',
    ]);
    expect(curve[1].balance).toBe(5_000);
    expect(curve[2].balance).toBe(5_000);
  });

  it('lets the later transaction of a day speak for it', () => {
    const curve = balanceCurve(
      [
        item({ day: '2026-08-01', hour: 9, balance: 500_000 }),
        item({ day: '2026-08-01', hour: 21, balance: 450_000 }),
        item({ day: '2026-08-02', balance: 400_000 }),
      ],
      '2026-08-01',
      '2026-08-31',
    )!;

    expect(curve[0].balance).toBe(4_500);
  });

  it('is nothing rather than a dot', () => {
    // One day of statement is a dot wearing a chart's clothes.
    expect(balanceCurve([item({ day: '2026-08-01' })], '2026-08-01', '2026-08-31')).toBeNull();
    expect(balanceCurve([], '2026-08-01', '2026-08-31')).toBeNull();
  });
});

describe('the shape of the week', () => {
  it('averages by weekday rather than totalling', () => {
    // A month holds five Saturdays and four Mondays; totals would crown
    // Saturday for the calendar's sake.
    const shape = weekdayShape(
      [
        // Two Mondays, 100 and 300.
        item({ day: '2026-08-03', amount: -10_000 }),
        item({ day: '2026-08-10', amount: -30_000 }),
        // One Saturday, 500.
        item({ day: '2026-08-08', amount: -50_000 }),
      ],
      '2026-08-01',
      '2026-08-31',
    );

    expect(shape[0]).toEqual({ weekday: 0, average: 200, days: 2 });
    expect(shape[5]).toEqual({ weekday: 5, average: 500, days: 1 });
    expect(shape[6].days).toBe(0);
  });

  it('starts the week on Monday, the way the trade counts it', () => {
    const shape = weekdayShape(
      [item({ day: '2026-08-02', amount: -10_000 })], // a Sunday
      '2026-08-01',
      '2026-08-31',
    );

    expect(shape[6].days).toBe(1);
  });
});

describe('the days that carried the month', () => {
  it('finds the heavy days and what most of each was', () => {
    const days = biggestDays(
      [
        item({ day: '2026-08-05', amount: -80_000, description: 'ROZETKA' }),
        item({ day: '2026-08-05', amount: -20_000, description: 'SILPO' }),
        item({ day: '2026-08-12', amount: -30_000, description: 'WOG' }),
      ],
      '2026-08-01',
      '2026-08-31',
      2,
    );

    expect(days[0]).toEqual({
      day: '2026-08-05', spent: 1_000, mostly: 'ROZETKA', mostlyAmount: 800,
    });
    expect(days[1].day).toBe('2026-08-12');
  });

  it('ignores income and holds', () => {
    expect(
      biggestDays(
        [
          item({ day: '2026-08-05', amount: 80_000 }),
          item({ day: '2026-08-06', amount: -80_000, hold: true }),
        ],
        '2026-08-01',
        '2026-08-31',
      ),
    ).toEqual([]);
  });
});

describe('the heat of the days', () => {
  it('scales against the heaviest day in range', () => {
    const heat = spendingHeat(
      [
        item({ day: '2026-08-05', amount: -40_000 }),
        item({ day: '2026-08-06', amount: -10_000 }),
      ],
      '2026-08-01',
      '2026-08-31',
    );

    expect(heat[0].heat).toBe(1);
    expect(heat[1].heat).toBe(0.25);
  });
});

describe('this month against the one before', () => {
  const kind = (item_: MonoStatementItem) => (item_.mcc === 5411 ? 'Продукты' : 'Прочее');

  it('names the category that moved rather than just the total', () => {
    const delta = monthDelta(
      [
        item({ day: '2026-07-10', amount: -10_000 }),
        item({ day: '2026-08-10', amount: -40_000 }),
        item({ day: '2026-08-11', amount: -5_000, mcc: 5812 }),
        item({ day: '2026-07-11', amount: -5_000, mcc: 5812 }),
      ],
      kind,
      '2026-08-01', '2026-08-31',
      '2026-07-01', '2026-07-31',
    )!;

    expect(delta.now).toBe(450);
    expect(delta.before).toBe(150);
    expect(delta.moves[0]).toEqual({ name: 'Продукты', now: 400, before: 100 });
  });

  it('says nothing against an empty month', () => {
    // Against nothing, every figure is an infinite increase — a chart, not a
    // finding.
    expect(
      monthDelta(
        [item({ day: '2026-08-10' })],
        kind,
        '2026-08-01', '2026-08-31',
        '2026-07-01', '2026-07-31',
      ),
    ).toBeNull();
  });
});

describe('a year of a subscription', () => {
  it('multiplies the small-sounding figure by twelve', () => {
    expect(yearOfStanding(199)).toBe(2_388);
  });
});
