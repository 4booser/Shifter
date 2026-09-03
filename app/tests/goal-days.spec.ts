import { describe, expect, it } from 'vitest';

import { nWord, pluralWord } from '@/lib/i18n/plural';

const ru = (count: number, key: string) => pluralWord('ru', key, count);
const uk = (count: number, key: string) => pluralWord('uk', key, count);
const en = (count: number, key: string) => pluralWord('en', key, count);

/**
 * Russian counts in three: «1 день», «2 дня», «5 дней», and the teens all
 * take the last form regardless of what they end in.
 */
describe('days', () => {
  it('uses the singular for one', () => {
    expect(ru(1, 'days')).toBe('день');
    expect(ru(21, 'days')).toBe('день');
  });

  it('uses the paucal for two to four', () => {
    expect(ru(2, 'days')).toBe('дня');
    expect(ru(3, 'days')).toBe('дня');
    expect(ru(4, 'days')).toBe('дня');
    expect(ru(22, 'days')).toBe('дня');
  });

  it('uses the plural from five up', () => {
    expect(ru(5, 'days')).toBe('дней');
    expect(ru(9, 'days')).toBe('дней');
    expect(ru(25, 'days')).toBe('дней');
  });

  it('gives every teen the plural, whatever it ends in', () => {
    expect(ru(11, 'days')).toBe('дней');
    expect(ru(12, 'days')).toBe('дней');
    expect(ru(14, 'days')).toBe('дней');
  });

  it('gives a round ten the plural', () => {
    expect(ru(10, 'days')).toBe('дней');
    expect(ru(30, 'days')).toBe('дней');
  });
});

/**
 * The rest of the counted nouns, each with the form that was wrong before:
 * the app was saying «1 смен», «1234 часов», «3 раз» and «5 платежа».
 */
describe('the other counted words', () => {
  it('counts shifts', () => {
    expect(ru(1, 'shifts')).toBe('смена');
    expect(ru(2, 'shifts')).toBe('смены');
    expect(ru(5, 'shifts')).toBe('смен');
    expect(ru(182, 'shifts')).toBe('смены');
    expect(ru(11, 'shifts')).toBe('смен');
  });

  it('counts hours', () => {
    expect(ru(1, 'hours')).toBe('час');
    expect(ru(3, 'hours')).toBe('часа');
    expect(ru(8, 'hours')).toBe('часов');
    expect(ru(1234, 'hours')).toBe('часа');
    expect(ru(940, 'hours')).toBe('часов');
  });

  it('counts occurrences', () => {
    expect(ru(1, 'times')).toBe('раз');
    expect(ru(3, 'times')).toBe('раза');
    expect(ru(7, 'times')).toBe('раз');
  });

  it('counts payments', () => {
    expect(ru(2, 'payments')).toBe('платежа');
    expect(ru(5, 'payments')).toBe('платежей');
    expect(ru(21, 'payments')).toBe('платёж');
  });
});

/**
 * The reason the Russian-only version had to go: these same call sites are
 * read in three languages, and Ukrainian does not bend the way Russian does
 * («2 дні», not «2 дня»).
 */
describe('the other two languages', () => {
  it('bends Ukrainian on its own rules', () => {
    expect(uk(1, 'days')).toBe('день');
    expect(uk(2, 'days')).toBe('дні');
    expect(uk(5, 'days')).toBe('днів');
    expect(uk(11, 'days')).toBe('днів');
    expect(uk(2, 'shifts')).toBe('зміни');
  });

  it('keeps English to two forms', () => {
    expect(en(1, 'days')).toBe('day');
    expect(en(2, 'days')).toBe('days');
    expect(en(0, 'days')).toBe('days');
    expect(en(21, 'days')).toBe('days');
  });

  it('reads a fraction the way it is said out loud', () => {
    expect(ru(1.5, 'hours')).toBe('часа');
    expect(en(1.5, 'hours')).toBe('hours');
  });

  it('glues the number on for the caller', () => {
    expect(nWord('ru', 5, 'shifts')).toBe('5 смен');
    expect(nWord('uk', 5, 'shifts')).toBe('5 змін');
    expect(nWord('en', 5, 'shifts')).toBe('5 shifts');
  });

  it('falls back to the key when the word is not in the table', () => {
    expect(ru(3, 'kangaroos')).toBe('kangaroos');
  });
});
