import { formatElapsed, liveTick } from '@/lib/live/live-shift';
import { ShiftTemplate } from '@/lib/calendar/models';

const template = (over: Partial<ShiftTemplate>): ShiftTemplate => ({
  id: 1,
  name: 'Bar',
  symbol: null,
  location_id: null,
  location_name: null,
  location_colour: null,
  colour: null,
  effective_colour: null,
  start_time: '10:00',
  end_time: '18:00',
  salary_period: 'hour',
  salary_amount: 200,
  break_minutes: 0,
  hours: 8,
  archived: false,
  ...over,
});

describe('liveTick', () => {
  it('meters hourly pay by the clock', () => {
    const tick = liveTick(template({}), 0, 90 * 60_000);

    expect(tick.earned).toBeCloseTo(300);
    expect(tick.progress).toBeCloseTo(1.5 / 8);
  });

  it('fills a day rate proportionally and caps it at the full amount', () => {
    const daily = template({ salary_period: 'day', salary_amount: 1600 });

    expect(liveTick(daily, 0, 4 * 3600_000).earned).toBeCloseTo(800);
    // Overstaying a fixed day rate does not mint money.
    expect(liveTick(daily, 0, 12 * 3600_000).earned).toBeCloseTo(1600);
  });

  it('refuses to meter a monthly wage per minute', () => {
    const monthly = template({ salary_period: 'month', salary_amount: 40_000 });

    expect(liveTick(monthly, 0, 3600_000).earned).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('formats like a clock', () => {
    expect(formatElapsed(0)).toBe('0:00:00');
    expect(formatElapsed(3_723_000)).toBe('1:02:03');
  });
});

import { LiveShift, workedMs } from '@/lib/live/live-shift';

describe('workedMs', () => {
  const base: LiveShift = { shiftId: 1, date: '2026-03-02', startedAt: 0, breakMs: 0, pausedAt: null };

  it('subtracts banked breaks from the clock', () => {
    expect(workedMs({ ...base, breakMs: 600_000 }, 3_600_000)).toBe(3_000_000);
  });

  it('keeps subtracting while a pause is still running', () => {
    expect(workedMs({ ...base, pausedAt: 1_800_000 }, 3_600_000)).toBe(1_800_000);
  });

  it('meters pay through the pause-aware clock', () => {
    // An hour on the clock, half of it on a break, at 200/hour.
    const paused = { ...base, breakMs: 1_800_000 };
    const template = {
      id: 1, name: 'Bar', symbol: null, location_id: null, location_name: null,
      location_colour: null, colour: null, effective_colour: null,
      start_time: '10:00', end_time: '18:00', salary_period: 'hour' as const,
      salary_amount: 200, break_minutes: 0, hours: 8, archived: false,
    };

    expect(liveTick(template, paused, 3_600_000).earned).toBeCloseTo(100);
  });
});
