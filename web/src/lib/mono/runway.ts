/* The one question that looks forward: дотяну ли до зарплаты. */

// The same two names the phone's month grid reads, from the one copy they both now share; re-exported because…
import { PlannedCharge, chargesAhead } from '@/lib/mono/mono-insights';

export { chargesAhead };
export type { PlannedCharge };

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

/** The balance walked forward, one day at a time. */
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

    // The ordinary day first, then the named events: the order inside one day does not change the end-of-day…
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

