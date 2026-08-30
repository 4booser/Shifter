import { describe, expect, it } from 'vitest';

import { forgotten, LiveShift, plannedEndInstant } from '@/store/live';

const shift = (over: Partial<LiveShift>): LiveShift => ({
  date: '2026-08-29',
  shiftId: 1,
  name: 'Вечер',
  symbol: null,
  startedAt: '2026-08-29T17:05:00.000Z',
  hourlyRate: null,
  plannedEnd: '23:00',
  plannedStart: '17:00',
  ...over,
});

describe('the forgotten timer', () => {
  it('places a same-day end on the same day', () => {
    const end = plannedEndInstant(shift({}));

    expect(end.getDate()).toBe(29);
    expect(end.getHours()).toBe(23);
  });

  it('sends an overnight end to the next morning, not thirty hours back', () => {
    const end = plannedEndInstant(shift({ plannedEnd: '01:00' }));

    expect(end.getDate()).toBe(30);
    expect(end.getHours()).toBe(1);
  });

  it('calls a shift forgotten two hours past its plan, not one minute past', () => {
    const planned = plannedEndInstant(shift({})).getTime();

    expect(forgotten(shift({}), planned + 3600_000)).toBe(false);
    expect(forgotten(shift({}), planned + 2 * 3600_000 + 60_000)).toBe(true);
  });
});
