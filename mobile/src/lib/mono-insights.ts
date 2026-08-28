import { MonoStatementItem, dayOf, fromMinor, income, spent } from './mono';

/**
 * Cyrillic to Latin, for names only.
 *
 * A card statement writes the same shop both ways depending on which terminal
 * took the money — «МАКДОНАЛЬДЗ №42» one week, «MCDONALDS 42» the next — and
 * two rows for one shop is the difference between a list somebody reads and a
 * list somebody scrolls past. This is not transliteration for humans: it only
 * has to map both spellings of a name onto the same key.
 */
const LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', є: 'e', ж: 'zh', з: 'z',
  и: 'i', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
  щ: 'sch', ь: '', ю: 'iu', я: 'ia', ъ: '', ы: 'i', э: 'e', ё: 'e',
};

/**
 * One counterparty's key: the name with everything that varies taken out.
 *
 * Branch numbers, city names appended by the terminal, punctuation and case
 * all vary between two payments to the same till. Digits go entirely — a shop
 * whose name is a number is rarer than a shop with a branch number, and the
 * second mistake is the one that fills the screen.
 */
export const merchantKey = (description: string): string => {
  const lowered = description.trim().toLocaleLowerCase();

  let latin = '';

  for (const letter of lowered) latin += LATIN[letter] ?? letter;

  return latin
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export interface Counterparty {
  key: string;
  /** The tidiest spelling seen: the shortest, which is usually the one without a branch. */
  name: string;
  /** Money out, in major units. Positive. */
  total: number;
  count: number;
  average: number;
  first: string;
  last: string;
}

/**
 * Who the money went to, biggest first.
 *
 * Forty lines saying "coffee" is not knowledge. "Four thousand two hundred
 * went to this one place in three months" is.
 */
export const counterparties = (
  items: MonoStatementItem[],
  from: string,
  to: string,
): Counterparty[] => {
  const found = new Map<string, Counterparty>();

  for (const item of items) {
    if (item.amount >= 0 || item.hold) continue;

    const day = dayOf(item);

    if (day < from || day > to) continue;

    const key = merchantKey(item.description);

    if (key === '') continue;

    const name = item.description.trim();
    const row = found.get(key) ?? {
      key,
      name,
      total: 0,
      count: 0,
      average: 0,
      first: day,
      last: day,
    };

    row.total += spent(item);
    row.count += 1;
    row.first = day < row.first ? day : row.first;
    row.last = day > row.last ? day : row.last;
    // The shortest spelling: "SILPO" over "SILPO 4021 KYIV".
    if (name.length < row.name.length) row.name = name;

    found.set(key, row);
  }

  for (const row of found.values()) row.average = row.total / row.count;

  return [...found.values()].sort((one, two) => two.total - one.total);
};

export interface Recurring {
  key: string;
  name: string;
  /** The typical charge, in major units. Positive. */
  amount: number;
  /** How often, in days, rounded to the nearest whole. */
  everyDays: number;
  period: 'week' | 'month';
  charges: number;
  last: string;
  /** When the next one is due, by the same rhythm. */
  next: string;
  /** First seen inside the range under review, so it is new rather than habitual. */
  fresh: boolean;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((one, two) => one - two);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const addDays = (day: string, days: number): string => {
  const at = new Date(`${day}T00:00:00`);

  at.setDate(at.getDate() + days);

  return at.toISOString().slice(0, 10);
};

const daysBetween = (one: string, two: string): number =>
  Math.round(
    (new Date(`${two}T00:00:00`).getTime() - new Date(`${one}T00:00:00`).getTime())
    / (24 * 60 * 60 * 1000),
  );

/**
 * Standing charges, found rather than declared.
 *
 * A travel pass, a gym, a locker, subscriptions: they leave silently and are
 * noticed when the money runs out. Nobody writes them down, because writing
 * them down is a thing you do exactly when you are not thinking about them.
 *
 * Three charges minimum. Two is a coincidence and calling it a subscription
 * would put an invented figure into somebody's forecast.
 */
export const recurring = (
  items: MonoStatementItem[],
  from: string,
  to: string,
): Recurring[] => {
  const groups = new Map<string, { name: string; days: string[]; amounts: number[] }>();

  for (const item of items) {
    if (item.amount >= 0 || item.hold) continue;

    const day = dayOf(item);

    if (day < from || day > to) continue;

    const key = merchantKey(item.description);

    if (key === '') continue;

    const group = groups.get(key) ?? { name: item.description.trim(), days: [], amounts: [] };

    group.days.push(day);
    group.amounts.push(spent(item));
    if (item.description.trim().length < group.name.length) group.name = item.description.trim();

    groups.set(key, group);
  }

  const found: Recurring[] = [];

  for (const [key, group] of groups) {
    if (group.days.length < 3) continue;

    const typical = median(group.amounts);

    if (typical <= 0) continue;

    // The same money each time, near enough. A shop somebody visits weekly
    // for whatever it costs is not a subscription, and the amount is what
    // separates the two.
    const steady = group.amounts.every((amount) => Math.abs(amount - typical) <= typical * 0.1);

    if (!steady) continue;

    const days = [...group.days].sort();
    const gaps: number[] = [];

    for (let index = 1; index < days.length; index += 1) {
      gaps.push(daysBetween(days[index - 1], days[index]));
    }

    const step = median(gaps);

    // Weekly or monthly, with room for weekends and short months. Anything
    // else is a rhythm nobody would recognise as one.
    const period = step >= 5 && step <= 9 ? 'week' : step >= 25 && step <= 35 ? 'month' : null;

    if (period === null) continue;

    // Every gap has to fit the rhythm, not just the middle one: three charges
    // a week apart and one six months later is not a weekly charge.
    if (!gaps.every((gap) => Math.abs(gap - step) <= (period === 'week' ? 3 : 8))) continue;

    const last = days[days.length - 1];

    found.push({
      key,
      name: group.name,
      amount: Math.round(typical * 100) / 100,
      everyDays: Math.round(step),
      period,
      charges: days.length,
      last,
      next: addDays(last, Math.round(step)),
      // Nothing before the second week of the range: something that starts
      // mid-window is something somebody signed up to, or did not.
      fresh: daysBetween(from, days[0]) > 14,
    });
  }

  return found.sort((one, two) => two.amount * (30 / two.everyDays) - one.amount * (30 / one.everyDays));
};

/** What the standing charges cost in a month, whatever their rhythm. */
export const monthlyCost = (rows: Recurring[]): number =>
  rows.reduce((sum, row) => sum + (row.amount * 30) / row.everyDays, 0);

export interface Refund {
  refund: MonoStatementItem;
  purchase: MonoStatementItem;
}

/**
 * A refund and the purchase it undoes.
 *
 * The money comes back as its own line, so a month with one returned coat
 * reads as both a spend and an income. Neither happened. Paired, the two
 * cancel; unpaired, the credit is left alone and says so — a guess here is
 * worse than "I do not know".
 */
export const refunds = (items: MonoStatementItem[]): Refund[] => {
  const outgoing = items
    .filter((item) => item.amount < 0 && !item.hold)
    .sort((one, two) => one.time - two.time);

  const taken = new Set<string>();
  const pairs: Refund[] = [];

  for (const credit of items) {
    if (credit.amount <= 0 || credit.hold) continue;

    const key = merchantKey(credit.description);

    if (key === '') continue;

    const match = outgoing.find(
      (purchase) =>
        !taken.has(purchase.id)
        && merchantKey(purchase.description) === key
        && Math.abs(Math.abs(purchase.amount) - credit.amount) <= credit.amount * 0.01
        // A refund comes after its purchase, and within a couple of months.
        && purchase.time <= credit.time
        && credit.time - purchase.time <= 60 * 24 * 60 * 60,
    );

    if (match === undefined) continue;

    taken.add(match.id);
    pairs.push({ refund: credit, purchase: match });
  }

  return pairs;
};

/**
 * Money moved between the person's own accounts.
 *
 * Counted as income and spending it makes a month look twice as rich and
 * twice as wasteful, and both figures are false. Monobank marks its own
 * transfers with the transfer MCCs; topping up a jar is the same act by
 * another name.
 */
const TRANSFER_MCCS = new Set([4829, 6012, 6051, 6536, 6537, 6538, 6540]);

export const isTransfer = (item: MonoStatementItem): boolean => TRANSFER_MCCS.has(item.mcc);

export interface Flow {
  /** Money that arrived from outside. */
  earned: number;
  /** Money that left for outside. */
  spent: number;
  /** Moved between own accounts, counted as neither. */
  moved: number;
  /** Given back, already netted out of spent. */
  returned: number;
  left: number;
}

/** What the money actually did across a range: in, out, and merely moved. */
export const flow = (items: MonoStatementItem[], from: string, to: string): Flow => {
  const paired = new Set<string>();

  for (const pair of refunds(items)) {
    paired.add(pair.refund.id);
    paired.add(pair.purchase.id);
  }

  let earned = 0;
  let outward = 0;
  let moved = 0;
  let returned = 0;

  for (const item of items) {
    if (item.hold) continue;

    const day = dayOf(item);

    if (day < from || day > to) continue;

    if (isTransfer(item)) {
      moved += Math.abs(fromMinor(item.amount));
      continue;
    }

    // A refunded purchase and its refund cancel: neither is spending, and the
    // credit was never income.
    if (paired.has(item.id)) {
      if (item.amount > 0) returned += income(item);
      continue;
    }

    if (item.amount > 0) earned += income(item);
    else outward += spent(item);
  }

  return { earned, spent: outward, moved, returned, left: earned - outward };
};

export interface Oddity {
  item: MonoStatementItem;
  /** Why it is on this list, in the person's words. */
  because: string;
}

/**
 * Lines worth a second look — as questions, never as findings.
 *
 * The app can see what somebody scrolls past: a charge three times the usual
 * at a shop they know, a new name taking a round number twice. It does not
 * know whether any of it was wrong, and saying so would be inventing an
 * accusation against a bank, a shop, or the person themselves.
 */
export const oddities = (items: MonoStatementItem[], from: string, to: string): Oddity[] => {
  const inRange = items.filter((item) => {
    const day = dayOf(item);

    return !item.hold && day >= from && day <= to;
  });

  const usual = new Map<string, number[]>();

  for (const item of inRange) {
    if (item.amount >= 0) continue;

    const key = merchantKey(item.description);

    if (key === '') continue;

    usual.set(key, [...(usual.get(key) ?? []), spent(item)]);
  }

  const found: Oddity[] = [];

  for (const item of inRange) {
    if (item.amount >= 0) continue;

    const key = merchantKey(item.description);
    const history = usual.get(key) ?? [];

    // Four charges at least: with two, "the usual" is one of them.
    if (history.length < 4) continue;

    const typical = median(history);
    const size = spent(item);

    if (typical > 0 && size >= typical * 3) {
      found.push({ item, because: 'втрое больше обычного здесь' });
    }
  }

  return found.sort((one, two) => spent(two.item) - spent(one.item));
};

export interface Cashback {
  /** Everything that came back over the range. */
  total: number;
  /** By category, biggest first, so the month's choice can be judged. */
  byCategory: { name: string; earned: number; spent: number }[];
}

/**
 * What came back, and off what.
 *
 * monobank puts a cashback figure on every line and the app has been throwing
 * it away. It is small money that adds up, and — more usefully — it is the
 * only way to tell whether the category somebody picked this month was the
 * right one, which is a question the bank's own app asks nobody.
 */
export const cashback = (
  items: MonoStatementItem[],
  categoryOfItem: (item: MonoStatementItem) => string,
  from: string,
  to: string,
): Cashback => {
  const rows = new Map<string, { name: string; earned: number; spent: number }>();
  let total = 0;

  for (const item of items) {
    if (item.hold) continue;

    const day = dayOf(item);

    if (day < from || day > to) continue;

    const back = fromMinor(item.cashbackAmount);
    const name = categoryOfItem(item);
    const row = rows.get(name) ?? { name, earned: 0, spent: 0 };

    if (item.amount < 0) row.spent += spent(item);

    row.earned += back;
    total += back;

    rows.set(name, row);
  }

  return {
    total,
    byCategory: [...rows.values()]
      .filter((row) => row.earned > 0)
      .sort((one, two) => two.earned - one.earned),
  };
};
