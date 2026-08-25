import { CalendarDayData } from './models';
import { shiftDays } from './calendar-date';

/**
 * Achievements are computed, never stored: the calendar is the source of
 * truth and a badge is just a question asked of it. Only the celebration is
 * remembered locally, so the same unlock never fires twice on one browser.
 */

export interface AchievementStats {
  shifts: number;
  earned: number;
  tips: number;
  salesUnits: number;
  longestStreak: number;
  /** Paid hours on the heaviest single day. */
  longestDay: number;
  /** Hours in the heaviest calendar month. */
  heaviestMonth: number;
  nightShifts: number;
  earlyShifts: number;
  /** How many of the seven weekdays have ever been worked. */
  weekdaysCovered: number;
  /** Most days worked inside one Monday-to-Sunday week. */
  fullestWeek: number;
}

export function achievementStats(days: readonly CalendarDayData[]): AchievementStats {
  const stats: AchievementStats = {
    shifts: 0,
    earned: 0,
    tips: 0,
    salesUnits: 0,
    longestStreak: 0,
    longestDay: 0,
    heaviestMonth: 0,
    nightShifts: 0,
    earlyShifts: 0,
    weekdaysCovered: 0,
    fullestWeek: 0,
  };

  const weekdays = new Set<number>();
  const months = new Map<string, number>();
  const weeks = new Map<string, number>();
  const workedDates: string[] = [];

  for (const day of days) {
    const worked = day.shifts.filter((entry) => entry.worked);

    stats.earned += day.earned;
    stats.tips += (day.tips ?? 0) + (day.tips_cash ?? 0);
    stats.salesUnits += day.sales.reduce((sum, sale) => sum + sale.quantity, 0);

    if (worked.length === 0) continue;

    stats.shifts += worked.length;
    stats.longestDay = Math.max(stats.longestDay, day.hours);
    workedDates.push(day.date);

    const date = new Date(`${day.date}T00:00:00`);

    weekdays.add(date.getDay());
    months.set(day.date.slice(0, 7), (months.get(day.date.slice(0, 7)) ?? 0) + day.hours);

    const monday = shiftDays(day.date, -((date.getDay() + 6) % 7));

    weeks.set(monday, (weeks.get(monday) ?? 0) + 1);

    for (const entry of worked) {
      const start = Number(entry.start_time.slice(0, 2));

      if (start >= 20 || start < 4) stats.nightShifts += 1;
      if (start >= 4 && start < 7) stats.earlyShifts += 1;
    }
  }

  stats.weekdaysCovered = weekdays.size;
  stats.heaviestMonth = Math.max(0, ...months.values());
  stats.fullestWeek = Math.max(0, ...weeks.values());

  workedDates.sort();

  let run = 0;

  for (let index = 0; index < workedDates.length; index += 1) {
    run = index > 0 && shiftDays(workedDates[index - 1], 1) === workedDates[index] ? run + 1 : 1;
    stats.longestStreak = Math.max(stats.longestStreak, run);
  }

  return stats;
}

export interface AchievementDef {
  id: string;
  icon: string;
  /** Dictionary keys. */
  name: string;
  hint: string;
  target: number;
  progressOf: (stats: AchievementStats) => number;
  /** Money targets scale with currency and are shown formatted. */
  money?: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-shift', icon: '🎬', name: 'First shift', hint: 'Work one shift', target: 1, progressOf: (s) => s.shifts },
  { id: 'ten-shifts', icon: '🧰', name: 'Warmed up', hint: 'Work 10 shifts', target: 10, progressOf: (s) => s.shifts },
  { id: 'fifty-shifts', icon: '⚙️', name: 'Regular', hint: 'Work 50 shifts', target: 50, progressOf: (s) => s.shifts },
  { id: 'century', icon: '💯', name: 'Century', hint: 'Work 100 shifts', target: 100, progressOf: (s) => s.shifts },
  { id: 'legend', icon: '🏛️', name: 'Fixture', hint: 'Work 250 shifts', target: 250, progressOf: (s) => s.shifts },
  { id: 'first-money', icon: '🌱', name: 'It counts', hint: 'Record your first earnings', target: 1, progressOf: (s) => Math.min(1, s.earned), money: false },
  { id: 'ten-k', icon: '💰', name: 'Five figures', hint: 'Earn 10 000 all-time', target: 10_000, progressOf: (s) => s.earned, money: true },
  { id: 'hundred-k', icon: '🏦', name: 'Six figures', hint: 'Earn 100 000 all-time', target: 100_000, progressOf: (s) => s.earned, money: true },
  { id: 'streak-3', icon: '🔥', name: 'Three in a row', hint: 'Work 3 days straight', target: 3, progressOf: (s) => s.longestStreak },
  { id: 'streak-7', icon: '🌋', name: 'Full week', hint: 'Work 7 days straight', target: 7, progressOf: (s) => s.longestStreak },
  { id: 'streak-14', icon: '🤖', name: 'Machine', hint: 'Work 14 days straight', target: 14, progressOf: (s) => s.longestStreak },
  { id: 'night-owl', icon: '🦉', name: 'Night owl', hint: 'Work 5 shifts starting after 20:00', target: 5, progressOf: (s) => s.nightShifts },
  { id: 'early-bird', icon: '🌅', name: 'Early bird', hint: 'Work 5 shifts starting before 07:00', target: 5, progressOf: (s) => s.earlyShifts },
  { id: 'marathon', icon: '🏃', name: 'Marathon', hint: 'A single day of 12 paid hours', target: 12, progressOf: (s) => s.longestDay },
  { id: 'iron-month', icon: '🏋️', name: 'Iron month', hint: '200 paid hours in one month', target: 200, progressOf: (s) => s.heaviestMonth },
  { id: 'six-day-week', icon: '📅', name: 'Six of seven', hint: 'Work 6 days in one week', target: 6, progressOf: (s) => s.fullestWeek },
  { id: 'all-weekdays', icon: '🗓️', name: 'Any day of the week', hint: 'Work every weekday at least once', target: 7, progressOf: (s) => s.weekdaysCovered },
  { id: 'salesman', icon: '🧾', name: 'Closer', hint: 'Sell 100 units', target: 100, progressOf: (s) => s.salesUnits },
  { id: 'tip-jar', icon: '🫶', name: 'Tip magnet', hint: 'Collect 5 000 in tips all-time', target: 5000, progressOf: (s) => s.tips, money: true },
];

const SEEN_KEY = 'shifter.achievements';

export function unlockedIds(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((def) => def.progressOf(stats) >= def.target).map((def) => def.id);
}

/**
 * Which unlocks have never been celebrated on this browser. Recording them
 * immediately means a burst of confetti fires once, not on every visit.
 */
export function claimNewUnlocks(stats: AchievementStats): AchievementDef[] {
  if (typeof localStorage === 'undefined') return [];

  let seen: string[] = [];

  try {
    seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
  } catch {
    seen = [];
  }

  const unlocked = unlockedIds(stats);
  const fresh = unlocked.filter((id) => !seen.includes(id));

  // First ever visit with history already behind it: celebrate nothing, or a
  // veteran gets a wall of confetti for years of old work.
  if (seen.length === 0 && fresh.length > 3) {
    localStorage.setItem(SEEN_KEY, JSON.stringify(unlocked));

    return [];
  }

  if (fresh.length > 0) localStorage.setItem(SEEN_KEY, JSON.stringify(unlocked));

  return ACHIEVEMENTS.filter((def) => fresh.includes(def.id));
}
