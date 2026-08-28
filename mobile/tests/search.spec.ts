import { describe, expect, it } from 'vitest';

import { MonoStatementItem } from '@/lib/mono';
import { searchDays, searchStatement } from '@/lib/search';
import { CalendarDayData } from '@/lib/types';

const day = (over: Partial<CalendarDayData>): CalendarDayData => ({
  date: '2026-08-19',
  shifts: [],
  tips: null,
  tips_cash: null,
  tip_pool: null,
  deductions: 0,
  note: null,
  colour: null,
  hours: 0,
  earned: 0,
  planned: 0,
  ...over,
});

const shift = (name: string) => ({
  shift_id: 1,
  name,
  symbol: null,
  colour: null,
  start_time: '17:00',
  end_time: '01:00',
  hours: 7.5,
  worked: true,
  needs_cover: false,
  actual_start: null,
  actual_end: null,
  break_minutes: null,
  earned: 1650,
  revenue: null,
  revenue_percent: null,
});

const tx = (over: Partial<MonoStatementItem>): MonoStatementItem => ({
  id: 'x',
  time: Math.floor(new Date('2026-08-19T20:00:00').getTime() / 1000),
  description: 'Сільпо',
  mcc: 5411,
  originalMcc: 5411,
  hold: false,
  amount: -47600,
  operationAmount: -47600,
  currencyCode: 980,
  commissionRate: 0,
  cashbackAmount: 0,
  balance: 100000,
  ...over,
});

/**
 * What people remember about a shift is not its date. It is the note they
 * left, the name of the shift, or the number.
 */
describe('finding a day', () => {
  const days = [
    day({ date: '2026-08-19', shifts: [shift('Вечер')], earned: 1650, note: 'Свадьба в зале' }),
    day({ date: '2026-03-02', shifts: [shift('Ночь')], earned: 2995 }),
    day({ date: '2026-01-05', earned: 0, planned: 800 }),
  ];

  it('finds a day by the note somebody left on it', () => {
    const hits = searchDays(days, 'свадьба');

    expect(hits).toHaveLength(1);
    expect(hits[0].date).toBe('2026-08-19');
  });

  it('ignores the case of the note', () => {
    expect(searchDays(days, 'СВАДЬБА')).toHaveLength(1);
  });

  it('finds a day by the name of the shift', () => {
    expect(searchDays(days, 'ночь')[0].date).toBe('2026-03-02');
  });

  it('finds a month by its date', () => {
    expect(searchDays(days, '2026-03')[0].date).toBe('2026-03-02');
  });

  it('treats a number as money, not as text', () => {
    // "the night I made three thousand" — which was actually 2 995.
    const hits = searchDays(days, '3000');

    expect(hits.map((hit) => hit.date)).toEqual(['2026-03-02']);
  });

  it('does not stretch that to any number nearby', () => {
    expect(searchDays(days, '3400')).toEqual([]);
  });

  it('finds a day by what it is still only planned to pay', () => {
    expect(searchDays(days, '800')[0].date).toBe('2026-01-05');
  });

  it('says nothing for a query too short to mean anything', () => {
    expect(searchDays(days, 'в')).toEqual([]);
    expect(searchDays(days, '')).toEqual([]);
  });

  it('reads a four-digit query as both a year and an amount', () => {
    // "2026" is the only way somebody asks for a whole year, and also a
    // perfectly plausible wage.
    const withWage = [...days, day({ date: '2025-12-01', earned: 2030 })];

    expect(searchDays(withWage, '2026').map((hit) => hit.date)).toContain('2026-08-19');
    expect(searchDays(withWage, '2026').map((hit) => hit.date)).toContain('2025-12-01');
  });

  it('puts the newest first', () => {
    expect(searchDays(days, '2026').map((hit) => hit.date)).toEqual([
      '2026-08-19',
      '2026-03-02',
      '2026-01-05',
    ]);
  });
});

describe('finding a transaction', () => {
  const items = [
    tx({ id: 'a', description: 'Сільпо', amount: -47600 }),
    tx({ id: 'b', description: 'Зарахування', amount: 1820500, counterName: 'ТОВ БАР' }),
    tx({ id: 'c', description: 'Bolt', amount: -21000, hold: true }),
  ];

  it('finds it by the merchant', () => {
    expect(searchStatement(items, 'сільпо')[0].amount).toBe(-476);
  });

  it('finds a credit by who sent it', () => {
    expect(searchStatement(items, 'тов бар')[0].amount).toBe(18205);
  });

  it('finds one by its amount, ignoring the sign', () => {
    expect(searchStatement(items, '476').map((hit) => hit.title)).toEqual(['Сільпо']);
  });

  it('marks a transaction the bank has not settled', () => {
    expect(searchStatement(items, 'bolt')[0].meta).toBe('не подтверждено');
  });

  it('says nothing about an empty statement', () => {
    expect(searchStatement([], 'что угодно')).toEqual([]);
  });
});
