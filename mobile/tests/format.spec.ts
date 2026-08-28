import { describe, expect, it } from 'vitest';

import { spaced, stopwatch, two } from '@/lib/format';
import { numberOf, payLine } from '@/lib/places';

/**
 * String arithmetic that runs on the animation thread, where Intl does not
 * exist and a wrong answer is four digits of somebody's wage.
 */
describe('grouping money', () => {
  it('leaves anything under a thousand alone', () => {
    expect(spaced(0)).toBe('0');
    expect(spaced(7)).toBe('7');
    expect(spaced(999)).toBe('999');
  });

  it('groups by threes with a space, the way this app writes money', () => {
    expect(spaced(1000)).toBe('1 000');
    expect(spaced(12400)).toBe('12 400');
    expect(spaced(1234567)).toBe('1 234 567');
  });

  it('pads a short group rather than dropping its zeros', () => {
    // The bug this rules out: 1005 grouped naively is "1 5".
    expect(spaced(1005)).toBe('1 005');
    expect(spaced(1050)).toBe('1 050');
    expect(spaced(1000000)).toBe('1 000 000');
  });

  it('rounds rather than truncating, so a ticking wage does not sit low', () => {
    expect(spaced(1499.6)).toBe('1 500');
    expect(spaced(0.4)).toBe('0');
  });

  it('marks a negative with a minus sign, not a hyphen', () => {
    expect(spaced(-2400)).toBe('−2 400');
  });
});

describe('the stopwatch', () => {
  it('reads hh:mm:ss', () => {
    expect(stopwatch(0)).toBe('00:00:00');
    expect(stopwatch(59)).toBe('00:00:59');
    expect(stopwatch(3600)).toBe('01:00:00');
    expect(stopwatch(3661)).toBe('01:01:01');
  });

  it('keeps counting past a day rather than wrapping', () => {
    expect(stopwatch(90000)).toBe('25:00:00');
  });

  it('never shows a negative for a clock that has not started', () => {
    expect(stopwatch(-5)).toBe('00:00:00');
  });

  it('pads a single digit', () => {
    expect(two(0)).toBe('00');
    expect(two(9)).toBe('09');
    expect(two(10)).toBe('10');
  });
});

describe('reading a number somebody typed on a phone', () => {
  it('takes a comma as readily as a full stop', () => {
    expect(numberOf('1,5')).toBe(1.5);
    expect(numberOf('1.5')).toBe(1.5);
  });

  it('falls back rather than producing NaN, which reaches the server as null', () => {
    expect(numberOf('')).toBe(0);
    expect(numberOf('  ')).toBe(0);
    expect(numberOf('abc', 40)).toBe(40);
  });

  it('keeps a plain integer intact', () => {
    expect(numberOf('40')).toBe(40);
    expect(numberOf(' 22 ')).toBe(22);
  });
});

describe('how a pay cycle reads', () => {
  const place = {
    pay_period: 'monthly' as const,
    pay_day: 10,
  } as Parameters<typeof payLine>[0];

  it('names the day for a monthly cycle', () => {
    expect(payLine(place)).toBe('Раз в месяц, 10-го');
  });

  it('names both days for a twice-a-month cycle', () => {
    expect(payLine({ ...place, pay_period: 'semimonthly' })).toBe('Два раза: 10 и 25');
  });

  it('says nothing about a day where the cycle does not have one', () => {
    expect(payLine({ ...place, pay_period: 'weekly' })).toBe('Раз в неделю');
  });
});
