/** A running total by day, from the first of the period to the last. */
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
