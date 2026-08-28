import { describe, expect, it } from 'vitest';

import {
  byDay,
  categoryOf,
  currencyOf,
  dayOf,
  fromMinor,
  income,
  kindForMcc,
  MAX_WINDOW_SECONDS,
  moneyLasted,
  MonoStatementItem,
  normalisePayer,
  periodTotals,
  payerKey,
  payerName,
  spendingByCategory,
  spent,
  statementWindows,
  wageCandidates,
  workSpending,
} from '@/lib/mono';

/** A statement line, with only the fields a test cares about spelled out. */
const item = (over: Partial<MonoStatementItem>): MonoStatementItem => ({
  id: 'x',
  time: Math.floor(new Date('2026-08-10T12:00:00').getTime() / 1000),
  description: 'Something',
  mcc: 4829,
  originalMcc: 4829,
  hold: false,
  amount: -10000,
  operationAmount: -10000,
  currencyCode: 980,
  commissionRate: 0,
  cashbackAmount: 0,
  balance: 100000,
  ...over,
});

const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

/**
 * The bank sends hundredths and a sign. Getting either wrong is not a rounding
 * error — it is a wage a hundred times too big, or a purchase counted as pay.
 */
describe('money as the bank sends it', () => {
  it('reads hundredths as whole money', () => {
    expect(fromMinor(2590000)).toBe(25900);
    expect(fromMinor(1)).toBe(0.01);
    expect(fromMinor(0)).toBe(0);
  });

  it('counts only credits as income, and only debits as spending', () => {
    expect(income(item({ amount: 2590000 }))).toBe(25900);
    expect(income(item({ amount: -2590000 }))).toBe(0);
    expect(spent(item({ amount: -35000 }))).toBe(350);
    expect(spent(item({ amount: 35000 }))).toBe(0);
  });

  it('names the currencies this trade actually meets', () => {
    expect(currencyOf(980)).toBe('UAH');
    expect(currencyOf(985)).toBe('PLN');
    expect(currencyOf(978)).toBe('EUR');
  });

  it('leaves an unknown code as itself rather than guessing', () => {
    expect(currencyOf(1)).toBe('1');
  });

  it('dates a transaction in local time, not UTC', () => {
    // The bug this rules out: a shift that ends at half past midnight is
    // filed on the previous day everywhere east of Greenwich.
    expect(dayOf(item({ time: at('2026-08-10T00:30:00') }))).toBe('2026-08-10');
    expect(dayOf(item({ time: at('2026-08-10T23:45:00') }))).toBe('2026-08-10');
  });
});

describe('splitting a range into windows the endpoint accepts', () => {
  it('asks once for anything inside the limit', () => {
    const windows = statementWindows(at('2026-08-01T00:00:00'), at('2026-08-20T00:00:00'));

    expect(windows).toHaveLength(1);
    expect(windows[0].from).toBe(at('2026-08-01T00:00:00'));
  });

  it('breaks a year into windows, newest first, none over the limit', () => {
    const windows = statementWindows(at('2025-08-28T00:00:00'), at('2026-08-28T00:00:00'));

    expect(windows.length).toBeGreaterThanOrEqual(12);
    expect(windows.every((w) => w.to - w.from <= MAX_WINDOW_SECONDS)).toBe(true);
    expect(windows[0].to).toBe(at('2026-08-28T00:00:00'));
  });

  it('leaves no gap between windows', () => {
    const windows = statementWindows(at('2026-01-01T00:00:00'), at('2026-08-01T00:00:00'));

    for (let index = 1; index < windows.length; index++) {
      expect(windows[index].to).toBe(windows[index - 1].from);
    }
  });

  it('asks for nothing where there is no range', () => {
    expect(statementWindows(at('2026-08-01T00:00:00'), at('2026-08-01T00:00:00'))).toEqual([]);
  });
});

describe('spending that might belong to a shift', () => {
  const worked = new Set(['2026-08-10']);

  it('offers a taxi on a night somebody worked', () => {
    const rows = workSpending([item({ mcc: 4121, amount: -18000 })], worked);

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('transport');
    expect(rows[0].sure).toBe(true);
  });

  it('says nothing about a day off', () => {
    expect(workSpending([item({ mcc: 4121 })], new Set(['2026-08-11']))).toEqual([]);
  });

  it('ignores a category that means nothing to this app', () => {
    expect(workSpending([item({ mcc: 7995 })], worked)).toEqual([]);
  });

  it('offers a restaurant but does not claim to be sure about it', () => {
    const rows = workSpending([item({ mcc: 5812, amount: -22000 })], worked);

    expect(rows[0].kind).toBe('food');
    expect(rows[0].sure).toBe(false);
  });

  it('never offers money coming in as a cost', () => {
    expect(workSpending([item({ mcc: 4121, amount: 18000 })], worked)).toEqual([]);
  });

  it('leaves an unsettled transaction alone', () => {
    expect(workSpending([item({ mcc: 4121, hold: true })], worked)).toEqual([]);
  });

  it('maps the categories it claims to', () => {
    expect(kindForMcc(4111)?.kind).toBe('transport');
    expect(kindForMcc(5137)?.kind).toBe('uniform');
    expect(kindForMcc(8220)?.kind).toBe('training');
    expect(kindForMcc(9999)).toBeNull();
  });
});

