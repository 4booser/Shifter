import { ExpectedWage, MonoStatementItem, WageMatch, wageCandidates } from '@/lib/mono';

/**
 * Noticing that the wage arrived, without a server ever holding the token.
 *
 * A webhook would need a public URL and a token living somewhere other than
 * the phone, and that was decided against on purpose. So the phone has to
 * notice for itself, which means waking up occasionally and looking.
 *
 * The honest part is the promise. When the phone wakes is the operating
 * system's decision, not ours — it may be twenty minutes, it may be six hours,
 * and on a phone in low-power mode it may be tomorrow. Every word this feature
 * says is "вскоре". Promising the moment the money lands would be a promise
 * about something we do not control.
 */

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

/**
 * How close a credit has to be before it is worth waking somebody for.
 *
 * Generous, because a wage is rarely to the hryvnia — tax, an advance, a fine.
 * But not unbounded: a credit half the size is not the wage arriving, it is
 * something else, and telling somebody their wage came when a friend paid them
 * back is worse than saying nothing.
 */
export const CLOSE_ENOUGH = 0.25;

/**
 * Whether anything here is worth a notification.
 *
 * Null far more often than not. A background wake-up that fires a notification
 * for anything interesting is a background wake-up people switch off inside a
 * week, and then the one message that mattered never arrives.
 */
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

/**
 * What the notification says.
 *
 * It reports the arrival and asks. It never says "вам заплатили" — the app
 * matched a credit against a figure it worked out itself, and the person is
 * the one who knows whether that credit is their wage. A confident wrong
 * announcement about somebody's pay is the exact failure this app exists to
 * avoid.
 */
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
