import { describe, expect, it } from 'vitest';

import { MonoStatementItem } from '@/lib/mono/mono';
import { categoryDeltas, categoryStyle, dailySpend, merchantsIn, usualDay, monthlyFlows, categoryMonths, cumulativeSpend } from '@/lib/mono/spend-viz';

const item = (over: Partial<MonoStatementItem>): MonoStatementItem => ({
  id: Math.random().toString(36).slice(2),
  time: Math.floor(new Date(`${(over as { day?: string }).day ?? '2026-08-10'}T13:00:00`).getTime() / 1000),
  description: 'Сільпо',
  mcc: 5411,
  originalMcc: 5411,
  amount: -10000,
  operationAmount: -10000,
  currencyCode: 980,
  commissionRate: 0,
  cashbackAmount: 0,
  balance: 100000,
  hold: false,
  ...over,
});

const day = (key: string, amount: number, description = 'Сільпо') =>
  item({
    time: Math.floor(new Date(`${key}T13:00:00`).getTime() / 1000),
    amount: -amount * 100,
    description,
  });

describe('a category keeps its look', () => {
  it('colours follow the entity, never its rank', () => {
    const first = categoryStyle('Продукты');
    const again = categoryStyle('Продукты');

    expect(first).toEqual(again);
    expect(first.hue).not.toBe(categoryStyle('Кафе и бары').hue);
  });

  it('an invented name gets a stable colour too', () => {
    expect(categoryStyle('Кальян')).toEqual(categoryStyle('Кальян'));
  });
});

describe('the daily rhythm', () => {
  it('keeps silent days as zeros so the month has its true width', () => {
    const days = dailySpend(
      [day('2026-08-01', 300), day('2026-08-03', 150), day('2026-08-03', 50)],
      '2026-08-01',
      '2026-08-04',
    );

    expect(days.map((entry) => entry.total)).toEqual([300, 0, 200, 0]);
    expect(days[1].day).toBe('2026-08-02');
  });

  it('says the usual day as a median, which one splurge cannot drag', () => {
    const days = dailySpend(
      [day('2026-08-01', 200), day('2026-08-02', 220), day('2026-08-03', 9000)],
      '2026-08-01',
      '2026-08-03',
    );

    expect(usualDay(days)).toBe(220);
  });
});

describe('categories against last month', () => {
  it('says the change as a signed percent', () => {
    const [groceries] = categoryDeltas(
      [{ name: 'Продукты', total: 5500, count: 9 }],
      [{ name: 'Продукты', total: 5000, count: 8 }],
    );

    expect(groceries.percent).toBe(10);
    expect(groceries.previous).toBe(5000);
  });

  it('refuses to grow from nothing by percent', () => {
    const [fresh] = categoryDeltas(
      [{ name: 'Кальян', total: 700, count: 2 }],
      [],
    );

    // «Новая трата», not «плюс бесконечность процентов».
    expect(fresh.percent).toBeNull();
  });
});

describe('who is inside a category', () => {
  it('merges branches of one shop and keeps the biggest first', () => {
    const merchants = merchantsIn(
      [
        day('2026-08-01', 300, 'СІЛЬПО №41'),
        day('2026-08-02', 200, 'СІЛЬПО №7'),
        day('2026-08-03', 400, 'АТБ'),
      ],
      [],
      'Продукты',
      '2026-08-01',
      '2026-08-31',
    );

    expect(merchants).toHaveLength(2);
    expect(merchants[0].total).toBe(500);
    expect(merchants[0].count).toBe(2);
  });
});

describe('months as in against out', () => {
  it('buckets by month, keeps transfers out of both sides', () => {
    const rows = monthlyFlows(
      [
        day('2026-07-05', 300),
        day('2026-08-02', 200),
        item({ time: Math.floor(new Date('2026-08-05T13:00:00').getTime() / 1000), amount: 500000, description: 'ACQ ZP' }),
        // A card-to-card in August: neither income nor spending here.
        item({ time: Math.floor(new Date('2026-08-06T13:00:00').getTime() / 1000), amount: -100000, mcc: 4829, originalMcc: 4829 }),
      ],
      2,
      new Date('2026-08-20T12:00:00'),
    );

    expect(rows.map((row) => row.month)).toEqual(['2026-07', '2026-08']);
    expect(rows[1].earned).toBe(5000);
    expect(rows[1].spent).toBe(200);
    expect(rows[0].spent).toBe(300);
  });
});

describe('categories month by month', () => {
  it('keeps a category in its slot across months', () => {
    const rows = categoryMonths(
      [
        day('2026-07-03', 400, 'СІЛЬПО'),
        day('2026-08-03', 100, 'СІЛЬПО'),
        item({
          time: Math.floor(new Date('2026-08-04T13:00:00').getTime() / 1000),
          amount: -90000,
          description: 'ZARA',
          mcc: 5651,
          originalMcc: 5651,
        }),
      ],
      [],
      2,
      5,
      new Date('2026-08-20T12:00:00'),
    );

    expect(rows[0].parts).toEqual([{ name: 'Продукты', total: 400 }]);
    // August: clothes outweigh groceries, but groceries keep their slot.
    expect(rows[1].parts.map((part) => part.name)).toContain('Продукты');
    expect(rows[1].parts.find((part) => part.name === 'Одежда')?.total).toBe(900);
  });
});

describe('the pace line', () => {
  it('runs the total day by day so two months can race honestly', () => {
    const line = cumulativeSpend(
      [day('2026-08-01', 100), day('2026-08-03', 50)],
      '2026-08-01',
      '2026-08-04',
    );

    expect(line.map((point) => point.total)).toEqual([100, 100, 150, 150]);
  });
});

