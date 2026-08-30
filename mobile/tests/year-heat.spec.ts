import { describe, expect, it } from 'vitest';

import { heatGrid, heatLevel, heatThresholds } from '@/lib/year-heat';

describe('the year heat buckets', () => {
  it('takes thresholds from the paid days only', () => {
    const days = [
      ...Array.from({ length: 20 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, earned: 0 })),
      { date: '2026-02-01', earned: 100 },
      { date: '2026-02-02', earned: 200 },
      { date: '2026-02-03', earned: 300 },
      { date: '2026-02-04', earned: 400 },
    ];

    expect(heatThresholds(days)).toEqual([200, 300, 400]);
  });

  it('grades zero as recorded-cold, not as unsaid', () => {
    expect(heatLevel(0, [100, 200, 300])).toBe(0);
    expect(heatLevel(150, [100, 200, 300])).toBe(2);
    expect(heatLevel(999, [100, 200, 300])).toBe(4);
  });

  it('lays 53 Monday-first weeks and leaves unknown dates null', () => {
    const { weeks } = heatGrid([{ date: '2026-08-28', earned: 500 }], '2026-08-30');

    expect(weeks).toHaveLength(53);
    expect(weeks.every((week) => week.length === 7)).toBe(true);

    const flat = weeks.flat();
    const friday = flat.find((cell) => cell.date === '2026-08-28');
    const monday = flat.find((cell) => cell.date === '2026-08-24');

    expect(friday?.level).toBe(4);
    expect(monday?.level).toBeNull();

    // The strip ends in today's week: Sunday of the last column.
    expect(weeks.at(-1)?.at(-1)?.date).toBe('2026-08-30');
  });

  it('stamps a month label on the first column that starts inside it', () => {
    const { months } = heatGrid([], '2026-08-30');

    expect(months.length).toBeGreaterThanOrEqual(12);
    expect(months[0].index).toBe(0);
  });
});
