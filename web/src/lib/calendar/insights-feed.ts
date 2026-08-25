import { CalendarDayData, DaysResponse } from './models';
import { Forecast } from './forecast';
import { averagesFor } from './insights';
import { shiftDays } from './calendar-date';

/**
 * Automatic observations about the numbers — the things a person would
 * notice if they stared at their own calendar long enough. Each rule earns
 * its place by being actionable or at least satisfying; anything that would
 * print for everyone all the time is noise and does not belong here.
 */

export type InsightTone = 'good' | 'info' | 'warn';

export interface Insight {
  id: string;
  icon: string;
  tone: InsightTone;
  /** The dictionary key; {placeholders} are substituted after translation. */
  key: string;
  vars: Record<string, string>;
  /** Higher shows first. */
  weight: number;
}

export interface InsightInput {
  summary: DaysResponse;
  previous: DaysResponse;
  forecast: Forecast | null;
  /** Every loaded day, for looking past the summary period. */
  days: readonly CalendarDayData[];
  today: string;
  /** Sunday-first weekday names, already translated. */
  weekdayNames: string[];
  formatMoney: (amount: number) => string;
}

const pct = (value: number): string => `${Math.abs(Math.round(value))}`;

/** The rules, in one pass. Sorted by weight; the caller takes what fits. */
export function insightsFor(input: InsightInput): Insight[] {
  const { summary, previous, forecast, days, today, weekdayNames, formatMoney } = input;
  const found: Insight[] = [];
  const now = averagesFor(summary);
  const before = averagesFor(previous);

  // Which weekday quietly pays more than the rest.
  const byWeekday = new Map<number, { total: number; count: number }>();

  for (const day of summary.days) {
    if (day.earned <= 0 || !day.shifts.some((entry) => entry.worked)) continue;

    const weekday = new Date(`${day.date}T00:00:00`).getDay();
    const bucket = byWeekday.get(weekday) ?? { total: 0, count: 0 };

    bucket.total += day.earned;
    bucket.count += 1;
    byWeekday.set(weekday, bucket);
  }

  if (now.daysWorked >= 6) {
    let best: { weekday: number; average: number } | null = null;

    for (const [weekday, bucket] of byWeekday) {
      if (bucket.count < 2) continue;

      const average = bucket.total / bucket.count;

      if (best === null || average > best.average) best = { weekday, average };
    }

    if (best !== null && now.perDay > 0 && best.average >= now.perDay * 1.15) {
      found.push({
        id: 'weekday-premium',
        icon: '📈',
        tone: 'info',
        key: 'A {day} pays {pct}% more than your usual day',
        vars: { day: weekdayNames[best.weekday], pct: pct((best.average / now.perDay - 1) * 100) },
        weight: 60,
      });
    }
  }

  // On course to beat last month.
  if (forecast !== null && forecast.live && previous.total_earned > 0) {
    const change = (forecast.projected / previous.total_earned - 1) * 100;

    if (change >= 8) {
      found.push({
        id: 'record-pace',
        icon: '🚀',
        tone: 'good',
        key: 'On pace to finish {pct}% above last month',
        vars: { pct: pct(change) },
        weight: 90,
      });
    } else if (change <= -12) {
      found.push({
        id: 'slow-pace',
        icon: '🐌',
        tone: 'warn',
        key: 'Tracking {pct}% below last month',
        vars: { pct: pct(change) },
        weight: 70,
      });
    }
  }

  // The paying hour moved.
  if (now.perHour > 0 && before.perHour > 0) {
    const change = (now.perHour / before.perHour - 1) * 100;

    if (Math.abs(change) >= 5) {
      found.push({
        id: 'rate-move',
        icon: change > 0 ? '💪' : '📉',
        tone: change > 0 ? 'good' : 'warn',
        key:
          change > 0
            ? 'Your hour is worth {pct}% more than last month'
            : 'Your hour is worth {pct}% less than last month',
        vars: { pct: pct(change) },
        weight: 55,
      });
    }
  }

  // Tips trend, per worked day so fewer shifts do not read as worse tips.
  if (now.tipsPerDay > 0 && before.tipsPerDay > 0) {
    const change = (now.tipsPerDay / before.tipsPerDay - 1) * 100;

    if (Math.abs(change) >= 12) {
      found.push({
        id: 'tips-trend',
        icon: change > 0 ? '💸' : '🫙',
        tone: change > 0 ? 'good' : 'warn',
        key: change > 0 ? 'Tips are up {pct}% on last month' : 'Tips are down {pct}% on last month',
        vars: { pct: pct(change) },
        weight: 50,
      });
    }
  }

  // Overtime is money, and worth seeing named.
  if (summary.overtime_hours >= 1) {
    found.push({
      id: 'overtime',
      icon: '🔥',
      tone: 'info',
      key: '{hours} h of overtime brought {amount} extra',
      vars: {
        hours: summary.overtime_hours.toFixed(summary.overtime_hours % 1 === 0 ? 0 : 1),
        amount: formatMoney(summary.overtime_earned),
      },
      weight: 45,
    });
  }

  // A week ahead with nothing planned.
  const week = Array.from({ length: 7 }, (_, offset) => shiftDays(today, offset + 1));
  const byDate = new Map(days.map((day) => [day.date, day]));
  const planned = week.some((key) => (byDate.get(key)?.shifts.length ?? 0) > 0);

  if (!planned && days.length > 0 && now.daysWorked > 0) {
    found.push({
      id: 'quiet-week',
      icon: '🏝️',
      tone: 'info',
      key: 'The next seven days have nothing planned',
      vars: {},
      weight: 40,
    });
  }

  // A run of consecutive worked days ending today or yesterday.
  let run = 0;
  let cursor = byDate.get(today)?.shifts.some((entry) => entry.worked) ? today : shiftDays(today, -1);

  while (byDate.get(cursor)?.shifts.some((entry) => entry.worked) === true) {
    run += 1;
    cursor = shiftDays(cursor, -1);
  }

  if (run >= 4) {
    found.push({
      id: 'streak',
      icon: '⚡',
      tone: 'warn',
      key: '{days} days in a row — plan a rest',
      vars: { days: `${run}` },
      weight: 65,
    });
  }

  // A large slice of the money arrives as tips.
  if (now.tipShare >= 25 && summary.tips_earned > 0) {
    found.push({
      id: 'tip-share',
      icon: '🪙',
      tone: 'info',
      key: '{pct}% of everything came as tips',
      vars: { pct: pct(now.tipShare) },
      weight: 35,
    });
  }

  return found.sort((a, b) => b.weight - a.weight);
}
