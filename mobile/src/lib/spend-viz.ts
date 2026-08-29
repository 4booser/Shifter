import { MonoStatementItem, dayOf, spent } from './mono';
import { CategoryRule, categorise } from './mono-rules';
import { isTransfer, merchantKey } from './mono-insights';

/*
 * The visual grammar of «куда уходят деньги».
 *
 * Everything drawable is computed here, away from the markup, so the claims
 * a picture makes — shares that sum to the total, deltas against last month,
 * a peak day's actual receipts — are checkable without a renderer. The web
 * and the phone must tell one story; keeping this file portable (no DOM, no
 * React) is what keeps that cheap.
 */

/**
 * A stable look per category: same colour and mark every month, whatever
 * rank the category lands at. Colour following the entity, never its rank,
 * is the difference between a chart people learn and one they re-read.
 */
const KNOWN: Record<string, { hue: string; mark: string }> = {
  'Продукты': { hue: '#10b981', mark: '🛒' },
  'Кафе и бары': { hue: '#f59e0b', mark: '☕' },
  'Транспорт': { hue: '#0ea5e9', mark: '🚕' },
  'Одежда': { hue: '#ec4899', mark: '👕' },
  'Здоровье': { hue: '#14b8a6', mark: '🩺' },
  'Дом': { hue: '#8b5cf6', mark: '🏠' },
  'Связь и подписки': { hue: '#6366f1', mark: '📱' },
  'Развлечения': { hue: '#f97316', mark: '🎬' },
  'Переводы': { hue: '#64748b', mark: '💸' },
  'Другое': { hue: '#94a3b8', mark: '·' },
};

/** For the names people invent themselves, a small palette hashed by name. */
const CUSTOM_HUES = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

export const categoryStyle = (name: string): { hue: string; mark: string } => {
  const known = KNOWN[name];

  if (known !== undefined) return known;

  let hash = 0;

  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 997;

  return { hue: CUSTOM_HUES[hash % CUSTOM_HUES.length], mark: '◆' };
};

/** One day of spending; days without a single purchase are present as zero. */
export interface DaySpend {
  day: string;
  total: number;
}

