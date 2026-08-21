import { describe, expect, it } from 'vitest';

import { ColourScheme } from '../settings/settings-store';
import { schemeColourFor } from './calendar-store';

/**
 * A scheme answers one question per date: what colour, if any. The cycle is
 * where this can quietly go wrong — counted in weeks it drifts as months change
 * length, and a naive modulo falls off the front of the calendar the moment
 * somebody scrolls back past the start date.
 */
function weekday(byWeekday: Partial<Record<number, string>>): ColourScheme {
  return {
    id: 'a',
    name: 'Weekends',
    kind: 'weekday',
    byWeekday,
    cycle: [],
    cycleFrom: '2026-03-01',
  };
}

function cycle(colours: (string | null)[], from = '2026-03-01'): ColourScheme {
  return {
    id: 'b',
    name: '2/2',
    kind: 'cycle',
    byWeekday: {},
    cycle: colours,
    cycleFrom: from,
  };
}

describe('colour schemes', () => {
  describe('by weekday', () => {
    it('colours the weekday it was given', () => {
      // 2026-03-07 is a Saturday, 2026-03-09 a Monday.
      const scheme = weekday({ 6: '#22C55E' });

      expect(schemeColourFor(scheme, '2026-03-07')).toBe('#22C55E');
      expect(schemeColourFor(scheme, '2026-03-09')).toBeUndefined();
    });

    it('says nothing about a weekday with nothing assigned', () => {
      // Undefined and null are different answers: one leaves the day alone,
      // the other wipes whatever colour it had.
      expect(schemeColourFor(weekday({}), '2026-03-09')).toBeUndefined();
    });

    it('can clear a weekday deliberately', () => {
      expect(schemeColourFor(weekday({ 1: null as never }), '2026-03-09')).toBeNull();
    });
  });

  describe('on a cycle', () => {
    it('walks the cycle day by day from its start', () => {
      const scheme = cycle(['#A', '#A', '#B', '#B']);

      expect(schemeColourFor(scheme, '2026-03-01')).toBe('#A');
      expect(schemeColourFor(scheme, '2026-03-02')).toBe('#A');
      expect(schemeColourFor(scheme, '2026-03-03')).toBe('#B');
      expect(schemeColourFor(scheme, '2026-03-04')).toBe('#B');
    });

    it('repeats once it runs out', () => {
      const scheme = cycle(['#A', '#A', '#B', '#B']);

      expect(schemeColourFor(scheme, '2026-03-05')).toBe('#A');
      expect(schemeColourFor(scheme, '2026-03-09')).toBe('#A');
    });

    it('does not drift across a month boundary', () => {
      // Four-day cycle from 1 March: April has to continue the count, not
      // restart it. 2026-04-01 is 31 days on, and 31 % 4 is 3.
      const scheme = cycle(['#A', '#A', '#B', '#B']);

      expect(schemeColourFor(scheme, '2026-04-01')).toBe('#B');
    });

    it('runs backwards before the start date rather than falling off', () => {
      const scheme = cycle(['#A', '#A', '#B', '#B']);

      // The day before the start is the last day of the previous turn.
      expect(schemeColourFor(scheme, '2026-02-28')).toBe('#B');

      // A whole cycle back lands on the start of a turn again, not on its end.
      expect(schemeColourFor(scheme, '2026-02-25')).toBe('#A');
    });

    it('leaves the days off blank when the cycle says so', () => {
      const scheme = cycle(['#A', '#A', null, null]);

      expect(schemeColourFor(scheme, '2026-03-03')).toBeNull();
    });

    it('says nothing at all when the cycle is empty', () => {
      expect(schemeColourFor(cycle([]), '2026-03-01')).toBeUndefined();
    });

    it('handles a cycle that is not a multiple of a week', () => {
      // 5/2 is seven, but 4/2 is six and is where week-based maths breaks.
      const scheme = cycle(['#A', '#A', '#A', '#A', null, null]);

      expect(schemeColourFor(scheme, '2026-03-07')).toBe('#A');
      expect(schemeColourFor(scheme, '2026-03-11')).toBe(null);
    });
  });
});