describe('finding the wage in a statement', () => {
  const expected = {
    locationId: 1,
    locationName: 'Bar Kyiv',
    periodFrom: '2026-07-10',
    periodTo: '2026-08-09',
    amount: 25900,
    due: '2026-08-10',
  };

  const wage = item({
    id: 'wage',
    time: at('2026-08-10T09:12:00'),
    amount: 2590000,
    counterName: 'ТОВ БАР',
  });

  it('finds a credit on the day it was due', () => {
    const [best] = wageCandidates([wage], expected, []);

    expect(best.total).toBe(25900);
    expect(best.difference).toBe(0);
  });

  it('ignores money that left the account', () => {
    expect(wageCandidates([item({ amount: -2590000 })], expected, [])).toEqual([]);
  });

  it('ignores a credit weeks away from the payday', () => {
    expect(wageCandidates([{ ...wage, time: at('2026-07-01T09:00:00') }], expected, [])).toEqual([]);
  });

  it('puts a payer it has seen before ahead of a stranger with the same gap', () => {
    const stranger = { ...wage, id: 'other', counterName: 'Хтось', amount: 2590000 };
    const [best] = wageCandidates([stranger, wage], expected, [payerKey(wage)]);

    expect(best.items[0].id).toBe('wage');
    expect(best.known).toBe(true);
  });

  it('offers an advance and the rest as one wage', () => {
    const advance = { ...wage, id: 'advance', time: at('2026-08-05T10:00:00'), amount: 1000000 };
    const rest = { ...wage, id: 'rest', time: at('2026-08-10T10:00:00'), amount: 1590000 };

    const pair = wageCandidates([advance, rest], expected, []).find((m) => m.items.length === 2);

    expect(pair?.total).toBe(25900);
    expect(pair?.difference).toBe(0);
  });

  it('does not pair a trivial credit with the wage', () => {
    // A refunded coffee and the wage add up to about the wage. Each half has
    // to be a real part of it.
    const full = { ...wage, id: 'a', amount: 2590000 };
    const crumb = { ...wage, id: 'b', amount: 5000, counterName: 'Повернення' };

    expect(wageCandidates([full, crumb], expected, []).some((m) => m.items.length === 2))
      .toBe(false);
  });

  it('does not offer a credit on its own once it is half of a better pair', () => {
    // "₴18 205 — меньше на 35%" printed under the pair that makes the full
    // wage is how somebody ends up believing the wrong one.
    const advance = { ...wage, id: 'advance', time: at('2026-08-05T10:00:00'), amount: 1000000 };
    const rest = { ...wage, id: 'rest', time: at('2026-08-10T10:00:00'), amount: 1590000 };

    const found = wageCandidates([advance, rest], expected, []);

    expect(found).toHaveLength(1);
    expect(found[0].items).toHaveLength(2);
    expect(found[0].difference).toBe(0);
  });

  it('says how far short a payment fell, as a share', () => {
    const short = { ...wage, amount: 2331000 };
    const [best] = wageCandidates([short], expected, []);

    expect(Math.round(best.difference * 100)).toBe(-10);
  });

  it('divides by nothing rather than by zero where nothing was expected', () => {
    const [best] = wageCandidates([wage], { ...expected, amount: 0 }, []);

    expect(best.difference).toBe(0);
  });
});

/**
 * One venue pays from more than one place: the official wage from a company,
 * the remainder from a sole trader or the manager's own card. Everything here
 * exists because remembering a single payer per place would have matched half
 * of somebody's money and left the other half looking like a stranger.
 */
