import { describe, expect, it } from 'vitest';

import { normaliseDate, parseCsv, toNumber } from '@/lib/export/import';

describe('parseCsv', () => {
  it('keeps a quoted comma inside one cell', () => {
    const rows = parseCsv('date,note\n2026-03-02,"late, again"');

    expect(rows[1]).toEqual(['2026-03-02', 'late, again']);
  });

  it('reads a doubled quote as one character', () => {
    const rows = parseCsv('note\n"he said ""no"""');

    expect(rows[1][0]).toBe('he said "no"');
  });

  it('picks the semicolon when that is what the file uses', () => {
    const rows = parseCsv('date;tips\n2026-03-02;1200');

    expect(rows[1]).toEqual(['2026-03-02', '1200']);
  });

  it('drops the byte order mark Excel puts in front', () => {
    const rows = parseCsv('﻿date,tips\n2026-03-02,10');

    expect(rows[0][0]).toBe('date');
  });

  it('ignores blank lines', () => {
    const rows = parseCsv('date\n\n2026-03-02\n\n');

    expect(rows).toHaveLength(2);
  });
});

describe('normaliseDate', () => {
  it('passes an ISO date through', () => {
    expect(normaliseDate('2026-03-02')).toBe('2026-03-02');
  });

  it('reorders a day-first date', () => {
    expect(normaliseDate('2.3.2026')).toBe('2026-03-02');
    expect(normaliseDate('02/03/2026')).toBe('2026-03-02');
  });

  it('converts an Excel serial number', () => {
    // 46083 days after 1899-12-30, which is how Excel stores that date.
    expect(normaliseDate('46083')).toBe('2026-03-02');
  });

  it('refuses anything it cannot place', () => {
    expect(normaliseDate('last tuesday')).toBeNull();
    expect(normaliseDate('')).toBeNull();
  });
});

describe('toNumber', () => {
  it('accepts a comma as the decimal separator', () => {
    expect(toNumber('1200,50')).toBe(1200.5);
  });

  it('ignores spaces used to group thousands', () => {
    expect(toNumber('12 000')).toBe(12000);
  });

  it('returns null for an empty cell rather than zero', () => {
    // Zero and "not filled in" mean different things on a day.
    expect(toNumber('   ')).toBeNull();
  });

  it('returns null for text', () => {
    expect(toNumber('много')).toBeNull();
  });
});
