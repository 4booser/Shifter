import { describe, expect, it } from 'vitest';

import { keysBetween } from '@/lib/calendar/calendar-date';
import { rosterDays } from '@/lib/roster/month';

// Set before any date is made: Node reads it again on assignment.
process.env.TZ = 'America/Havana';

/** Where the clocks change at midnight, so midnight on that day does not exist. */
describe('a month in a zone whose clocks change at midnight', () => {
  it('is really running in that zone', () => {
    // 8 March 2026: 00:00 is skipped, and a date built at midnight comes out at 01:00.
    expect(new Date(2026, 2, 8).getHours()).toBe(1);
  });

  it.each([2026, 2027, 2028])('keeps the last day of March %i', (year) => {
    const days = rosterDays({ year, month: 3 }, '2000-01-01');

    expect(days).toHaveLength(31);
    expect(days[30].key).toBe(`${year}-03-31`);
  });

  it('holds every day of every month, each once', () => {
    for (const year of [2026, 2027, 2028]) {
      for (let month = 1; month <= 12; month++) {
        const days = rosterDays({ year, month }, '2000-01-01');

        expect(days).toHaveLength(new Date(Date.UTC(year, month, 0)).getUTCDate());
        expect(new Set(days.map((day) => day.key)).size).toBe(days.length);
      }
    }
  });

  it('walks across the change itself', () => {
    expect(keysBetween('2026-03-07', '2026-03-10')).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
  });

  it('still takes its two ends in either order, and one day as one day', () => {
    expect(keysBetween('2026-03-10', '2026-03-09')).toEqual(['2026-03-09', '2026-03-10']);
    expect(keysBetween('2026-03-08', '2026-03-08')).toEqual(['2026-03-08']);
  });
});
