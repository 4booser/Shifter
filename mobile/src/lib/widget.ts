/** What the widget is allowed to know. */

export interface WidgetSnapshot {
  /** ISO, in the phone's own time. */
  at: string;
  /** The app lock is on, so every figure below is absent rather than hidden. */
  hidden: boolean;
  /** The sign that goes in front of a figure — "₴", "zł", "€", as the app itself writes it. */
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
  /** The next shift there is, where today has none. */
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

/** The next shift after today, from the days already loaded. */
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

/** How old a snapshot may be before the widget says so out loud. */
export const STALE_HOURS = 6;

/** Builds the snapshot, given everything already computed for the screens. */
export function buildSnapshot(input: {
  now: Date;
  /** The app lock: no figure of any kind leaves the app while it is on. */
  hidden: boolean;
  /** The sign the app puts on money, so the widget does not have to guess. */
  currency: string;
  /** The bank lock, which is its own decision. */
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
    // The bank lock removes the card outright rather than emptying it.
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
