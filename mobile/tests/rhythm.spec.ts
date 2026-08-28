import { describe, expect, it } from 'vitest';

import { bestWeekday, byWeekday } from '@/lib/rhythm';

const day = (date: string, hours: number, earned: number) => ({ date, hours, earned });

/**
 * Which day of the week is worth working. Averaged per hour, because a
 * Saturday that pays more only because it is longer is not a better Saturday.
 */
describe('the week, by what a day pays', () => {
  it('has a row for every day, Monday first', () => {
    const rows = byWeekday([]);

    expect(rows).toHaveLength(7);
    expect(rows[0].weekday).toBe(0);
  });

  it('files a day under its own weekday', () => {
    // 21 August 2026 is a Friday.
    const rows = byWeekday([day('2026-08-21', 8, 2400)]);

    expect(rows[4].days).toBe(1);
    expect(rows[4].perHour).toBe(300);
  });

  it('averages by the hour rather than by the shift', () => {
    // A long cheap Friday and a short rich one: 12 hours for 2400 and 4 for
    // 1600 is 4000 over 16 hours, not the average of 200 and 400.
    const rows = byWeekday([day('2026-08-21', 12, 2400), day('2026-08-28', 4, 1600)]);

    expect(rows[4].perHour).toBe(250);
  });

  it('says nothing about a day nobody has worked', () => {
    expect(byWeekday([day('2026-08-21', 8, 2400)])[0].perHour).toBeNull();
  });

  it('ignores a day with no hours on it', () => {
    expect(byWeekday([day('2026-08-21', 0, 0)])[4].days).toBe(0);
  });
});

describe('naming the best and worst day', () => {
  const twice = (date: string, next: string, hours: number, earned: number) => [
    day(date, hours, earned),
    day(next, hours, earned),
  ];

  it('names them once there are two of each', () => {
    const rows = byWeekday([
      ...twice('2026-08-21', '2026-08-28', 8, 3200),
      ...twice('2026-08-18', '2026-08-25', 8, 1600),
    ]);
    const found = bestWeekday(rows);

    expect(found?.best.weekday).toBe(4);
    expect(found?.worst.weekday).toBe(1);
  });

  it('says nothing where one day has been worked once', () => {
    const rows = byWeekday([day('2026-08-21', 8, 3200), ...twice('2026-08-18', '2026-08-25', 8, 1600)]);

    expect(bestWeekday(rows)).toBeNull();
  });

  it('says nothing where every day pays the same', () => {
    const rows = byWeekday([
      ...twice('2026-08-21', '2026-08-28', 8, 1600),
      ...twice('2026-08-18', '2026-08-25', 8, 1600),
    ]);

    expect(bestWeekday(rows)).toBeNull();
  });

  it('says nothing at all about a week with one working day', () => {
    expect(bestWeekday(byWeekday(twice('2026-08-21', '2026-08-28', 8, 3200)))).toBeNull();
  });
});
