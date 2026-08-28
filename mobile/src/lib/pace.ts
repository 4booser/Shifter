/**
 * A running total by day, from the first of the period to the last.
 *
 * A point for every day rather than only for the days somebody worked: a flat
 * stretch across a week off is exactly the thing the line exists to show, and
 * a chart that skips it would draw a straight climb through a week nobody
 * worked at all.
 */
export const running = (
  days: { date: string; earned: number }[],
  from: string,
  to: string,
): number[] => {
  const byDate = new Map(days.map((day) => [day.date, day.earned]));
  const totals: number[] = [];
  const pad = (value: number) => `${value}`.padStart(2, '0');
  let sum = 0;

  for (const at = new Date(`${from}T00:00:00`); ; at.setDate(at.getDate() + 1)) {
    const key = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;

    if (key > to) break;

    sum += byDate.get(key) ?? 0;
    totals.push(sum);
  }

  return totals;
};
