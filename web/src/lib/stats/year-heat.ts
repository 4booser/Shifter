/**
 * The year as a heat grid: which weeks fed the month and which starved it.
 *
 * Mirrored verbatim in mobile/src/lib/year-heat.ts — the figure disagreeing
 * across platforms is a bug by definition. Buckets are quartiles of the
 * *non-zero* earned days: most rows in a part-time year are zeros, and
 * letting them into the thresholds would paint every worked day "hottest".
 */

export interface HeatDay {
  date: string;
  earned: number;
}

export interface HeatCell {
  date: string;
  earned: number | null;
  /** 0 = recorded but нулевой; 1..4 = quartile of the non-zero days. */
  level: number | null;
}

/** Quartile thresholds over the non-zero earned values, ascending. */
export const heatThresholds = (days: HeatDay[]): number[] => {
  const paid = days
    .map((day) => day.earned)
    .filter((earned) => earned > 0)
    .sort((one, two) => one - two);

  if (paid.length === 0) return [];

  const at = (share: number) => paid[Math.min(paid.length - 1, Math.floor(share * paid.length))];

  return [at(0.25), at(0.5), at(0.75)];
};

export const heatLevel = (earned: number, thresholds: number[]): number => {
  if (earned <= 0) return 0;
  if (thresholds.length === 0) return 4;

  // Strict: a day sitting exactly on a quartile belongs to the warmer
  // bucket, and a year with one distinct wage is all level 4, not all 1.
  if (earned < thresholds[0]) return 1;
  if (earned < thresholds[1]) return 2;
  if (earned < thresholds[2]) return 3;

  return 4;
};

const key = (date: Date): string => {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${mm}-${dd}`;
};

/**
 * The grid: 53 Monday-first week columns ending in the week of `today`.
 * A date with no record is level null — unsaid, not zero; a future date
 * inside the last column is null too.
 */
export const heatGrid = (
  days: HeatDay[],
  today: string,
): { weeks: HeatCell[][]; months: { index: number; label: number }[] } => {
  const recorded = new Map(days.map((day) => [day.date, day.earned]));
  const thresholds = heatThresholds(days);

  const end = new Date(`${today}T12:00:00`);
  const start = new Date(end);

  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 52 * 7);

  const weeks: HeatCell[][] = [];
  const months: { index: number; label: number }[] = [];
  let lastMonth = -1;

  for (let step = 0; step < 53 * 7; step += 1) {
    const cursor = new Date(start.getTime() + step * 86400000);

    if (step % 7 === 0) {
      weeks.push([]);

      if (cursor.getMonth() !== lastMonth) {
        months.push({ index: weeks.length - 1, label: cursor.getMonth() + 1 });
        lastMonth = cursor.getMonth();
      }
    }

    const stamp = key(cursor);
    const past = cursor.getTime() <= end.getTime();
    const earned = recorded.get(stamp);

    weeks.at(-1)!.push({
      date: stamp,
      earned: past && earned !== undefined ? earned : null,
      level: past && earned !== undefined ? heatLevel(earned, thresholds) : null,
    });
  }

  return { weeks, months };
};
