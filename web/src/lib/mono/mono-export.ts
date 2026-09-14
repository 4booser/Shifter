/* Carried over from the phone, verbatim where possible. */
import { MonoStatementItem, dayOf, fromMinor } from '@/lib/mono/mono';

/** The statement, on the way out. */

const HEADER = [
  'Дата',
  'Время',
  'Описание',
  'Категория',
  'Сумма',
  'Валюта',
  'Кешбэк',
  'Остаток',
  'MCC',
] as const;

/** One CSV cell, quoted where it has to be. */
const cell = (value: string): string =>
  /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** A sum, written the way the spreadsheet that opens this file reads one. */
const sum = (value: number): string => value.toFixed(2).replace('.', ',');

const time = (item: MonoStatementItem): string => {
  const at = new Date(item.time * 1000);

  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

/** ISO 4217 numbers back into the letters a person can read. */
const CURRENCY: Record<number, string> = {
  980: 'UAH',
  840: 'USD',
  978: 'EUR',
  985: 'PLN',
  826: 'GBP',
};

export function statementCsv(
  items: MonoStatementItem[],
  categoryOf: (item: MonoStatementItem) => string,
  from: string,
  to: string,
): string {
  const shown = items
    .filter((item) => {
      const day = dayOf(item);

      return day >= from && day <= to;
    })
    // Newest first, the way the screen shows them.
    .sort((one, two) => two.time - one.time);

  // The column only appears where something is actually pending. An empty
  // column in every export teaches people to ignore the one that matters.
  const holds = shown.some((item) => item.hold);

  const rows = shown.map((item) =>
    [
      dayOf(item),
      time(item),
      item.description,
      categoryOf(item),
      // Major units with a dot, which is what a spreadsheet reads as a number.
      // Minor units would export honestly and open as 80000.
      sum(fromMinor(item.amount)),
      CURRENCY[item.currencyCode] ?? String(item.currencyCode),
      sum(fromMinor(item.cashbackAmount ?? 0)),
      sum(fromMinor(item.balance)),
      String(item.mcc),
      // A hold is money the bank has not taken yet, and a row that looks final
      // in a file nobody can re-check is the wrong kind of wrong.
      ...(holds ? [item.hold ? 'да' : ''] : []),
    ]
      .map(cell)
      .join(';'),
  );

  return [[...HEADER, ...(holds ? ['Не проведено'] : [])].join(';'), ...rows].join('\n');
}

/** "vypiska-2026-08-01-2026-08-31.csv" — a name that sorts and says what it is. */
export const statementFileName = (from: string, to: string): string =>
  `shifter-${from}-${to}.csv`;
