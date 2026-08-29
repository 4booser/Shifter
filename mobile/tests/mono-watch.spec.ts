import { describe, expect, it } from 'vitest';

import { ExpectedWage, MonoStatementItem } from '@/lib/mono';
import { worthWaking, wakingWords } from '@/lib/mono-watch';

const at = (day: string): number => Math.floor(new Date(`${day}T12:00:00`).getTime() / 1000);

const credit = (day: string, minor: number, from = 'ТОВ БАР'): MonoStatementItem =>
  ({
    id: `${day}-${minor}`,
    time: at(day),
    description: from,
    counterName: from,
    mcc: 4829,
    originalMcc: 4829,
    hold: false,
    amount: minor,
    operationAmount: minor,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 1_000_000,
  }) as unknown as MonoStatementItem;

const expected: ExpectedWage = {
  locationId: 7,
  locationName: 'Бар',
  periodFrom: '2026-08-01',
  periodTo: '2026-08-15',
  amount: 25_900,
  due: '2026-08-20',
};

const watch = (over: Partial<Parameters<typeof worthWaking>[1]> = {}) => ({
  expected,
  payers: [],
  told: [],
  ...over,
});

describe('whether an arrival is worth waking somebody for', () => {
  it('notices the wage landing near its day', () => {
    const waking = worthWaking([credit('2026-08-20', 2_590_000)], watch())!;

    expect(waking.match.total).toBe(25_900);
    expect(waking.period).toBe('7:2026-08-01');
  });

  it('accepts a wage that is not to the hryvnia', () => {
    // Tax, an advance already taken, a fine — a wage is rarely the figure the
    // app computed, and insisting on it would mean never noticing one.
    expect(worthWaking([credit('2026-08-21', 2_400_000)], watch())).not.toBeNull();
  });

  it('ignores a credit that is not the wage arriving', () => {
    // Telling somebody their wage came when a friend paid them back is worse
    // than saying nothing at all.
    expect(worthWaking([credit('2026-08-20', 400_000)], watch())).toBeNull();
  });

  it('says nothing when no wage is due', () => {
    expect(worthWaking([credit('2026-08-20', 2_590_000)], watch({ expected: null }))).toBeNull();
  });

  it('announces one wage once', () => {
    // The task runs on whatever schedule the system feels like, and a second
    // notification about the same money reads as a second payment.
    const already = watch({ told: ['7:2026-08-01'] });

    expect(worthWaking([credit('2026-08-20', 2_590_000)], already)).toBeNull();
  });

  it('ignores money that arrived nowhere near the day', () => {
    expect(worthWaking([credit('2026-07-04', 2_590_000)], watch())).toBeNull();
  });

  it('ignores what has not settled', () => {
    const pending = { ...credit('2026-08-20', 2_590_000), hold: true };

    expect(worthWaking([pending], watch())).toBeNull();
  });
});

describe('what the notification says', () => {
  const money = (value: number) => `${value} ₴`;

  it('reports and asks rather than announcing', () => {
    // The app matched a credit against a figure it worked out itself. The
    // person is the one who knows whether that credit is their wage.
    const waking = worthWaking([credit('2026-08-20', 2_590_000)], watch())!;
    const words = wakingWords(waking, 'Бар', money);

    expect(words.title).toContain('Похоже');
    expect(words.body).toContain('Проверить?');
    expect(words.body).not.toContain('вам заплатили');
  });

  it('says how short it looks when it looks short', () => {
    const waking = worthWaking([credit('2026-08-20', 2_200_000)], watch())!;

    expect(wakingWords(waking, 'Бар', money).body).toContain('15% меньше');
  });

  it('does not call a wage short over a rounding', () => {
    const waking = worthWaking([credit('2026-08-20', 2_589_000)], watch())!;

    expect(wakingWords(waking, 'Бар', money).body).not.toContain('меньше');
  });
});
