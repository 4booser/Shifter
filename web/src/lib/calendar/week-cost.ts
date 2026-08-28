import { RotaEntry, RotaMember } from '@/lib/api/team';

/**
 * What a week of rota costs in wages — the part of it that is actually known.
 *
 * The decision about a shift is made before the rota is published, and after
 * publication it is awkward to change. A manager who can see the cost while it
 * is still a draft can move a shift; one who finds out at the end of the month
 * can only regret it.
 *
 * The whole design is in what it refuses to do. Half a crew shares their pay
 * and half does not, and the obvious move — take the known rates, guess the
 * rest, print a total — is the exact lie about money this app does not tell
 * anywhere. So there is no total. There is a covered sum, the people it covers,
 * and the hours it does not, and the last of those is reported as loudly as
 * the first.
 *
 * Pure, and given the rota rather than fetching it, because the privacy work
 * has already happened upstream: pay is null for anybody who has not shared it,
 * and null here is not a filtered value — the server never selected the column.
 */

export interface WeekCost {
  /** Wages on the entries whose pay is known. Not a payroll total. */
  covered: number;
  /** Hours behind that figure. */
  coveredHours: number;
  /** Hours rostered by people who do not share what they earn. */
  uncoveredHours: number;
  /** People whose pay is known, out of everybody rostered. */
  sharing: number;
  people: number;
  /**
   * Cost per hour among those who share. Offered for reading the covered part,
   * never for multiplying by the uncovered one.
   */
  perHour: number | null;
  /** The covered cost of each day, for spotting the expensive one. */
  byDay: { date: string; covered: number; uncoveredHours: number }[];
}

export function weekCost(entries: RotaEntry[], members: RotaMember[]): WeekCost {
  let covered = 0;
  let coveredHours = 0;
  let uncoveredHours = 0;

  const days = new Map<string, { covered: number; uncoveredHours: number }>();
  const rostered = new Set<number>();

  for (const entry of entries) {
    rostered.add(entry.member_id);

    const day = days.get(entry.date) ?? { covered: 0, uncoveredHours: 0 };

    if (entry.pay === null || entry.pay === undefined) {
      uncoveredHours += entry.hours;
      day.uncoveredHours += entry.hours;
    } else {
      covered += entry.pay;
      coveredHours += entry.hours;
      day.covered += entry.pay;
    }

    days.set(entry.date, day);
  }

  // Counted among the people actually on this rota, not among everybody in the
  // team: a crew of twenty where four are rostered and all four share is fully
  // covered, and "4 из 20" would say the opposite.
  const sharing = members.filter(
    (member) => rostered.has(member.member_id) && member.shares_earnings,
  ).length;

  return {
    covered: Math.round(covered * 100) / 100,
    coveredHours: Math.round(coveredHours * 10) / 10,
    uncoveredHours: Math.round(uncoveredHours * 10) / 10,
    sharing,
    people: rostered.size,
    perHour: coveredHours > 0 ? Math.round((covered / coveredHours) * 100) / 100 : null,
    byDay: [...days.entries()]
      .map(([date, figures]) => ({
        date,
        covered: Math.round(figures.covered * 100) / 100,
        uncoveredHours: Math.round(figures.uncoveredHours * 10) / 10,
      }))
      .sort((one, two) => one.date.localeCompare(two.date)),
  };
}

/**
 * Whether the covered figure is worth showing at all.
 *
 * Two people out of nine is not a wage bill, it is two people's wages, and
 * putting it under the heading "what this week costs" would teach a manager to
 * read it as the wage bill anyway.
 */
export const costIsLegible = (cost: WeekCost): boolean =>
  cost.people > 0 && cost.sharing / cost.people >= 0.5 && cost.coveredHours > 0;
