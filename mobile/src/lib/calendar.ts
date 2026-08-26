/** Date helpers shared by the mobile screens. Keys are 'YYYY-MM-DD'. */

export const pad = (value: number) => `${value}`.padStart(2, '0');

export const todayKey = (): string => {
  const now = new Date();

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export interface YearMonth {
  year: number;
  month: number;
}

export const currentMonth = (): YearMonth => {
  const now = new Date();

  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

export const addMonths = ({ year, month }: YearMonth, delta: number): YearMonth => {
  const index = year * 12 + (month - 1) + delta;

  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

export const monthBounds = ({ year, month }: YearMonth) => ({
  from: `${year}-${pad(month)}-01`,
  to: `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`,
});

/** Monday-first cell list for the grid, padded with nulls to full weeks. */
export const monthCells = ({ year, month }: YearMonth): (string | null)[] => {
  const days = new Date(year, month, 0).getDate();
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells: (string | null)[] = new Array<null>(lead).fill(null);

  for (let day = 1; day <= days; day++) cells.push(`${year}-${pad(month)}-${pad(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
};

export const monthLabel = ({ year, month }: YearMonth): string => {
  const raw = new Date(year, month - 1, 1).toLocaleDateString('ru', { month: 'long', year: 'numeric' });

  return raw[0].toUpperCase() + raw.slice(1);
};
