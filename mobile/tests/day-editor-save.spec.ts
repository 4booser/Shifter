import { describe, expect, it } from 'vitest';

import { CalendarDayData, toSavePayload } from '@/lib/types';

/**
 * The day editor keeps its edits on a local copy of the day and saves it
 * through `toSavePayload`. Anything the builder drops is therefore not just
 * lost history — it is the number somebody typed a second ago, gone without
 * an error, which is the worst way for a field to fail.
 */
function edited(): CalendarDayData {
  return {
    date: '2026-08-31',
    tips: null,
    tips_cash: null,
    tip_pool: null,
    deductions: null,
    note: null,
    colour: null,
    earned: 0,
    hours: 0,
    shifts: [
      {
        shift_id: 9,
        worked: true,
        needs_cover: false,
        actual_start: null,
        actual_end: null,
        break_minutes: null,
        revenue: 7300,
        guests: 52,
        zone: 'terrace',
      },
    ],
    sales: [],
  } as unknown as CalendarDayData;
}

describe('what the editor saves', () => {
  it('sends the covers somebody just counted', () => {
    expect(toSavePayload(edited()).shifts[0].guests).toBe(52);
  });

  it('sends the section somebody just picked', () => {
    expect(toSavePayload(edited()).shifts[0].zone).toBe('terrace');
  });

  it('sends the takings somebody just entered', () => {
    expect(toSavePayload(edited()).shifts[0].revenue).toBe(7300);
  });
});
