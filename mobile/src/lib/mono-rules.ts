import { MonoStatementItem, categoryOf, dayOf, spent } from './mono';

/**
 * A category the person assigned, rather than one the terminal implied.
 *
 * An MCC is what a card terminal calls itself, not what the purchase was. A
 * petrol station with a shop shares a code with a supermarket; a coffee bar
 * inside an office block files itself as a canteen. A breakdown nobody can
 * correct is a tidy chart about somebody else's life, so the corrections are
 * the feature and the MCC is only the starting guess.
 *
 * Every condition present has to hold. An empty rule would match everything,
 * so a rule with no conditions matches nothing at all.
 */
export interface CategoryRule {
  id: string;
  /** Case-insensitive substring of the description. */
  contains?: string;
  mcc?: number;
  /** Absolute amount in major units, inclusive. */
  min?: number;
  max?: number;
  category: string;
}

/** A rule with nothing to match on would swallow the whole statement. */
export const isUsable = (rule: CategoryRule): boolean =>
  rule.category.trim() !== ''
  && (rule.contains !== undefined
    || rule.mcc !== undefined
    || rule.min !== undefined
    || rule.max !== undefined);

const matches = (rule: CategoryRule, item: MonoStatementItem): boolean => {
  if (!isUsable(rule)) return false;

  if (rule.contains !== undefined) {
    const needle = rule.contains.trim().toLocaleLowerCase();

    if (needle === '') return false;
    if (!item.description.toLocaleLowerCase().includes(needle)) return false;
  }

  if (rule.mcc !== undefined && item.mcc !== rule.mcc) return false;

  // Rules are written about sizes, not signs: "anything over 2000" means the
  // amount, whichever way it went.
  const size = Math.abs(item.amount) / 100;

  if (rule.min !== undefined && size < rule.min) return false;
  if (rule.max !== undefined && size > rule.max) return false;

  return true;
};

/**
 * The category for one line: the first rule that matches, or the MCC's own.
 *
 * First match wins rather than most specific, because "most specific" is a
 * judgement the app would be making on somebody's behalf. The order is theirs
 * and it is visible.
 */
export const categorise = (item: MonoStatementItem, rules: CategoryRule[]): string => {
  for (const rule of rules) if (matches(rule, item)) return rule.category;

  return categoryOf(item.mcc);
};

/**
 * How many lines each rule catches.
 *
 * A rule that catches nothing is a typo, not a setting, and the only way
 * anybody finds that out is by being told. Counted with the same first-match
 * precedence the breakdown uses, so a rule shadowed by an earlier one shows
 * the zero it really has.
 */
export const ruleHits = (
  items: MonoStatementItem[],
  rules: CategoryRule[],
): Record<string, number> => {
  const hits: Record<string, number> = {};

  for (const rule of rules) hits[rule.id] = 0;

  for (const item of items) {
    for (const rule of rules) {
      if (matches(rule, item)) {
        hits[rule.id] += 1;
        break;
      }
    }
  }

  return hits;
};

/** Where the money went across a range, the person's own rules applied. */
export const spendingByRules = (
  items: MonoStatementItem[],
  rules: CategoryRule[],
  from: string,
  to: string,
): { name: string; total: number; count: number }[] => {
  const totals = new Map<string, { name: string; total: number; count: number }>();

  for (const item of items) {
    if (item.amount >= 0 || item.hold) continue;

    const day = dayOf(item);

    if (day < from || day > to) continue;

    const name = categorise(item, rules);
    const row = totals.get(name) ?? { name, total: 0, count: 0 };

    row.total += spent(item);
    row.count += 1;
    totals.set(name, row);
  }

  return [...totals.values()].sort((one, two) => two.total - one.total);
};

/**
 * A rule made from one line, ready to be edited.
 *
 * The whole description rather than a guessed stem: shortening it is the app
 * deciding which half of "SILPO 4021 KYIV" is the name, and it would be wrong
 * about half the time. The person shortens it, sees the count change, and
 * keeps what works.
 */
export const ruleFrom = (item: MonoStatementItem, category: string): CategoryRule => ({
  id: `${item.id}-${Date.now()}`,
  contains: item.description.trim(),
  category,
});

/** A limit somebody set for a category, per month. */
export interface Budget {
  category: string;
  /** Major units, per month. */
  limit: number;
}

export interface BudgetState {
  category: string;
  limit: number;
  spent: number;
  /** How much of the month has gone, 0..1. */
  through: number;
  /** What the month ends at if the rest of it looks like the part so far. */
  projected: number;
  /** Over the limit already. */
  over: boolean;
  /** Not over yet, but on course to be. */
  heading: boolean;
}

/**
 * A limit is useless without the pace inside the month.
 *
 * "62% spent" means nothing on its own: it is comfortable on the 20th and
 * alarming on the 8th. The warning has to come while there is still a month
 * left to do something about it, which means comparing the two fractions
 * rather than waiting for one of them to reach a hundred.
 */
export const budgetState = (
  budgets: Budget[],
  spending: { name: string; total: number }[],
  /** Days gone, and days in the month. */
  dayOfMonth: number,
  daysInMonth: number,
): BudgetState[] => {
  const through = daysInMonth <= 0 ? 0 : Math.min(1, dayOfMonth / daysInMonth);

  return budgets
    .filter((budget) => budget.limit > 0)
    .map((budget) => {
      const spent = spending.find((row) => row.name === budget.category)?.total ?? 0;
      const projected = through <= 0 ? spent : spent / through;

      return {
        category: budget.category,
        limit: budget.limit,
        spent,
        through,
        projected,
        over: spent > budget.limit,
        // Only once enough of the month has gone for a projection to mean
        // anything. On the 2nd, one big shop projects to five times the limit
        // and says nothing except that somebody bought a coat.
        heading: spent <= budget.limit && through >= 0.25 && projected > budget.limit,
      };
    })
    .sort((one, two) => two.spent / two.limit - one.spent / one.limit);
};
