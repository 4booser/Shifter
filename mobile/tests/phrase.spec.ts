import { describe, expect, it } from 'vitest';

import { readNumber, readPhrase } from '@/lib/phrase';

describe('the number in a sentence', () => {
  it('reads digits', () => {
    expect(readNumber(['1200'])).toBe(1200);
  });

  it('reads a number said out loud', () => {
    // Speech recognition hands over words, not digits, and this is the half
    // of the feature that actually has to work.
    expect(readNumber(['тисячу', 'двісті'])).toBe(1200);
    expect(readNumber(['тысячу', 'двести'])).toBe(1200);
    expect(readNumber(['три', 'тысячи', 'пятьсот'])).toBe(3500);
  });

  it('treats a bare thousand as a thousand', () => {
    // Not as nothing times a thousand, which is what a naive accumulator does
    // and which turns "тысяча чаевых" into zero.
    expect(readNumber(['тисяча'])).toBe(1000);
  });

  it('reads the shorthand people type', () => {
    expect(readNumber(['12к'])).toBe(12_000);
    expect(readNumber(['5тыс'])).toBe(5_000);
    expect(readNumber(['34', 'тысячи'])).toBe(34_000);
  });

  it('reads a decimal', () => {
    expect(readNumber(['342,50'])).toBe(342.5);
  });

  it('has no number to report where none was said', () => {
    expect(readNumber(['чаевые', 'были', 'хорошие'])).toBeNull();
  });
});

describe('what the sentence was about', () => {
  it('reads the ordinary thing somebody says', () => {
    expect(readPhrase('записал тысячу двести чаевых')).toEqual({
      kind: 'tips',
      amount: 1200,
      rest: 'записал',
    });
  });

  it('tells the five things apart', () => {
    expect(readPhrase('выручка 34 тысячи')?.kind).toBe('revenue');
    expect(readPhrase('штраф 200')?.kind).toBe('deduction');
    expect(readPhrase('потратил 150 на такси')?.kind).toBe('expense');
    expect(readPhrase('отработал 8 часов')?.kind).toBe('hours');
  });

  it('prefers the specific word when a sentence has two', () => {
    // "чаевые с выручки" is about tips. Landing on revenue would file
    // somebody's tips as the venue's takings.
    expect(readPhrase('чаевые с выручки 800')?.kind).toBe('tips');
  });

  it('keeps the rest for the note', () => {
    expect(readPhrase('штраф 200 за разбитый бокал')?.rest).toBe('за разбитый бокал');
  });

  it('says nothing about a sentence that named nothing', () => {
    // Guessing a kind would put somebody's tips in the fines column.
    expect(readPhrase('сегодня было тяжело')).toBeNull();
    expect(readPhrase('')).toBeNull();
  });

  it('reads a thing with no number as that thing, awaiting a number', () => {
    // The screen shows what it understood and the person fills the gap,
    // which is better than refusing a half-recognised sentence outright.
    expect(readPhrase('чаевые')).toEqual({ kind: 'tips', amount: null, rest: '' });
  });

  it('reads Ukrainian as readily as Russian', () => {
    expect(readPhrase('чайових дві тисячі')).toEqual({
      kind: 'tips',
      amount: 2000,
      rest: '',
    });
  });
});
