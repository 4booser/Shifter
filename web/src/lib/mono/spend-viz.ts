import { MonoStatementItem, dayOf, spent } from './mono';
import { CategoryRule, categorise } from './mono-rules';
import { merchantKey } from './mono-insights';

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
