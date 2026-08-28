import { describe, expect, it } from 'vitest';

import { spokenDay } from '@/lib/calendar/spoken';

const day = (over: Partial<Parameters<typeof spokenDay>[0]> = {}) =>
  spokenDay({
    date: '14 марта',
    entries: [],
    hours: null,
    earned: null,
    holiday: null,
    selected: false,
    ...over,
  });

describe('a calendar day as one sentence', () => {
  it('leads with the date, always', () => {
    // Somebody arrowing across a month needs to know where they are before
    // they know what is there.
    expect(day()[0]).toBe('14 марта');
  });

  it('says the whole day in the order a sighted reader takes it', () => {
    expect(day({ entries: ['Вечер', 'Английский'], hours: '8 ч', earned: '1 200 ₴' })).toEqual([
      '14 марта',
      'Вечер, Английский',
      '8 ч',
      '1 200 ₴',
    ]);
  });

  it('is the date alone on an empty day', () => {
    // The gaps are where somebody is looking to put a shift, so they have to
    // be audible — but they are audible as a bare date, not as a list of
    // nothings.
    expect(day()).toEqual(['14 марта']);
  });

  it('names a holiday before what is on the day', () => {
    expect(day({ holiday: 'Різдво', entries: ['Вечер'] })).toEqual([
      '14 марта',
      'Різдво',
      'Вечер',
    ]);
  });

  it('takes the hours already spelt, unit and all', () => {
    // "8" and the word for hours go in different orders in different
    // languages, and a sentence assembled here would eventually invert them.
    expect(day({ hours: '7,7 ч' })).toContain('7,7 ч');
  });

  it('says nothing about money it was given nothing for', () => {
    // Null and not "0": amounts can be hidden by a setting, and a spoken zero
    // would leak that the day was empty to somebody who asked for silence.
    expect(day({ hours: '8 ч' })).toEqual(['14 марта', '8 ч']);
  });
});
