/*
 * The one question that looks forward: дотяну ли до зарплаты.
 *
 * Everything else this application computes looks backward — what came in,
 * where it went. The forward question is the one a person asks themselves
 * every month, and everything needed to answer it honestly is already in
 * hand: the balance now, the standing payments with their dates, what an
 * ordinary day costs, and when the next wage is due and how big.
 *
 * The discipline is that a forecast must look like a forecast. Known events
 * land on their dates as facts-to-be; the ordinary days are a median dressed
 * as habit; and the words around the curve say «обычно» and never «будет».
 * A confident line here would be the same lie as an estimate mixed into a
 * fact — the sin this codebase is organised around not committing.
 */

/** A standing charge the forecast should land on its date. */
export interface PlannedCharge {
  name: string;
  amount: number;
  /** 'YYYY-MM-DD'. Charges beyond the horizon are ignored, not clamped. */
  on: string;
}

/** Money expected to arrive: the reconciliation's own figure and due date. */
export interface PlannedIncome {
  name: string;
  amount: number;
  on: string;
}

export interface RunwayDay {
  day: string;
  /** The projected end-of-day balance. */
  balance: number;
  /** What landed on this day besides the ordinary spend, for the tooltip. */
  events: { name: string; amount: number }[];
}

export interface Runway {
  days: RunwayDay[];
  /** The lowest point of the stretch — the day it gets thinnest. */
  thinnest: RunwayDay;
  /** The first day under zero, or null where the stretch holds. */
  dry: string | null;
  /** The ordinary day used, so the screen can say what it assumed. */
  usualPerDay: number;
}

const shift = (day: string, by: number): string => {
  const date = new Date(`${day}T12:00:00`);

  date.setDate(date.getDate() + by);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * The balance walked forward, one day at a time.
 *
 * Null with no usual-day figure and no events: a flat line at today's balance
 * is not a forecast, it is the number repeated, and drawing it would dress
 * ignorance as stability.
 */
export function buildRunway(input: {
  balance: number;
  /** What a day usually costs. Zero is honest for a fresh statement. */
  usualPerDay: number;
  charges: PlannedCharge[];
  incomes: PlannedIncome[];
  /** 'YYYY-MM-DD', the first projected day (tomorrow, usually). */
  from: string;
  /** How many days forward. */
  horizon: number;
}): Runway | null {
  if (input.horizon <= 0) return null;

  const hasEvents = input.charges.length > 0 || input.incomes.length > 0;

  if (input.usualPerDay <= 0 && !hasEvents) return null;

  const days: RunwayDay[] = [];
  let balance = input.balance;

  for (let step = 0; step < input.horizon; step += 1) {
    const day = shift(input.from, step);
    const events: { name: string; amount: number }[] = [];

    // The ordinary day first, then the named events: the order inside one
    // day does not change the end-of-day figure, and end-of-day is all the
    // curve claims.
    balance -= input.usualPerDay;

    for (const charge of input.charges) {
      if (charge.on !== day) continue;

      balance -= charge.amount;
      events.push({ name: charge.name, amount: -charge.amount });
    }

    for (const income of input.incomes) {
      if (income.on !== day) continue;

      balance += income.amount;
      events.push({ name: income.name, amount: income.amount });
    }

    days.push({ day, balance: Math.round(balance), events });
  }

  let thinnest = days[0];

  for (const day of days) {
    if (day.balance < thinnest.balance) thinnest = day;
  }

  const dry = days.find((day) => day.balance < 0)?.day ?? null;

  return { days, thinnest, dry, usualPerDay: input.usualPerDay };
}

/**
 * Standing charges projected onto their next dates inside the horizon.
 *
 * A monthly charge lands once; a weekly one lands every week it fits. The
 * rhythm comes from the statement's own history — this file adds no guesses
 * of its own.
 */
export function chargesAhead(
  standing: { name: string; amount: number; next: string; everyDays: number }[],
  from: string,
  horizon: number,
): PlannedCharge[] {
  const until = shift(from, horizon - 1);
  const ahead: PlannedCharge[] = [];

  for (const charge of standing) {
    let on = charge.next;

    // A "next" already behind the window start still lands: rent due
    // yesterday is not cancelled by being late, it is coming out of the very
    // first projected day.
    if (on < from) on = from;

    while (on <= until) {
      ahead.push({ name: charge.name, amount: charge.amount, on });

      if (charge.everyDays <= 0) break;

      on = shift(on, charge.everyDays);
    }
  }

  return ahead;
}
