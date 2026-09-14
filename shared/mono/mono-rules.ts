/* One copy, read by the web and by the phone. */
import { MonoStatementItem, categoryOf, dayOf, spent } from './mono';

/** A category the person assigned, rather than one the terminal implied. */
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

/** The category for one line: the first rule that matches, or the MCC's own. */
export const categorise = (item: MonoStatementItem, rules: CategoryRule[]): string => {
  for (const rule of rules) if (matches(rule, item)) return rule.category;

  return categoryOf(item.mcc);
};

/** How many lines each rule catches. */
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

/** A rule made from one line, ready to be edited. */
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

/** A limit is useless without the pace inside the month. */
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
        // Only once enough of the month has gone for a projection to mean anything.
        heading: spent <= budget.limit && through >= 0.25 && projected > budget.limit,
      };
    })
    .sort((one, two) => two.spent / two.limit - one.spent / one.limit);
};
