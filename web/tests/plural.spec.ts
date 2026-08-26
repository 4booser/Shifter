import { describe, expect, it } from 'vitest';

import { nWord, pluralWord } from '@/lib/i18n/plural';

describe('pluralWord', () => {
  it('bends Russian three ways, including the teens trap', () => {
    expect(pluralWord('ru', 'shifts', 1)).toBe('смена');
    expect(pluralWord('ru', 'shifts', 2)).toBe('смены');
    expect(pluralWord('ru', 'shifts', 5)).toBe('смен');
    expect(pluralWord('ru', 'shifts', 11)).toBe('смен');
    expect(pluralWord('ru', 'shifts', 21)).toBe('смена');
    expect(pluralWord('ru', 'shifts', 22)).toBe('смены');
  });

  it('reads fractions with the few-form, the way Russian says them', () => {
    expect(pluralWord('ru', 'hours', 1.5)).toBe('часа');
    expect(pluralWord('uk', 'hours', 1.5)).toBe('години');
  });

  it('keeps Ukrainian and English honest too', () => {
    expect(pluralWord('uk', 'people', 1)).toBe('людина');
    expect(pluralWord('uk', 'people', 3)).toBe('людини');
    expect(pluralWord('uk', 'people', 7)).toBe('людей');
    expect(pluralWord('en', 'days', 1)).toBe('day');
    expect(pluralWord('en', 'days', 2)).toBe('days');
  });

  it('falls back to the key rather than crashing on an unknown word', () => {
    expect(pluralWord('ru', 'unicorns', 3)).toBe('unicorns');
  });
});

describe('nWord', () => {
  it('glues number and word', () => {
    expect(nWord('ru', 5, 'days')).toBe('5 дней');
    expect(nWord('en', 1, 'shifts')).toBe('1 shift');
  });
});
