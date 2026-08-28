import { MonoStatementItem, dayOf, fromMinor } from '@/lib/mono';

/**
 * The statement, on the way out.
 *
 * What cannot be exported does not belong to the person holding it. The whole
 * bank tab is built on a token they typed in themselves, and an app that reads
 * somebody's money but will not hand it back has quietly become the owner of
 * it.
 *
 * It exports what is on the screen — the same window, the same rules already
 * applied — because a file that disagrees with the page it came from is worse
 * than no file. The category column carries the person's own rules, not the
 * bank's guess at an MCC, so the work they did tidying their spending leaves
 * with them.
 */

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

/**
 * One CSV cell, quoted where it has to be.
 *
 * Semicolons, because Excel in this part of the world splits on them and a
 * comma file opens as one column — which reads, to the person who exported
 * it, as the export being broken.
 */
const cell = (value: string): string =>
  /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

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
    // Newest first, the way the screen shows them. A file ordered differently
    // from the page it came from is a file the person has to re-read before
    // they can trust it.
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
      fromMinor(item.amount).toFixed(2),
      CURRENCY[item.currencyCode] ?? String(item.currencyCode),
      fromMinor(item.cashbackAmount ?? 0).toFixed(2),
      fromMinor(item.balance).toFixed(2),
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
