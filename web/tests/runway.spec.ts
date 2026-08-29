import { describe, expect, it } from 'vitest';

import { buildRunway, chargesAhead } from '@/lib/mono/runway';

describe('the runway', () => {
  const base = {
    balance: 10_000,
    usualPerDay: 500,
    charges: [],
    incomes: [],
    from: '2026-09-01',
    horizon: 10,
  };

  it('walks the balance down by the ordinary day', () => {
    const runway = buildRunway(base)!;

    expect(runway.days[0]).toMatchObject({ day: '2026-09-01', balance: 9_500 });
    expect(runway.days[9]).toMatchObject({ day: '2026-09-10', balance: 5_000 });
  });

  it('lands a charge on its own date, named', () => {
    const runway = buildRunway({
      ...base,
      charges: [{ name: 'Аренда', amount: 8_000, on: '2026-09-05' }],
    })!;

    const rentDay = runway.days.find((day) => day.day === '2026-09-05')!;

    expect(rentDay.balance).toBe(10_000 - 5 * 500 - 8_000);
    expect(rentDay.events).toEqual([{ name: 'Аренда', amount: -8_000 }]);
  });

  it('lands the wage where the reconciliation says it lands', () => {
    const runway = buildRunway({
      ...base,
      charges: [{ name: 'Аренда', amount: 9_000, on: '2026-09-03' }],
      incomes: [{ name: 'Бар', amount: 20_000, on: '2026-09-07' }],
    })!;

    expect(runway.dry).toBe('2026-09-03');
    expect(runway.thinnest.day).toBe('2026-09-06');
    expect(runway.days.at(-1)!.balance).toBeGreaterThan(0);
  });

  it('finds the thinnest day of a stretch that holds', () => {
    const runway = buildRunway({
      ...base,
      incomes: [{ name: 'Бар', amount: 15_000, on: '2026-09-06' }],
    })!;

    expect(runway.dry).toBeNull();
    // The day before the wage is the pinch.
    expect(runway.thinnest.day).toBe('2026-09-05');
    expect(runway.thinnest.balance).toBe(10_000 - 5 * 500);
  });

  it('refuses to forecast from nothing', () => {
    // A flat line at today's balance is the number repeated, not a forecast —
    // drawing it would dress ignorance as stability.
    expect(buildRunway({ ...base, usualPerDay: 0 })).toBeNull();
    expect(
      buildRunway({
        ...base,
        usualPerDay: 0,
        charges: [{ name: 'Аренда', amount: 8_000, on: '2026-09-05' }],
      }),
    ).not.toBeNull();
  });
});

describe('standing charges projected forward', () => {
  it('lands a monthly charge once and a weekly one every week', () => {
    const ahead = chargesAhead(
      [
        { name: 'Аренда', amount: 8_000, next: '2026-09-11', everyDays: 30 },
        { name: 'Спортзал', amount: 300, next: '2026-09-03', everyDays: 7 },
      ],
      '2026-09-01',
      14,
    );

    expect(ahead.filter((c) => c.name === 'Аренда')).toHaveLength(1);
    expect(ahead.filter((c) => c.name === 'Спортзал').map((c) => c.on)).toEqual([
      '2026-09-03',
      '2026-09-10',
    ]);
  });

  it('brings an overdue charge into the first projected day', () => {
    // Rent due yesterday is not cancelled by being late.
    const ahead = chargesAhead(
      [{ name: 'Аренда', amount: 8_000, next: '2026-08-28', everyDays: 30 }],
      '2026-09-01',
      14,
    );

    expect(ahead[0].on).toBe('2026-09-01');
  });

  it('ignores what falls beyond the horizon', () => {
    const ahead = chargesAhead(
      [{ name: 'Аренда', amount: 8_000, next: '2026-10-20', everyDays: 30 }],
      '2026-09-01',
      14,
    );

    expect(ahead).toEqual([]);
  });
});
