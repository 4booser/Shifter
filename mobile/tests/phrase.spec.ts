import { describe, expect, it } from 'vitest';

import { asNumber, readNumber, readPhrase } from '@/lib/phrase';

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

describe('what speech recognition actually returns', () => {
  // Not invented: these are the transcriptions iOS produced from synthesised
  // Russian, checked before this shipped. Every one of them is a shape I had
  // not expected — recognition writes digits, not words.

  it('rejoins the thousands it splits with a space', () => {
    // "выручка тридцать четыре тысячи" comes back as "Выручка 34 000", which
    // reads as two numbers and adds up to thirty-four. That is a month's
    // takings recorded at a thousandth of itself.
    expect(readPhrase('Выручка 34 000')).toEqual({
      kind: 'revenue',
      amount: 34_000,
      rest: '',
    });
  });

  it('does not glue together two numbers that merely follow each other', () => {
    // A thousands separator is exactly three digits after at most three.
    // Anything else is two numbers said in a row.
    expect(readNumber(['1234', '5678'])).toBe(1234 + 5678);
    expect(readNumber(['12', '34'])).toBe(46);
  });

  it('reads a decimal that recognition wrote with a comma', () => {
    // "двенадцать с половиной часов" comes back as "12,5 часов". Stripping
    // that comma as punctuation makes it twelve and five, which add to
    // seventeen — an hour and a half of unpaid time, every time.
    expect(readPhrase('Отработал 12,5 часов')?.amount).toBe(12.5);
  });

  it('drops an orphan preposition rather than calling it a note', () => {
    expect(readPhrase('Штраф 50')?.rest).toBe('');
  });

  it('reads a dictated duration that came back as a clock', () => {
    // "отработал восемь часов" comes back as "Отработал 08:00" — recognition
    // heard a length of time and wrote a clock face.
    expect(readPhrase('Отработал 08:00')?.amount).toBe(8);
    expect(readPhrase('Отработал 07:30')?.amount).toBe(7.5);
  });

  it('leaves a clock alone where a clock is what was meant', () => {
    // "чаевые 18:00" is somebody dictating a time. Reading it as eighteen
    // hryvnia would be worse than reading nothing at all.
    expect(readPhrase('Чаевые 18:00')?.amount).toBeNull();
  });

  it('reads the transcriptions exactly as iOS produced them', () => {
    expect(readPhrase('Чаевые 1200')).toEqual({ kind: 'tips', amount: 1200, rest: '' });
    // Both the verb and the noun name the kind, so the note would be a lone
    // "на" — the wreckage of a sentence rather than a note. Empty is honest;
    // the kind already carries the meaning.
    expect(readPhrase('Потратил 150 на такси')).toEqual({
      kind: 'expense',
      amount: 150,
      rest: '',
    });

    // Recognition clipped the last word. The note keeps what survived rather
    // than the app pretending it understood the whole sentence.
    const fine = readPhrase('Штраф 200 за разбитый бока')!;

    expect(fine.kind).toBe('deduction');
    expect(fine.amount).toBe(200);
    expect(fine.rest).toBe('за разбитый бока');
  });
});

describe('the two separators recognition writes', () => {
  // Ukrainian dictation groups the thousands with a full stop and marks
  // decimals with a comma. Reading the first as a decimal records a month's
  // takings at a thousandth of themselves — and it looks entirely reasonable
  // on the way past, which is why it took real transcription to find.

  it('reads a stop before three digits as a thousands separator', () => {
    expect(asNumber('34.000')).toBe(34_000);
    expect(asNumber('1.500.000')).toBe(1_500_000);
    expect(readPhrase('Виручка 34.000')?.amount).toBe(34_000);
  });

  it('reads a comma as a decimal point', () => {
    expect(asNumber('12,5')).toBe(12.5);
    expect(asNumber('1,25')).toBe(1.25);
  });

  it('reads a stop before anything but three digits as a decimal point', () => {
    expect(asNumber('12.5')).toBe(12.5);
    expect(asNumber('0.75')).toBe(0.75);
  });

  it('reads the Ukrainian transcriptions exactly as iOS produced them', () => {
    expect(readPhrase('Чайові 1200')).toEqual({ kind: 'tips', amount: 1200, rest: '' });
    expect(readPhrase('Відпрацював 8 годин')?.amount).toBe(8);

    const fine = readPhrase('Штраф 200 за розбитий келих')!;

    expect(fine.kind).toBe('deduction');
    expect(fine.rest).toBe('за розбитий келих');
  });

  it('is nothing for a word that is not a number', () => {
    expect(asNumber('много')).toBeNull();
    expect(asNumber('18:00')).toBeNull();
  });
});
