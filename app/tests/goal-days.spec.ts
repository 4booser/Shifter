import { describe, expect, it } from 'vitest';

import { daysWord } from '@/lib/text/plural';

/**
 * Russian counts in three: «1 день», «2 дня», «5 дней», and the teens all
 * take the last form regardless of what they end in.
 */
describe('daysWord', () => {
  it('uses the singular for one', () => {
    expect(daysWord(1)).toBe('день');
    expect(daysWord(21)).toBe('день');
  });

  it('uses the paucal for two to four', () => {
    expect(daysWord(2)).toBe('дня');
    expect(daysWord(3)).toBe('дня');
    expect(daysWord(4)).toBe('дня');
    expect(daysWord(22)).toBe('дня');
  });

  it('uses the plural from five up', () => {
    expect(daysWord(5)).toBe('дней');
    expect(daysWord(9)).toBe('дней');
    expect(daysWord(25)).toBe('дней');
  });

  it('gives every teen the plural, whatever it ends in', () => {
    expect(daysWord(11)).toBe('дней');
    expect(daysWord(12)).toBe('дней');
    expect(daysWord(14)).toBe('дней');
  });

  it('gives a round ten the plural', () => {
    expect(daysWord(10)).toBe('дней');
    expect(daysWord(30)).toBe('дней');
  });
});
