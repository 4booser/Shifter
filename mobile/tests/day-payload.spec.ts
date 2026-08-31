import { describe, expect, it } from 'vitest';

import { CalendarDayData, toSavePayload } from '@/lib/types';

/**
 * The server rebuilds every shift row of a day from its template on save, so
 * a field the phone leaves out of the request is erased rather than left
 * alone. The positions were lost that way once already; the covers counted
 * and the section worked are the same shape of mistake waiting to happen,
 * and the phone shows neither — so it can only hand them back untouched.
 */
const day = {
  date: '2026-08-31',
  colour: null,
  note: null,
  tips: 300,
  tips_cash: 100,
  tip_pool: null,
  deductions: null,
  earned: 0,
  hours: 0,
  shifts: [
    {
      shift_id: 4,
      worked: true,
      needs_cover: false,
      actual_start: '18:00',
      actual_end: '02:00',
      break_minutes: 20,
      revenue: 5400,
      guests: 41,
      zone: 'bar',
    },
  ],
  sales: [{ sales_id: 2, quantity: 5 }],
} as unknown as CalendarDayData;

describe('toSavePayload', () => {
  it('hands the covers and the section back untouched', () => {
    const [shift] = toSavePayload(day).shifts;

    expect(shift.guests).toBe(41);
    expect(shift.zone).toBe('bar');
  });

  it('keeps the recorded clock and the takings', () => {
    const [shift] = toSavePayload(day).shifts;

    expect(shift.actual_start).toBe('18:00');
    expect(shift.actual_end).toBe('02:00');
    expect(shift.break_minutes).toBe(20);
    expect(shift.revenue).toBe(5400);
  });

  it('keeps the positions sold', () => {
    expect(toSavePayload(day).sales).toEqual([{ sales_id: 2, quantity: 5 }]);
  });
});
