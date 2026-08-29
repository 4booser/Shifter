/*
 * The same tests as on the phone, over the same code. If a platform ever
 * needs its own copy of one of these, something upstream has already gone
 * wrong.
 */
import { describe, expect, it } from 'vitest';

import { MonoStatementItem } from '@/lib/mono/mono';
import { statementCsv, statementFileName } from '@/lib/mono/mono-export';

const at = (day: string, hour = 12): number =>
  Math.floor(new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).getTime() / 1000);

const item = (over: Partial<MonoStatementItem> & { day?: string }): MonoStatementItem => {
  const { day, ...rest } = over;

  return {
    id: Math.random().toString(36).slice(2),
    time: day === undefined ? at('2026-08-10') : at(day),
    description: 'SILPO',
    mcc: 5411,
    originalMcc: 5411,
    hold: false,
    amount: -80000,
    operationAmount: -80000,
    currencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 1600,
    balance: 4200000,
    ...rest,
  };
};

const category = () => 'Продукты';

describe('the statement on the way out', () => {
  it('writes money as a spreadsheet reads it', () => {
    // Minor units would export honestly and open as 80000, which is the sort
    // of file somebody blames the app for.
    const csv = statementCsv([item({})], category, '2026-08-01', '2026-08-31');

    expect(csv.split('\n')[1]).toContain(';-800.00;UAH;16.00;42000.00;');
  });

  it('carries the person’s own category, not the bank’s guess', () => {
    const csv = statementCsv([item({})], () => 'Кофе на работе', '2026-08-01', '2026-08-31');

    expect(csv).toContain('Кофе на работе');
  });

  it('quotes a description with a separator in it', () => {
    // Otherwise "Bar; The" becomes two columns and every row after it slides.
    const csv = statementCsv(
      [item({ description: 'Bar; The' })],
      category,
      '2026-08-01',
      '2026-08-31',
    );

    expect(csv).toContain('"Bar; The"');
  });

  it('doubles a quote inside a description rather than ending the field', () => {
    const csv = statementCsv(
      [item({ description: 'The "Old" Bar' })],
      category,
      '2026-08-01',
      '2026-08-31',
    );

    expect(csv).toContain('"The ""Old"" Bar"');
  });

  it('exports the window on the screen and nothing either side of it', () => {
    const csv = statementCsv(
      [
        item({ day: '2026-07-31', description: 'BEFORE' }),
        item({ day: '2026-08-10', description: 'INSIDE' }),
        item({ day: '2026-09-01', description: 'AFTER' }),
      ],
      category,
      '2026-08-01',
      '2026-08-31',
    );

    expect(csv).toContain('INSIDE');
    expect(csv).not.toContain('BEFORE');
    expect(csv).not.toContain('AFTER');
  });

  it('orders newest first, the way the screen does', () => {
    const csv = statementCsv(
      [
        item({ day: '2026-08-02', description: 'OLDER' }),
        item({ day: '2026-08-20', description: 'NEWER' }),
      ],
      category,
      '2026-08-01',
      '2026-08-31',
    );

    const lines = csv.split('\n');

    expect(lines[1]).toContain('NEWER');
    expect(lines[2]).toContain('OLDER');
  });

  it('marks what has not settled, and only when something has not', () => {
    // A hold is money the bank has not taken yet. A row that looks final in a
    // file nobody can re-check is the wrong kind of wrong — but an empty
    // column in every export teaches people to ignore the one that matters.
    const settled = statementCsv([item({})], category, '2026-08-01', '2026-08-31');

    expect(settled).not.toContain('Не проведено');

    const pending = statementCsv(
      [item({}), item({ hold: true, description: 'PENDING' })],
      category,
      '2026-08-01',
      '2026-08-31',
    );

    expect(pending.split('\n')[0]).toContain('Не проведено');
    expect(pending.split('\n').find((line) => line.includes('PENDING'))).toMatch(/;да$/);
  });

  it('names currencies in letters rather than in numbers', () => {
    const csv = statementCsv(
      [item({ currencyCode: 840 })],
      category,
      '2026-08-01',
      '2026-08-31',
    );

    expect(csv).toContain(';USD;');
  });

  it('is a header and nothing else when the window is empty', () => {
    const csv = statementCsv([], category, '2026-08-01', '2026-08-31');

    expect(csv.split('\n')).toHaveLength(1);
    expect(csv).toContain('Дата;Время;Описание;Категория');
  });
});

describe('the file it lands in', () => {
  it('is named so it sorts and says what it is', () => {
    expect(statementFileName('2026-08-01', '2026-08-31')).toBe('shifter-2026-08-01-2026-08-31.csv');
  });
});
