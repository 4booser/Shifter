/*
 * Carried over from the phone, verbatim where possible.
 *
 * The bank tab lived only in the pocket, and every formula here — what counts
 * as a transfer, how branches of one shop merge, what a day usually costs —
 * was already written and tested there. Parity between the platforms is
 * parity of files: if the web and the phone ever disagree about a figure,
 * that is a bug by definition, and keeping the code identical is the
 * cheapest way to make it a rare one.
 */
/**
 * monobank, as far as arithmetic goes.
 *
 * Everything here is pure: shapes, money, windows, and the rules that decide
 * whether a transaction looks like a wage or like a work expense. The token
 * lives elsewhere and never reaches this file, which is the point — the part
 * that decides what a payment means can then be tested exhaustively without
 * anybody's bank account being involved.
 *
 * Field names follow the API exactly rather than being renamed on the way in.
 * A layer that renames things is a layer where a wrong field is invisible.
 */

/** One card or account. Balances are in minor units, like everything else here. */
export interface MonoAccount {
  id: string;
  sendId: string;
  balance: number;
  creditLimit: number;
  type: string;
  /** ISO 4217 numeric: 980 hryvnia, 985 zloty, 840 dollar, 978 euro. */
  currencyCode: number;
  cashbackType: string;
  maskedPan: string[];
  iban: string;
}

/** A jar — monobank's savings pot, which is not an account. */
export interface MonoJar {
  id: string;
  sendId: string;
  title: string;
  description: string;
  currencyCode: number;
  balance: number;
  goal?: number;
}

export interface MonoClientInfo {
  clientId: string;
  name: string;
  webHookUrl: string;
  permissions: string;
  accounts: MonoAccount[];
  jars?: MonoJar[];
}

/**
 * One line of a statement.
 *
 * `amount` is what moved on the account and is signed: negative is money
 * leaving. `operationAmount` is the same event in the currency it happened in,
 * which differs only abroad. Both are minor units.
 */
export interface MonoStatementItem {
  id: string;
  /** Unix seconds. */
  time: number;
  description: string;
  mcc: number;
  originalMcc: number;
  /** True while the bank has not settled it. Real enough to show, not to count. */
  hold: boolean;
  amount: number;
  operationAmount: number;
  currencyCode: number;
  commissionRate: number;
  cashbackAmount: number;
  balance: number;
  comment?: string;
  receiptId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
}

/** ISO 4217 numeric to the letters people read. Unknown codes stay numeric. */
const CURRENCIES: Record<number, string> = {
  980: 'UAH',
  978: 'EUR',
  840: 'USD',
  826: 'GBP',
  985: 'PLN',
  203: 'CZK',
  348: 'HUF',
  946: 'RON',
  975: 'BGN',
  756: 'CHF',
  949: 'TRY',
};

export const currencyOf = (code: number): string => CURRENCIES[code] ?? `${code}`;

/**
 * The mark to print beside an account's balance.
 *
 * The bank page used to stamp «₴» on every figure it drew, which is right
 * for most cards in this trade and wrong for anybody holding a dollar or a
 * złoty one — and this app's one unbreakable rule about money is that it
 * never puts the wrong mark on a number. The symbol where the currency has a
 * familiar one, the ISO code where it does not, so an unusual account reads
 * as unusual rather than as somebody's hryvnia.
 *
 * The rest of the bank page still prices a day and a month in whatever
 * currency the person picked for wages; that is a wider question than the
 * mark on a balance and it is not answered here.
 */
const MARKS: Record<string, string> = {
  UAH: '₴', USD: '$', EUR: '€', GBP: '£', PLN: 'zł', CZK: 'Kč', KZT: '₸', JPY: '¥',
};

export const markOf = (code: number): string => {
  const iso = currencyOf(code);

  return MARKS[iso] ?? iso;
};

/**
 * Minor units to whole money.
 *
 * Everything monobank sends is in hundredths, and getting this wrong is not a
 * rounding error — it is a wage a hundred times too large.
 */
export const fromMinor = (amount: number): number => amount / 100;

/** Money in, as a positive number. Anything leaving the account is not income. */
export const income = (item: MonoStatementItem): number =>
  item.amount > 0 ? fromMinor(item.amount) : 0;

/** Money out, as a positive number. */
export const spent = (item: MonoStatementItem): number =>
  item.amount < 0 ? fromMinor(-item.amount) : 0;

