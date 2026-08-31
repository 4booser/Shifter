import { describe, expect, it } from 'vitest';

import { CalendarDayData, toSavePayload } from '@/lib/calendar/models';

/**
 * A save replaces the day: the server builds every shift row from the
 * template again and only keeps what the request carried. So the payload
 * builder has to hand back everything the day already held — anything it
 * drops is not left alone, it is erased on the next unrelated edit.
 */
const day = {
  date: '2026-08-31',
  colour: '#22C55E',
  note: 'busy',
  tips: 400,
  tips_cash: 100,
  tip_pool: null,
  deductions: 50,
  deduction_reason: 'meal',
  earned: 0,
  hours: 0,
  shifts: [
    {
      shift_id: 7,
      name: 'Bar',
      worked: true,
      needs_cover: false,
      actual_start: '17:02',
      actual_end: '23:44',
      break_minutes: 30,
      revenue: 8200,
      guests: 64,
      zone: 'terrace',
      earned: 0,
      hours: 6,
      start_time: '17:00',
      end_time: '23:00',
    },
  ],
  sales: [{ sales_id: 3, quantity: 12 }],
} as unknown as CalendarDayData;

describe('toSavePayload', () => {
  it('carries the counted covers and the section back', () => {
    const [shift] = toSavePayload(day).shifts;

    expect(shift.guests).toBe(64);
    expect(shift.zone).toBe('terrace');
  });

  it('carries the recorded clock and the takings back', () => {
    const [shift] = toSavePayload(day).shifts;

    expect(shift.actual_start).toBe('17:02');
    expect(shift.actual_end).toBe('23:44');
    expect(shift.break_minutes).toBe(30);
    expect(shift.revenue).toBe(8200);
  });

  it('carries what the day itself holds', () => {
    const payload = toSavePayload(day);

    expect(payload.tips).toBe(400);
    expect(payload.tips_cash).toBe(100);
    expect(payload.deductions).toBe(50);
    expect(payload.note).toBe('busy');
    expect(payload.colour).toBe('#22C55E');
    expect(payload.sales).toEqual([{ sales_id: 3, quantity: 12 }]);
  });

  it('gives an empty day an empty payload rather than throwing', () => {
    const payload = toSavePayload(undefined);

    expect(payload.shifts).toEqual([]);
    expect(payload.sales).toEqual([]);
    expect(payload.tips).toBeNull();
  });
});
