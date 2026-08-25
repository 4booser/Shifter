import { describe, expect, it } from 'vitest';

import { CalendarDayData, CalendarEvent } from '@/lib/calendar/models';
import { buildIcs } from '@/lib/export/ics';

/**
 * The parts of RFC 5545 that calendars actually reject a file over: line
 * endings, folding, escaping, and the exclusive end of an all-day entry. None
 * of it is visible until a phone silently imports nothing.
 */
function day(overrides: Partial<CalendarDayData> = {}): CalendarDayData {
  return {
    date: '2026-03-10',
    shifts: [],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_out: 0,
    deductions: 0,
    note: null,
    colour: null,
    hours: 0,
    earned: 0,
    planned: 0,
    ...overrides,
  };
}

function shift(overrides: Partial<CalendarDayData['shifts'][number]> = {}) {
  return {
    shift_id: 1,
    name: 'Bar',
    symbol: null,
    colour: null,
    start_time: '09:00',
    end_time: '17:00',
    hours: 8,
    earned: 800,
    worked: true,
    needs_cover: false,
    actual_start: null,
    actual_end: null,
    break_minutes: 0,
    ...overrides,
  };
}

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 1,
    name: 'Leave',
    symbol: null,
    colour: '#FF5C7A',
    start_date: '2026-03-10',
    end_date: '2026-03-10',
    start_time: null,
    end_time: null,
    note: null,
    days: 1,
    ...overrides,
  };
}

const build = (days: CalendarDayData[] = [], events: CalendarEvent[] = []) =>
  buildIcs({ days, events, calendarName: 'Shifter' });

describe('ics export', () => {
  it('wraps the entries in a calendar', () => {
    const output = build();

    expect(output.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(output.endsWith('END:VCALENDAR')).toBe(true);
  });

  it('separates lines with CRLF, which the specification requires', () => {
    expect(build()).toContain('\r\n');
    expect(build()).not.toMatch(/[^\r]\n/);
  });

  it('writes a shift as a timed entry', () => {
    const output = build([day({ shifts: [shift()] })]);

    expect(output).toContain('DTSTART:20260310T090000');
    expect(output).toContain('DTEND:20260310T170000');
    expect(output).toContain('SUMMARY:Bar');
  });

  it('carries a night shift into the next day', () => {
    // Ends before it starts on the clock, so the end is tomorrow.
    const output = build([
      day({ shifts: [shift({ start_time: '22:00', end_time: '06:00' })] }),
    ]);

    expect(output).toContain('DTSTART:20260310T220000');
    expect(output).toContain('DTEND:20260311T060000');
  });

  it('marks a planned shift tentative and a worked one confirmed', () => {
    expect(build([day({ shifts: [shift({ worked: false })] })])).toContain('STATUS:TENTATIVE');
    expect(build([day({ shifts: [shift({ worked: true })] })])).toContain('STATUS:CONFIRMED');
  });

  it('ends an all-day event on the following day, because DTEND is exclusive', () => {
    const output = build([], [event()]);

    expect(output).toContain('DTSTART;VALUE=DATE:20260310');
    expect(output).toContain('DTEND;VALUE=DATE:20260311');
  });

  it('spans a multi-day event to the day after it ends', () => {
    const output = build([], [event({ end_date: '2026-03-14', days: 5 })]);

    expect(output).toContain('DTEND;VALUE=DATE:20260315');
  });

  it('escapes the characters that would otherwise read as syntax', () => {
    const output = build([], [event({ name: 'Course; part 1, day 2' })]);

    expect(output).toContain('SUMMARY:Course\\; part 1\\, day 2');
  });

  it('turns a newline in a note into its escape rather than a broken line', () => {
    const output = build([], [event({ note: 'first\nsecond' })]);

    expect(output).toContain('DESCRIPTION:first\\nsecond');
    expect(output).not.toContain('DESCRIPTION:first\r\nsecond');
  });

  it('folds a long line rather than letting it run past the limit', () => {
    const output = build([], [event({ name: 'Очень длинное название смены '.repeat(4) })]);

    for (const line of output.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it('gives each shift a stable id so a second export updates rather than duplicates', () => {
    const first = build([day({ shifts: [shift()] })]);
    const second = build([day({ shifts: [shift()] })]);

    const uid = (text: string) => text.split('\r\n').find((line) => line.startsWith('UID:'));

    expect(uid(first)).toBe(uid(second));
  });
});
