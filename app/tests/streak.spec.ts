import { afterEach, describe, expect, it, vi } from 'vitest';

import { shiftDay, streakOf } from '@/lib/calendar/streak';

/** Fixes "today" so the tile's answer does not depend on the day it runs. */
const on = (day: string) => vi.setSystemTime(new Date(`${day}T12:00:00`));

afterEach(() => vi.useRealTimers());

describe('streakOf', () => {
  it('counts the run ending today', () => {
    vi.useFakeTimers();
    on('2026-08-31');

    expect(streakOf(['2026-08-29', '2026-08-30', '2026-08-31']).run).toBe(3);
  });

  it('counts back from yesterday when today is off', () => {
    // The whole point of the fix: a day off is when somebody looks, and a
    // tile that says «0» on that day reads as broken rather than as rested.
    vi.useFakeTimers();
    on('2026-08-31');

    expect(streakOf(['2026-08-28', '2026-08-29', '2026-08-30']).run).toBe(3);
  });

  it('does not count a run that ended before yesterday', () => {
    vi.useFakeTimers();
    on('2026-08-31');

    expect(streakOf(['2026-08-20', '2026-08-21']).run).toBe(0);
  });

  it('remembers the best run in the period', () => {
    vi.useFakeTimers();
    on('2026-08-31');

    const worked = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-30'];

    expect(streakOf(worked).record).toBe(4);
    expect(streakOf(worked).run).toBe(1);
  });

  it('has no run and no record when nothing was worked', () => {
    vi.useFakeTimers();
    on('2026-08-31');

    expect(streakOf([])).toEqual({ run: 0, record: 0 });
  });
});

describe('shiftDay', () => {
  it('crosses a month boundary', () => {
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('crosses a year boundary', () => {
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('survives the spring clock change', () => {
    // Built at noon rather than midnight, so a day that loses an hour still
    // lands on the next date rather than back on itself.
    expect(shiftDay('2026-03-29', 1)).toBe('2026-03-30');
  });
});
