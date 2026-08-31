import { describe, expect, it } from 'vitest';

import { dayOf, spanOf } from '@/lib/calendar/spans';

describe('spanOf', () => {
  it('names the month once when the period stays inside it', () => {
    expect(spanOf('2026-06-16', '2026-06-30')).toBe('16–30 июня');
  });

  it('puts the month in the genitive, not the nominative', () => {
    // «16–30 июнь» is what asking for the month alone returns, and it is the
    // wrong case after a date.
    expect(spanOf('2026-06-16', '2026-06-30')).not.toContain('июнь ');
    expect(spanOf('2026-08-01', '2026-08-15')).toBe('1–15 августа');
  });

  it('names both months when the period crosses one', () => {
    expect(spanOf('2026-12-28', '2027-01-10')).toBe('28 декабря — 10 января');
  });
});

describe('dayOf', () => {
  it('says a single date short', () => {
    expect(dayOf('2026-09-05')).toMatch(/^5 сент/);
  });
});
