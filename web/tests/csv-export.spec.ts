import { describe, expect, it } from 'vitest';

import { CalendarDayData } from '@/lib/calendar/models';
import { daysToCsv } from '@/lib/calendar/csv-export';
import { parseCsv } from '@/lib/export/import';

/**
 * The file people press «выгрузить» on and open in a spreadsheet.
 *
 * A note is the one free-text field in the app — it is where people put what
 * the schema has no column for — and a spreadsheet reads a leading «=» as a
 * formula and evaluates it on open.
 */
function day(note: string): CalendarDayData {
  return {
    date: '2026-09-01',
    shifts: [],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_pool: null,
    tip_out: 0,
    deductions: 0,
    note,
    colour: null,
    below_floor: false,
    hours: 0,
    earned: 0,
    planned: 0,
  };
}

describe('daysToCsv', () => {
  it('does not hand a spreadsheet a formula to run', () => {
    const csv = daysToCsv([day('=1+1')]);
    const rows = parseCsv(csv);

    expect(rows[1].at(-1)).toBe("'=1+1");
  });

  it('leaves an ordinary note exactly as it was written', () => {
    const csv = daysToCsv([day('Двойная смена, устал')]);
    const rows = parseCsv(csv);

    expect(rows[1].at(-1)).toBe('Двойная смена, устал');
  });
});
