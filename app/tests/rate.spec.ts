import { describe, expect, it } from 'vitest';

import { perHour } from '@/lib/text/rate';

/**
 * The rule that used to be written four different ways. A month of two
 * minute-long shifts had the stats screen saying «−₴7 805 per hour, down
 * 3371%» directly under its own «Hours: 0».
 */
describe('perHour', () => {
  it('answers nothing under an hour of work', () => {
    expect(perHour(1000, 0)).toBeNull();
    expect(perHour(1000, 0.02)).toBeNull();
    expect(perHour(1000, 0.99)).toBeNull();
  });

  it('answers from a full hour up', () => {
    expect(perHour(1000, 1)).toBe(1000);
    expect(perHour(1000, 10)).toBe(100);
  });

  it('keeps a negative rate rather than hiding it', () => {
    expect(perHour(-200, 10)).toBe(-20);
  });

  it('does not care which way the hours were rounded for display', () => {
    // 0.4 h shows as «0 h»; quoting a rate beside it is the contradiction.
    expect(perHour(50, 0.4)).toBeNull();
  });
});
