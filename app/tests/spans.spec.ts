import { describe, expect, it } from 'vitest';

import { dayOf, spanOf } from '@/lib/calendar/spans';

/**
 * A pay period is said as one span with the month named once. The month has
 * to come out of the formatter's own parts: the first version cut the digits
 * off the front of «15 июня», which is only where the day sits in Russian —
 * English puts it last, and «1–15 June» came out as «1–15 June 15».
 */
describe('spanOf', () => {
  it('names the month once inside a single month', () => {
    expect(spanOf('2026-06-01', '2026-06-15', 'ru')).toBe('1–15 июня');
    expect(spanOf('2026-06-01', '2026-06-15', 'uk')).toBe('1–15 червня');
    expect(spanOf('2026-06-01', '2026-06-15', 'en')).toBe('1–15 June');
  });

  it('names both months when the period crosses one', () => {
    expect(spanOf('2026-06-25', '2026-07-05', 'ru')).toBe('25 июня — 5 июля');
    expect(spanOf('2026-06-25', '2026-07-05', 'en')).toBe('25 June — 5 July');
  });

  it('never leaves a day number stranded in the month', () => {
    for (const lang of ['ru', 'uk', 'en']) {
      expect(spanOf('2026-06-01', '2026-06-15', lang)).not.toMatch(/\d+\s*$/);
    }
  });

  it('says a single day in the reader’s own language', () => {
    expect(dayOf('2026-06-20', 'ru')).toMatch(/июн/);
    expect(dayOf('2026-06-20', 'en')).toMatch(/Jun/);
  });
});
