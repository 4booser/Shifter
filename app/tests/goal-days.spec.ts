import { describe, expect, it } from 'vitest';

import { daysWord, hoursWord, paymentsWord, shiftsWord, timesWord } from '@/lib/text/plural';

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

/**
 * The rest of the counted nouns, each with the form that was wrong before:
 * the app was saying «1 смен», «1234 часов», «3 раз» and «5 платежа».
 */
describe('the other counted words', () => {
  it('counts shifts', () => {
    expect(shiftsWord(1)).toBe('смена');
    expect(shiftsWord(2)).toBe('смены');
    expect(shiftsWord(5)).toBe('смен');
    expect(shiftsWord(182)).toBe('смены');
    expect(shiftsWord(11)).toBe('смен');
  });

  it('counts hours', () => {
    expect(hoursWord(1)).toBe('час');
    expect(hoursWord(3)).toBe('часа');
    expect(hoursWord(8)).toBe('часов');
    expect(hoursWord(1234)).toBe('часа');
    expect(hoursWord(940)).toBe('часов');
  });

  it('counts occurrences', () => {
    expect(timesWord(1)).toBe('раз');
    expect(timesWord(3)).toBe('раза');
    expect(timesWord(7)).toBe('раз');
  });

  it('counts payments', () => {
    expect(paymentsWord(2)).toBe('платежа');
    expect(paymentsWord(5)).toBe('платежей');
    expect(paymentsWord(21)).toBe('платёж');
  });
});
