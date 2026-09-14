import { ExpectedWage, MonoStatementItem, WageMatch, wageCandidates } from '@/lib/mono';

/** Noticing that the wage arrived, without a server ever holding the token. */

export interface Watch {
  /** The wage the app is expecting, or null when none is due. */
  expected: ExpectedWage | null;
  /** Payer names already confirmed for the place. */
  payers: string[];
  /** Wages already announced, by the period they were for. */
  told: string[];
}

export interface Waking {
  match: WageMatch;
  /** The period this settles, used to make sure it is announced once. */
  period: string;
}

/** How close a credit has to be before it is worth waking somebody for. */
export const CLOSE_ENOUGH = 0.25;

/** Whether anything here is worth a notification. */
export function worthWaking(
  items: MonoStatementItem[],
  watch: Watch,
): Waking | null {
  if (watch.expected === null) return null;

  const period = `${watch.expected.locationId}:${watch.expected.periodFrom}`;

  // Once per wage. The task runs on whatever schedule the system feels like,
  // and a second notification about the same money reads as a second payment.
  if (watch.told.includes(period)) return null;

  const matches = wageCandidates(items, watch.expected, watch.payers);

  const best = matches.find((match) => Math.abs(match.difference) <= CLOSE_ENOUGH);

  return best === undefined ? null : { match: best, period };
}

/** What the notification says. */
export function wakingWords(
  waking: Waking,
  place: string,
  money: (value: number) => string,
): { title: string; body: string } {
  const short = waking.match.difference;

  return {
    title: 'Похоже, пришла зарплата',
    body:
      `${place} — ${money(waking.match.total)}.`
      + (short < -0.02
        ? ` На ${Math.round(Math.abs(short) * 100)}% меньше ожидаемого. Проверить?`
        : ' Проверить?'),
  };
}
