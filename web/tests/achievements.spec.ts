import { achievementStats, unlockedIds } from '@/lib/calendar/achievements';
import { CalendarDayData } from '@/lib/calendar/models';

function day(date: string, hours: number, start = '10:00', worked = true): CalendarDayData {
  return {
    date,
    shifts: [
      {
        shift_id: 1,
        name: 'Bar',
        symbol: null,
        colour: null,
        start_time: start,
        end_time: '18:00',
        hours,
        earned: hours * 100,
        worked,
        needs_cover: false,
        actual_start: null,
        actual_end: null,
        break_minutes: 0,
      },
    ],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    hours: worked ? hours : 0,
    earned: worked ? hours * 100 : 0,
    planned: worked ? 0 : hours * 100,
  };
}

describe('achievementStats', () => {
  it('counts a streak across consecutive dates only', () => {
    const stats = achievementStats([
      day('2026-03-02', 8),
      day('2026-03-03', 8),
      day('2026-03-04', 8),
      // The gap resets the run.
      day('2026-03-06', 8),
    ]);

    expect(stats.longestStreak).toBe(3);
  });

  it('ignores planned shifts everywhere shifts are counted', () => {
    const stats = achievementStats([day('2026-03-02', 8, '10:00', false)]);

    expect(stats.shifts).toBe(0);
    expect(stats.longestStreak).toBe(0);
  });

  it('classes a 21:00 start as night and a 06:00 start as early', () => {
    const stats = achievementStats([
      day('2026-03-02', 8, '21:00'),
      day('2026-03-03', 8, '06:00'),
    ]);

    expect(stats.nightShifts).toBe(1);
    expect(stats.earlyShifts).toBe(1);
  });

  it('finds the fullest Monday-to-Sunday week', () => {
    // 2026-03-02 is a Monday; five worked days that week.
    const stats = achievementStats(
      ['02', '03', '04', '05', '06'].map((d) => day(`2026-03-${d}`, 8)),
    );

    expect(stats.fullestWeek).toBe(5);
  });
});

describe('unlockedIds', () => {
  it('unlocks the first shift from a single worked day', () => {
    const stats = achievementStats([day('2026-03-02', 8)]);

    expect(unlockedIds(stats)).toContain('first-shift');
    expect(unlockedIds(stats)).not.toContain('ten-shifts');
  });

  it('unlocks the marathon on a 12-hour day', () => {
    const stats = achievementStats([day('2026-03-02', 12)]);

    expect(unlockedIds(stats)).toContain('marathon');
  });
});