export const dailySpend = (
  items: MonoStatementItem[],
  from: string,
  to: string,
): DaySpend[] => {
  const totals = new Map<string, number>();

  for (const item of items) {
    if (item.amount >= 0 || item.hold) continue;

    const day = dayOf(item);

    if (day < from || day > to) continue;

    totals.set(day, (totals.get(day) ?? 0) + spent(item));
  }

  const days: DaySpend[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const stop = new Date(`${to}T12:00:00`);

  while (cursor <= stop) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;

    days.push({ day: key, total: totals.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
};

/** The median of the days that had any spending: the «обычный день» line. */
export const usualDay = (days: DaySpend[]): number => {
  const spentDays = days.filter((day) => day.total > 0).map((day) => day.total).sort((a, b) => a - b);

  if (spentDays.length === 0) return 0;

  return spentDays[Math.floor(spentDays.length / 2)];
};

/**
 * This month's categories against last month's, matched by name.
 *
 * Null instead of a percent where last month had nothing: «новая трата» and
 * «выросла с нуля на бесконечность» are different sentences, and only one
 * of them is sayable.
 */
export interface CategoryDelta {
  name: string;
  total: number;
  count: number;
  previous: number;
  /** Signed percent, or null where there is no previous to compare against. */
  percent: number | null;
}

export const categoryDeltas = (
  current: { name: string; total: number; count: number }[],
  previous: { name: string; total: number; count: number }[],
): CategoryDelta[] => {
  const before = new Map(previous.map((row) => [row.name, row.total]));

  return current.map((row) => {
    const was = before.get(row.name) ?? 0;

    return {
      name: row.name,
      total: row.total,
      count: row.count,
      previous: was,
      percent: was > 0 ? Math.round(((row.total - was) / was) * 100) : null,
    };
  });
};

/** The places inside one category, branches of one shop merged, biggest first. */
export const merchantsIn = (
  items: MonoStatementItem[],
  rules: CategoryRule[],
  category: string,
  from: string,
  to: string,
  keep = 6,
): { name: string; total: number; count: number }[] => {
  const totals = new Map<string, { name: string; total: number; count: number }>();

  for (const item of items) {
    if (item.amount >= 0 || item.hold) continue;

    const day = dayOf(item);

    if (day < from || day > to) continue;
    if (categorise(item, rules) !== category) continue;

    const key = merchantKey(item.description);
    const row = totals.get(key) ?? { name: item.description, total: 0, count: 0 };

    row.total += spent(item);
    row.count += 1;
    totals.set(key, row);
  }

  return [...totals.values()]
    .sort((one, two) => two.total - one.total)
    .slice(0, keep);
};

/** One month's in/out, for the paired columns. */
export interface MonthFlow {
  month: string;
  earned: number;
  spent: number;
}

/**
 * The last N months as money in against money out, transfers excluded on
 * both sides (the same isTransfer the flow card uses), oldest first.
 */
export const monthlyFlows = (
  items: MonoStatementItem[],
  months: number,
  today = new Date(),
): MonthFlow[] => {
  const rows: MonthFlow[] = [];

  for (let back = months - 1; back >= 0; back -= 1) {
    const at = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;

    rows.push({ month: key, earned: 0, spent: 0 });
  }

  const index = new Map(rows.map((row) => [row.month, row]));

  for (const item of items) {
    if (item.hold) continue;
    if (isTransfer(item)) continue;

    const row = index.get(dayOf(item).slice(0, 7));

    if (row === undefined) continue;

    if (item.amount > 0) row.earned += item.amount / 100;
    else row.spent += -item.amount / 100;
  }

  return rows.map((row) => ({
    ...row,
    earned: Math.round(row.earned * 100) / 100,
    spent: Math.round(row.spent * 100) / 100,
  }));
};

/** The top categories month by month, for the stacked columns. */
export interface CategoryMonth {
  month: string;
  parts: { name: string; total: number }[];
}

export const categoryMonths = (
  items: MonoStatementItem[],
  rules: CategoryRule[],
  months: number,
  keep = 5,
  today = new Date(),
): CategoryMonth[] => {
  const keys: string[] = [];

  for (let back = months - 1; back >= 0; back -= 1) {
    const at = new Date(today.getFullYear(), today.getMonth() - back, 1);

    keys.push(`${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`);
  }

  const totals = new Map<string, Map<string, number>>(keys.map((key) => [key, new Map()]));
  const overall = new Map<string, number>();

  for (const item of items) {
    if (item.amount >= 0 || item.hold) continue;

    const month = dayOf(item).slice(0, 7);
    const bucket = totals.get(month);

    if (bucket === undefined) continue;

    const name = categorise(item, rules);
    const value = spent(item);

    bucket.set(name, (bucket.get(name) ?? 0) + value);
    overall.set(name, (overall.get(name) ?? 0) + value);
  }

  // The kept names are chosen across the whole window, so a category keeps
  // its slot (and its colour) from month to month instead of flickering in
  // and out of «остальное».
  const kept = [...overall.entries()]
    .sort((one, two) => two[1] - one[1])
    .slice(0, keep)
    .map(([name]) => name);

  return keys.map((month) => {
    const bucket = totals.get(month)!;
    const parts = kept
      .map((name) => ({ name, total: Math.round((bucket.get(name) ?? 0) * 100) / 100 }))
      .filter((part) => part.total > 0);
    const rest = [...bucket.entries()]
      .filter(([name]) => !kept.includes(name))
      .reduce((sum, [, value]) => sum + value, 0);

    if (rest > 0) parts.push({ name: 'остальное', total: Math.round(rest * 100) / 100 });

    return { month, parts };
  });
};

/**
 * The month as a running total, day by day — the pace line. Two of these
 * side by side answer «я трачу быстрее прошлого месяца?» honestly, because
 * both are drawn from the same statement with the same rule.
 */
export const cumulativeSpend = (
  items: MonoStatementItem[],
  from: string,
  to: string,
): DaySpend[] => {
  let running = 0;

  return dailySpend(items, from, to).map((day) => {
    running += day.total;

    return { day: day.day, total: Math.round(running * 100) / 100 };
  });
};