/** The local date a transaction happened on, as the app's own 'YYYY-MM-DD'. */
export const dayOf = (item: MonoStatementItem): string => {
  const at = new Date(item.time * 1000);
  const pad = (value: number) => `${value}`.padStart(2, '0');

  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

/**
 * The statement endpoint takes at most 31 days and an hour, and will only be
 * asked once a minute. A year of history is therefore twelve requests spread
 * over twelve minutes, which is a thing to show a progress bar for rather than
 * a thing to hide.
 */
export const MAX_WINDOW_SECONDS = 30 * 24 * 60 * 60;

/** A range split into windows the endpoint will actually accept, newest first. */
export const statementWindows = (
  fromSeconds: number,
  toSeconds: number,
): { from: number; to: number }[] => {
  if (toSeconds <= fromSeconds) return [];

  const windows: { from: number; to: number }[] = [];
  let end = toSeconds;

  while (end > fromSeconds) {
    const start = Math.max(fromSeconds, end - MAX_WINDOW_SECONDS);

    windows.push({ from: start, to: end });
    end = start;
  }

  return windows;
};

/** What the app calls a work expense. Mirrors the server's own list. */
export type WorkExpenseKind = 'transport' | 'uniform' | 'tools' | 'food' | 'training' | 'other';

/**
 * A merchant category to a kind of work expense.
 *
 * `sure` marks the categories where being near a shift really does mean the
 * spending was for work. A taxi at two in the morning on a night somebody
 * closed a bar is a work expense; a supermarket on the same day is shopping.
 * Both can be offered, but only one should be offered first.
 */
export const MCC_KINDS: Record<number, { kind: WorkExpenseKind; sure: boolean }> = {
  4111: { kind: 'transport', sure: true },
  4112: { kind: 'transport', sure: true },
  4121: { kind: 'transport', sure: true },
  4131: { kind: 'transport', sure: true },
  4789: { kind: 'transport', sure: true },
  4784: { kind: 'transport', sure: true },
  5541: { kind: 'transport', sure: false },
  5542: { kind: 'transport', sure: false },

  5137: { kind: 'uniform', sure: true },
  5139: { kind: 'uniform', sure: true },
  5651: { kind: 'uniform', sure: false },
  5661: { kind: 'uniform', sure: false },
  5691: { kind: 'uniform', sure: false },

  5072: { kind: 'tools', sure: true },
  5085: { kind: 'tools', sure: true },
  5251: { kind: 'tools', sure: false },
  5200: { kind: 'tools', sure: false },
  5211: { kind: 'tools', sure: false },

  8220: { kind: 'training', sure: true },
  8249: { kind: 'training', sure: true },
  8299: { kind: 'training', sure: false },

  5811: { kind: 'food', sure: false },
  5812: { kind: 'food', sure: false },
  5814: { kind: 'food', sure: false },
};

export const kindForMcc = (mcc: number) => MCC_KINDS[mcc] ?? null;

/**
 * Spending that might belong to a shift.
 *
 * Only on days somebody actually worked, and only where the category means
 * anything. The app cannot know that a taxi was for work — it can only ask,
 * and asking about the right forty transactions is the whole difference
 * between a useful question and a nuisance.
 */
export const workSpending = (
  items: MonoStatementItem[],
  workedDays: Set<string>,
): { item: MonoStatementItem; kind: WorkExpenseKind; sure: boolean; day: string }[] =>
  items
    .filter((item) => item.amount < 0 && !item.hold)
    .map((item) => ({ item, day: dayOf(item), match: kindForMcc(item.mcc) }))
    .filter((row) => row.match !== null && workedDays.has(row.day))
    .map((row) => ({ item: row.item, kind: row.match!.kind, sure: row.match!.sure, day: row.day }))
    .sort((a, b) => b.item.time - a.item.time);

/**
 * A payer, as something that survives being written two ways.
 *
 * The same venue pays from more than one place — the official wage from a
 * company, the rest from a sole trader or the manager's own card — and the
 * name arrives spelled differently each time: «ТОВ "БАР"», «ТОВ БАР», «Бар,
 * ТОВ». So a payer is remembered by the steadiest thing the bank gave us: the
 * company code first, the account number next, and only then a name with its
 * quotes and doubled spaces taken out.
 */
export const normalisePayer = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/["'«»„“”`]/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const payerKey = (item: MonoStatementItem): string => {
  if (item.counterEdrpou !== undefined && item.counterEdrpou.trim() !== '') {
    return `edrpou:${item.counterEdrpou.trim()}`;
  }

  if (item.counterIban !== undefined && item.counterIban.trim() !== '') {
    return `iban:${item.counterIban.trim().toUpperCase()}`;
  }

  return `name:${normalisePayer(item.counterName ?? item.description)}`;
};

/** What to call a payer on screen, which is not what to remember it by. */
export const payerName = (item: MonoStatementItem): string =>
  (item.counterName ?? '').trim() !== '' ? item.counterName!.trim() : item.description;

/** A wage the app is expecting: what it computed, for which place, due when. */
export interface ExpectedWage {
  locationId: number;
  locationName: string;
  periodFrom: string;
  periodTo: string;
  amount: number;
  /** 'YYYY-MM-DD' the money was meant to arrive. */
  due: string;
}

export interface WageMatch {
  /** The credits that together make the wage. Usually one; two where an advance was paid. */
  items: MonoStatementItem[];
  total: number;
  /** How far off what the app computed, as a share. Negative means short. */
  difference: number;
  /** True where every payer involved has been confirmed for this place before. */
  known: boolean;
  /** The payers this match would teach the app, if it is confirmed. */
  payers: string[];
}

/** Days either side of the payday a wage is still recognisably that wage. */
export const WAGE_WINDOW_DAYS = 6;

/**
 * Credits that could be this wage.
 *
 * Deliberately generous about the amount and strict about the window: a wage
 * is rarely to the hryvnia — tax, an advance already taken, a fine — but it
 * does arrive within a few days of the day it was promised. Nothing here
 * decides anything; every result is a question for the person to answer.
 */
export const wageCandidates = (
  items: MonoStatementItem[],
  expected: ExpectedWage,
  /** Payer keys already confirmed for this place. One venue often has several. */
  knownPayers: string[],
): WageMatch[] => {
  const due = new Date(`${expected.due}T00:00:00`).getTime() / 1000;
  const window = WAGE_WINDOW_DAYS * 24 * 60 * 60;

  const credits = items
    .filter((item) => item.amount > 0 && !item.hold)
    .filter((item) => Math.abs(item.time - due) <= window)
    .sort((a, b) => Math.abs(a.time - due) - Math.abs(b.time - due));

  const known = new Set(knownPayers);
  const share = (total: number) =>
    expected.amount <= 0 ? 0 : (total - expected.amount) / expected.amount;

  const matches: WageMatch[] = credits.map((item) => ({
    items: [item],
    total: fromMinor(item.amount),
    difference: share(fromMinor(item.amount)),
    known: known.has(payerKey(item)),
    payers: [payerKey(item)],
  }));

  // An advance and the rest, which is how most of this trade is paid — and
  // often from two different payers of the same venue: the wage from the
  // company, the remainder from a sole trader or the manager's own card.
  //
  // The evidence that two credits are one wage is that together they land on
  // the amount expected. Requiring a known payer first sounds careful and is
  // not: the very first month, neither payer is known, so the pair is never
  // offered and the app tells somebody they were underpaid by a third when
  // they were paid in full. A wrong pair costs one tap to reject. A wrong
  // "недоплатили" is the thing this app exists to be right about.
  //
  // Each half has to be a real part of the wage, though, or a refunded coffee
  // pairs with the wage and lands just as close.
  const floor = expected.amount * 0.1;

  for (let a = 0; a < credits.length; a++) {
    for (let b = a + 1; b < credits.length; b++) {
      const one = payerKey(credits[a]);
      const two = payerKey(credits[b]);
      const total = fromMinor(credits[a].amount + credits[b].amount);
      const difference = share(total);

      if (Math.abs(difference) > 0.1) continue;
      if (fromMinor(credits[a].amount) < floor || fromMinor(credits[b].amount) < floor) continue;

      matches.push({
        items: [credits[a], credits[b]],
        total,
        difference,
        known: known.has(one) && known.has(two),
        payers: one === two ? [one] : [one, two],
      });
    }
  }

  // Closest to what was expected first, and a payer we have seen before ahead
  // of a stranger with the same gap.
  const ranked = matches.sort((one, two) => {
    if (one.known !== two.known) return one.known ? -1 : 1;

    return Math.abs(one.difference) - Math.abs(two.difference);
  });

  // A credit already offered as half of a better pair is not also offered on
  // its own. Seeing "₴18 205 — меньше на 35%" underneath the pair that makes
  // the full wage is how somebody ends up believing the wrong one.
  const spoken = new Set<string>();

  return ranked.filter((match) => {
    if (match.items.every((item) => spoken.has(item.id))) return false;

    for (const item of match.items) spoken.add(item.id);

    return true;
  });
};

// ==== What the statement says when you stand back from it ====

/** One day of money, the way a statement reads when it is grouped. */
export interface DayMoney {
  day: string;
  /** Money in, whole units. */
  income: number;
  /** Money out, whole units and positive. */
  spent: number;
  items: MonoStatementItem[];
}

/** The statement by day, newest first, with the day's own totals. */
export const byDay = (items: MonoStatementItem[]): DayMoney[] => {
  const days = new Map<string, DayMoney>();

  for (const item of items) {
    const day = dayOf(item);
    const row = days.get(day) ?? { day, income: 0, spent: 0, items: [] };

    row.income += income(item);
    row.spent += spent(item);
    row.items.push(item);
    days.set(day, row);
  }

  return [...days.values()]
    .map((row) => ({ ...row, items: row.items.sort((a, b) => b.time - a.time) }))
    .sort((one, two) => (one.day < two.day ? 1 : -1));
};

/** In, out and cashback across a range of days, both ends included. */
export const periodTotals = (
  items: MonoStatementItem[],
  from: string,
  to: string,
): { income: number; spent: number; cashback: number } => {
  let inward = 0;
  let outward = 0;
  let cashback = 0;

  for (const item of items) {
    const day = dayOf(item);

    if (day < from || day > to) continue;
    if (item.hold) continue;

    inward += income(item);
    outward += spent(item);
    cashback += fromMinor(item.cashbackAmount);
  }

  return { income: inward, spent: outward, cashback };
};

/**
 * Merchant categories in the words somebody would use, for the half of the
 * statement that has nothing to do with work. Deliberately coarse: this is a
 * shift app, and a spending report with forty rows is a different product.
 */
const CATEGORIES: { name: string; mccs: number[] }[] = [
  { name: 'Продукты', mccs: [5411, 5422, 5441, 5451, 5462, 5499] },
  { name: 'Кафе и бары', mccs: [5811, 5812, 5813, 5814] },
  { name: 'Транспорт', mccs: [4111, 4112, 4121, 4131, 4784, 4789, 5541, 5542] },
  { name: 'Одежда', mccs: [5137, 5139, 5611, 5621, 5631, 5641, 5651, 5661, 5691, 5699] },
  { name: 'Здоровье', mccs: [5912, 5122, 8011, 8021, 8031, 8042, 8062, 8071, 8099] },
  { name: 'Дом', mccs: [5200, 5211, 5231, 5251, 5261, 5712, 5719, 5722] },
  { name: 'Связь и подписки', mccs: [4812, 4814, 4899, 5732, 5734, 5815, 5816, 5817, 5818] },
  { name: 'Развлечения', mccs: [7832, 7841, 7911, 7922, 7929, 7991, 7994, 7996, 7997, 7999] },
  { name: 'Переводы', mccs: [4829, 6012, 6051, 6536, 6537, 6538, 6540] },
];

const CATEGORY_OF = new Map<number, string>();

for (const category of CATEGORIES) {
  for (const mcc of category.mccs) CATEGORY_OF.set(mcc, category.name);
}

export const categoryOf = (mcc: number): string => CATEGORY_OF.get(mcc) ?? 'Другое';

/** Where the money went across a range, biggest first. */
export const spendingByCategory = (
  items: MonoStatementItem[],
  from: string,
  to: string,
): { name: string; total: number; count: number }[] => {
  const totals = new Map<string, { name: string; total: number; count: number }>();

  for (const item of items) {
    if (item.amount >= 0 || item.hold) continue;

    const day = dayOf(item);

    if (day < from || day > to) continue;

    const name = categoryOf(item.mcc);
    const row = totals.get(name) ?? { name, total: 0, count: 0 };

    row.total += spent(item);
    row.count += 1;
    totals.set(name, row);
  }

  return [...totals.values()].sort((one, two) => two.total - one.total);
};

/**
 * How long the money lasted.
 *
 * From the day a wage landed until the balance first fell under a line
 * somebody set for themselves. It is the question behind every "where did it
 * all go", and a bank statement is the only thing that can answer it —
 * Shifter knows what arrived, not what was left by Thursday.
 */
export const moneyLasted = (
  items: MonoStatementItem[],
  /** The day a wage was recorded as arriving. */
  paidOn: string,
  floor: number,
): number | null => {
  const after = items
    .filter((item) => !item.hold && dayOf(item) >= paidOn)
    .sort((one, two) => one.time - two.time);

  if (after.length === 0) return null;

  const start = new Date(`${paidOn}T00:00:00`).getTime();

  for (const item of after) {
    if (fromMinor(item.balance) >= floor) continue;

    const fell = new Date(`${dayOf(item)}T00:00:00`).getTime();

    return Math.max(0, Math.round((fell - start) / (24 * 60 * 60 * 1000)));
  }

  return null;
};

/** One published rate, as monobank writes it. */
export interface MonoRate {
  currencyCodeA: number;
  currencyCodeB: number;
  date: number;
  rateBuy?: number;
  rateSell?: number;
  rateCross?: number;
}

/**
 * One amount in another currency, at the bank's own published rate.
 *
 * Never an invented number. A euro balance stamped with a hryvnia sign is the
 * confident lie about money this app does not tell, and a total across
 * accounts is exactly where that lie would live — so every conversion carries
 * the day the rate was published, and a pair the bank does not quote is
 * reported as unconvertible rather than guessed at.
 *
 * A rate somebody could actually get: the mid-point between buy and sell,
 * because neither of the two is the price of merely holding the money.
 */
const rateBetween = (rates: MonoRate[], from: number, to: number): number | null => {
  const direct = rates.find((row) => row.currencyCodeA === from && row.currencyCodeB === to);

  if (direct !== undefined) {
    const mid = direct.rateBuy !== undefined && direct.rateSell !== undefined
      ? (direct.rateBuy + direct.rateSell) / 2
      : direct.rateCross;

    if (mid !== undefined && mid > 0) return mid;
  }

  const reverse = rates.find((row) => row.currencyCodeA === to && row.currencyCodeB === from);

  if (reverse !== undefined) {
    const mid = reverse.rateBuy !== undefined && reverse.rateSell !== undefined
      ? (reverse.rateBuy + reverse.rateSell) / 2
      : reverse.rateCross;

    if (mid !== undefined && mid > 0) return 1 / mid;
  }

  return null;
};

export const convert = (
  amount: number,
  from: number,
  to: number,
  rates: MonoRate[],
): number | null => {
  if (from === to) return amount;

  const straight = rateBetween(rates, from, to);

  if (straight !== null) return amount * straight;

  // Through the hryvnia, which the bank quotes against everything it holds.
  const toUah = rateBetween(rates, from, 980);
  const fromUah = rateBetween(rates, 980, to);

  if (toUah === null || fromUah === null) return null;

  return amount * toUah * fromUah;
};

/** The freshest publication date among the rates, as a day. */
export const ratesDay = (rates: MonoRate[]): string | null => {
  if (rates.length === 0) return null;

  const newest = Math.max(...rates.map((row) => row.date));

  return new Date(newest * 1000).toISOString().slice(0, 10);
};

export interface Wealth {
  /** Everything the person owns, in the currency asked for. */
  own: number;
  /** The bank's money on the card, kept apart from theirs. */
  credit: number;
  /** Set aside in jars, which is theirs but not spendable by accident. */
  jars: number;
  /** Accounts whose currency the bank did not quote today. */
  unconverted: number;
  currency: number;
}

/**
 * What somebody has, across the accounts they chose to count.
 *
 * The credit limit never joins the total. "12 400 on the card, 2 400 of it
 * yours" is two numbers and two different feelings, and an app that adds them
 * is telling somebody they are five times richer than they are.
 */
export const wealth = (
  accounts: MonoAccount[],
  jars: MonoJar[],
  rates: MonoRate[],
  currency = 980,
): Wealth => {
  let own = 0;
  let credit = 0;
  let inJars = 0;
  let unconverted = 0;

  for (const account of accounts) {
    // The balance monobank reports includes whatever credit is available.
    const mine = fromMinor(account.balance - account.creditLimit);
    const lent = fromMinor(account.creditLimit);

    const asked = convert(mine, account.currencyCode, currency, rates);
    const lentAsked = convert(lent, account.currencyCode, currency, rates);

    if (asked === null || lentAsked === null) {
      unconverted += 1;
      continue;
    }

    own += asked;
    credit += lentAsked;
  }

  for (const jar of jars) {
    const asked = convert(fromMinor(jar.balance), jar.currencyCode, currency, rates);

    if (asked === null) {
      unconverted += 1;
      continue;
    }

    inJars += asked;
  }

  return { own, credit, jars: inJars, unconverted, currency };
};
