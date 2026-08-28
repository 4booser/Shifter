import { describe, expect, it } from 'vitest';

import { running } from '@/lib/pace';

/**
 * A running total has to have a point for every day of the period, not only
 * for the days somebody worked — a flat stretch is exactly the thing the line
 * exists to show.
 */
describe('the running total', () => {
  const days = [
    { date: '2026-08-01', earned: 1000 },
    { date: '2026-08-03', earned: 500 },
    { date: '2026-08-05', earned: 2000 },
  ];

  it('has a point for every day, worked or not', () => {
    expect(running(days, '2026-08-01', '2026-08-05')).toEqual([1000, 1000, 1500, 1500, 3500]);
  });

  it('carries the total flat across a day off', () => {
    const totals = running(days, '2026-08-01', '2026-08-05');

    expect(totals[1]).toBe(totals[0]);
  });

  it('starts at nothing where the period opens with a day off', () => {
    expect(running(days, '2026-07-30', '2026-08-01')).toEqual([0, 0, 1000]);
  });

  it('stops at the end of the period rather than at the last shift', () => {
    expect(running(days, '2026-08-01', '2026-08-08')).toHaveLength(8);
  });

  it('has nothing to draw for an empty period', () => {
    expect(running([], '2026-08-01', '2026-08-03')).toEqual([0, 0, 0]);
  });

  it('crosses a month boundary', () => {
    const across = [{ date: '2026-07-31', earned: 700 }, { date: '2026-08-01', earned: 300 }];

    expect(running(across, '2026-07-31', '2026-08-02')).toEqual([700, 1000, 1000]);
  });
});
