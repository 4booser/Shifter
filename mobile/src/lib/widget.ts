/**
 * What the widget is allowed to know.
 *
 * A widget is the only part of this app somebody sees without opening it, and
 * for most people that is why it stays installed. It also cannot ask a
 * question: no server, no token, no network. Everything it shows has to be
 * written down for it in advance, which makes this snapshot the entire
 * contract between the two.
 *
 * Three rules shape it.
 *
 * It carries the moment it was written, because a widget is a photograph of a
 * moment that has passed. A figure from three days ago presented as today's is
 * the one lie a widget is uniquely good at telling, and the only defence is
 * saying how old it is.
 *
 * It carries no figures at all when the app lock is on. Somebody who put a
 * lock on this app did it because a wage is what people hand their unlocked
 * phone to a colleague without thinking about — and a widget puts that same
 * wage on a lock screen, visible to whoever is standing next to them, which is
 * a wider audience still. The widget cannot be trusted to hide what it was
 * given, so it is not given it.
 *
 * Every number is nullable. A widget with no bank connected must say nothing
 * about money rather than draw a confident zero.
 */

export interface WidgetSnapshot {
  /** ISO, in the phone's own time. */
  at: string;
  /** The app lock is on, so every figure below is absent rather than hidden. */
  hidden: boolean;
  /**
   * The sign that goes in front of a figure — "₴", "zł", "€", as the app
   * itself writes it.
   *
   * The widget used to draw bare numbers, on the reasoning that it would only
   * be guessing at the currency. It would not: the app knows, and somebody
   * paid in zlotys looking at an unmarked 1 840 on a home screen has to guess
   * instead.
   */
  currency: string;
  today: WidgetToday;
  month: WidgetMonth;
  /** Null where no bank is connected — which is not the same as no money. */
  money: WidgetMoney | null;
}

export interface WidgetToday {
  /** The shift's name, or null on a day with nothing on it. */
  shift: string | null;
  /** "18:00", local. Null with no shift. */
  start: string | null;
  end: string | null;
  /** Already marked worked, so the widget says "closed" rather than "on". */
  worked: boolean;
  /** What today has come to. Null when hidden or when there is nothing yet. */
  earned: number | null;
  /**
   * The next shift there is, where today has none.
   *
   * A day off is not an absence of information — "what am I on next" is
   * exactly what somebody looks at a calendar for on their day off, and it is
   * the answer the app's own tile already gives. Null where nothing is
   * planned, which is its own honest answer.
   */
  next: WidgetNext | null;
}

export interface WidgetNext {
  /** Days from today. One is tomorrow. */
  inDays: number;
  name: string;
  /** "18:00", local. */
  start: string;
}

export interface WidgetMonth {
  /** "август" — the widget does not know the phone's language. */
  label: string;
  earned: number | null;
  goal: number | null;
  /** Days worked so far this month. Shape survives hiding; money does not. */
  days: number;
}

export interface WidgetMoney {
  balance: number | null;
  /** Days until the next payment the app is expecting. */
  untilPayday: number | null;
  /** What the balance leaves per day until then. */
  perDay: number | null;
}

/**
 * The next shift after today, from the days already loaded.
 *
 * Here rather than beside the hook because it is arithmetic on dates and a
 * test should not have to load React to check it.
 *
 * Looks a fortnight ahead and no further: beyond that a rota is a guess, and
 * "через 40 дней" is not an answer anybody wanted.
 */
export function nextShift(days: NextSource[], from: string): WidgetNext | null {
  const ahead = days
    .filter((day) => day.date > from && day.shifts.length > 0)
    .sort((one, two) => one.date.localeCompare(two.date))[0];

  if (ahead === undefined) return null;

  const inDays = Math.round(
    (Date.parse(`${ahead.date}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000,
  );

  if (inDays > 14) return null;

  return { inDays, name: ahead.shifts[0].name, start: ahead.shifts[0].start_time.slice(0, 5) };
}

/** Only what choosing the next shift needs, so this file stays free of the app's models. */
export interface NextSource {
  date: string;
  shifts: { name: string; start_time: string }[];
}

export const WIDGET_GROUP = 'group.ink.shifter.app';
export const WIDGET_KEY = 'snapshot';

/**
 * How old a snapshot may be before the widget says so out loud.
 *
 * Six hours: long enough that an ordinary evening does not carry a warning,
 * short enough that a figure from yesterday never passes as today's.
 */
export const STALE_HOURS = 6;

/**
 * Builds the snapshot, given everything already computed for the screens.
 *
 * Pure, so what the widget will show can be checked without a simulator — and
 * it is the only place the hide-amounts rule is applied, so there is one thing
 * to get right rather than one per widget.
 */
export function buildSnapshot(input: {
  now: Date;
  /** The app lock: no figure of any kind leaves the app while it is on. */
  hidden: boolean;
  /** The sign the app puts on money, so the widget does not have to guess. */
  currency: string;
  /**
   * The bank lock, which is its own decision. What the calendar holds is how
   * much somebody earns; what the bank holds is where they were and what they
   * bought, and a person can reasonably lock the second and not the first.
   */
  bankHidden: boolean;
  today: WidgetToday;
  month: WidgetMonth;
  money: WidgetMoney | null;
}): WidgetSnapshot {
  const veil = <T,>(value: T | null): T | null => (input.hidden ? null : value);

  return {
    at: input.now.toISOString(),
    hidden: input.hidden,
    currency: input.currency,
    today: { ...input.today, earned: veil(input.today.earned) },
    month: {
      ...input.month,
      earned: veil(input.month.earned),
      goal: veil(input.month.goal),
    },
    // The bank lock removes the card outright rather than emptying it. A
    // balance is the most private figure this app holds, and an empty money
    // widget on a home screen is an invitation to wonder what is behind it.
    money:
      input.money === null || input.bankHidden
        ? null
        : {
            balance: veil(input.money.balance),
            // The days survive the app lock: how long until payday is a shape,
            // not a sum, and it is the half of this card people actually read.
            untilPayday: input.money.untilPayday,
            perDay: veil(input.money.perDay),
          },
  };
}
