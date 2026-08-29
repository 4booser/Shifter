import { describe, expect, it } from 'vitest';

import { readIcs } from '@/lib/import/ics';

const wrap = (body: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`;

const event = (lines: string[]) =>
  `BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT`;

describe('the small ICS reader', () => {
  it('reads a plain timed event with a folded summary', () => {
    const read = readIcs(wrap(event([
      'SUMMARY:Смена в ба\r\n ре',
      'DTSTART;TZID=Europe/Kyiv:20260901T160000',
      'DTEND;TZID=Europe/Kyiv:20260902T020000',
    ])));

    expect(read.occurrences).toEqual([
      { summary: 'Смена в баре', date: '2026-09-01', start: '16:00', end: '02:00' },
    ]);
    expect(read.unparsed).toEqual([]);
  });

  it('keeps an all-day event as a date without times', () => {
    const read = readIcs(wrap(event([
      'SUMMARY:Выходной',
      'DTSTART;VALUE=DATE:20260905',
    ])));

    expect(read.occurrences[0]).toEqual({
      summary: 'Выходной', date: '2026-09-05', start: null, end: null,
    });
  });

  it('unrolls a weekly rule with BYDAY and UNTIL', () => {
    // Tuesdays and Thursdays for two weeks, starting Tuesday the 1st.
    const read = readIcs(wrap(event([
      'SUMMARY:Английский',
      'DTSTART;TZID=Europe/Kyiv:20260901T190000',
      'DTEND;TZID=Europe/Kyiv:20260901T203000',
      'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260910T000000',
    ])));

    expect(read.occurrences.map((o) => o.date)).toEqual([
      '2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10',
    ]);
    expect(read.occurrences[0].start).toBe('19:00');
  });

  it('unrolls a daily rule with COUNT', () => {
    const read = readIcs(wrap(event([
      'SUMMARY:Заезд',
      'DTSTART:20260901T100000',
      'RRULE:FREQ=DAILY;COUNT=3',
    ])));

    expect(read.occurrences.map((o) => o.date)).toEqual([
      '2026-09-01', '2026-09-02', '2026-09-03',
    ]);
  });

  it('refuses a monthly rule out loud instead of guessing', () => {
    const read = readIcs(wrap(event([
      'SUMMARY:Зарплата',
      'DTSTART:20260901T100000',
      'RRULE:FREQ=MONTHLY;BYMONTHDAY=1',
    ])));

    expect(read.occurrences).toEqual([]);
    expect(read.unparsed).toEqual(['Зарплата']);
  });

  it('caps an endless weekly rule at the horizon, not at infinity', () => {
    const read = readIcs(wrap(event([
      'SUMMARY:Вечная',
      'DTSTART:20260901T100000',
      'RRULE:FREQ=WEEKLY',
    ])), 28);

    // Start day plus four more weeks inside the 28-day horizon.
    expect(read.occurrences.length).toBe(5);
  });
});