describe('a venue that pays from several payers', () => {
  const expected = {
    locationId: 1,
    locationName: 'Bar Kyiv',
    periodFrom: '2026-07-10',
    periodTo: '2026-08-09',
    amount: 25900,
    due: '2026-08-10',
  };

  const company = item({
    id: 'company',
    time: at('2026-08-10T09:00:00'),
    amount: 1590000,
    counterName: 'ТОВ "БАР"',
    counterEdrpou: '12345678',
  });

  const director = item({
    id: 'director',
    time: at('2026-08-05T18:00:00'),
    amount: 1000000,
    counterName: 'Петренко П. П.',
    counterIban: 'UA213223130000026007233566001',
  });

  it('pairs two different payers once both are known for the place', () => {
    const pair = wageCandidates(
      [company, director],
      expected,
      [payerKey(company), payerKey(director)],
    ).find((m) => m.items.length === 2);

    expect(pair?.total).toBe(25900);
    expect(pair?.known).toBe(true);
    expect(pair?.payers).toHaveLength(2);
  });

  it('offers the pair the very first month, when neither payer is known yet', () => {
    // The evidence is that the two together land on what was expected. Waiting
    // for a known payer means the first month reads as a 35% underpayment.
    const pair = wageCandidates([company, director], expected, [])
      .find((m) => m.items.length === 2);

    expect(pair?.total).toBe(25900);
    // Offered as a question, not as an answer.
    expect(pair?.known).toBe(false);
    expect(pair?.payers).toContain(payerKey(director));
    expect(pair?.payers).toContain(payerKey(company));
  });

  it('remembers a company by its registration code, whatever the name looks like', () => {
    const spelled = { ...company, counterName: 'ТОВ БАР' };

    expect(payerKey(spelled)).toBe(payerKey(company));
  });

  it('remembers a person by their account number', () => {
    const renamed = { ...director, counterName: 'ПЕТРЕНКО ПЕТРО' };

    expect(payerKey(renamed)).toBe(payerKey(director));
  });

  it('falls back to a name with its quotes and doubled spaces taken out', () => {
    const one = item({ counterName: 'ТОВ "Бар На Розі"' });
    const two = item({ counterName: 'ТОВ  Бар на розі' });

    expect(payerKey(one)).toBe(payerKey(two));
    expect(normalisePayer('«Бар», ТОВ')).toBe('БАР ТОВ');
  });

  it('uses the description where the bank named nobody', () => {
    const bare = item({ counterName: undefined, description: 'Зарахування' });

    expect(payerKey(bare)).toBe('name:ЗАРАХУВАННЯ');
    expect(payerName(bare)).toBe('Зарахування');
  });

  it('does not confuse two different companies with similar names', () => {
    const one = item({ counterName: 'ТОВ БАР', counterEdrpou: '11111111' });
    const two = item({ counterName: 'ТОВ БАР', counterEdrpou: '22222222' });

    expect(payerKey(one)).not.toBe(payerKey(two));
  });
});

describe('the statement, stood back from', () => {
  const on = (iso: string, over: Partial<MonoStatementItem> = {}) =>
    item({ time: at(iso), ...over });

  const week = [
    on('2026-08-10T09:00:00', { id: '1', amount: 2590000, balance: 2700000 }),
    on('2026-08-10T22:00:00', { id: '2', amount: -18000, mcc: 4121, balance: 2682000 }),
    on('2026-08-11T13:00:00', { id: '3', amount: -45000, mcc: 5411, balance: 2637000, cashbackAmount: 900 }),
    on('2026-08-12T20:00:00', { id: '4', amount: -120000, mcc: 5812, balance: 2517000 }),
  ];

  it('groups by day, newest first, with the day’s own totals', () => {
    const days = byDay(week);

    expect(days.map((row) => row.day)).toEqual(['2026-08-12', '2026-08-11', '2026-08-10']);
    expect(days[2].income).toBe(25900);
    expect(days[2].spent).toBe(180);
    expect(days[2].items).toHaveLength(2);
  });

  it('adds up a range, both ends included', () => {
    const totals = periodTotals(week, '2026-08-10', '2026-08-11');

    expect(totals.income).toBe(25900);
    expect(totals.spent).toBe(180 + 450);
    expect(totals.cashback).toBe(9);
  });

  it('leaves out what falls outside the range', () => {
    expect(periodTotals(week, '2026-08-12', '2026-08-12').income).toBe(0);
  });

  it('leaves an unsettled transaction out of the totals', () => {
    const held = [...week, on('2026-08-11T15:00:00', { id: '5', amount: -99900, hold: true })];

    expect(periodTotals(held, '2026-08-11', '2026-08-11').spent).toBe(450);
  });

  it('sorts spending by category, biggest first', () => {
    const rows = spendingByCategory(week, '2026-08-01', '2026-08-31');

    expect(rows[0].name).toBe('Кафе и бары');
    expect(rows[0].total).toBe(1200);
    expect(rows.map((row) => row.name)).toContain('Транспорт');
  });

  it('names the categories it claims to, and calls the rest Другое', () => {
    expect(categoryOf(5411)).toBe('Продукты');
    expect(categoryOf(4121)).toBe('Транспорт');
    expect(categoryOf(4829)).toBe('Переводы');
    expect(categoryOf(1234)).toBe('Другое');
  });

  it('says how many days the money lasted before the balance fell through the floor', () => {
    // Balances run 27 000 → 26 820 → 26 370 → 25 170 across the 10th to 12th.
    expect(moneyLasted(week, '2026-08-10', 26500)).toBe(1);
    expect(moneyLasted(week, '2026-08-10', 26000)).toBe(2);
  });

  it('says nothing where the balance never fell that far', () => {
    expect(moneyLasted(week, '2026-08-10', 100)).toBeNull();
  });

  it('says nothing where there is no statement after the payday', () => {
    expect(moneyLasted(week, '2026-09-01', 26000)).toBeNull();
  });
});
