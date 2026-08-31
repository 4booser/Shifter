import { describe, expect, it } from 'vitest';

import { CalendarDayData, toSavePayload } from '@/lib/calendar/models';

/**
 * The server rebuilds every shift row of a day from its template on save, so
 * a field this payload leaves out is erased rather than left alone. Neither
 * front shows the covers or the section on the day it edits, which is exactly
 * why they have to be handed back untouched.
 */
const day = {
  date: '2026-08-31',
  colour: '#22C55E',
  note: 'busy',
  tips: 400,
  tips_cash: 100,
  tip_pool: null,
  deductions: 250,
  deduction_reason: 'breakage',
  version: 7,
  earned: 0,
  hours: 0,
  shifts: [
    {
      shift_id: 4,
      worked: true,
      needs_cover: false,
      actual_start: '17:02',
      actual_end: '23:44',
      break_minutes: 30,
      revenue: 8200,
      guests: 64,
      zone: 'terrace',
    },
  ],
  sales: [{ sales_id: 2, quantity: 5 }],
} as unknown as CalendarDayData;

describe('toSavePayload', () => {
  it('hands the covers and the section back', () => {
    const [shift] = toSavePayload(day).shifts;

    expect(shift.guests).toBe(64);
    expect(shift.zone).toBe('terrace');
  });

  it('keeps the recorded clock and the takings', () => {
    const [shift] = toSavePayload(day).shifts;

    expect(shift.actual_start).toBe('17:02');
    expect(shift.actual_end).toBe('23:44');
    expect(shift.break_minutes).toBe(30);
    expect(shift.revenue).toBe(8200);
  });

  it('carries the day itself, version included', () => {
    const payload = toSavePayload(day);

    expect(payload.tips).toBe(400);
    expect(payload.tips_cash).toBe(100);
    expect(payload.deductions).toBe(250);
    expect(payload.deduction_reason).toBe('breakage');
    expect(payload.note).toBe('busy');
    expect(payload.colour).toBe('#22C55E');
    expect(payload.sales).toEqual([{ sales_id: 2, quantity: 5 }]);
    expect(payload.version).toBe(7);
  });

  it('gives a day nobody has touched an empty payload', () => {
    const payload = toSavePayload(undefined);

    expect(payload.shifts).toEqual([]);
    expect(payload.sales).toEqual([]);
    expect(payload.tips).toBeNull();
  });
});
