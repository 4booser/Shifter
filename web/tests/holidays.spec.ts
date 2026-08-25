import { holidaysForYear, holidaysInRange } from '@/lib/calendar/holidays';

/**
 * Dates checked against the published calendars rather than against the code
 * that produces them. The moving feasts are the point: a table of fixed dates
 * needs no test, and an Easter calculation that drifts by a day is exactly the
 * kind of error nobody notices until somebody books leave on a working day.
 */
describe('holidays', () => {
  const on = (country: string, year: number, date: string): string | undefined =>
    holidaysForYear(country, year).get(date)?.name;

  describe('Easter and everything hanging off it', () => {
    it('places Western Easter in 2026 on 5 April', () => {
      expect(on('PL', 2026, '2026-04-05')).toBe('Easter Sunday');
      expect(on('PL', 2026, '2026-04-06')).toBe('Easter Monday');
    });

    it('places Good Friday two days before Easter', () => {
      expect(on('DE', 2026, '2026-04-03')).toBe('Good Friday');
    });

    it('places Orthodox Easter in 2026 on 12 April, a week after the Western one', () => {
      expect(on('UA', 2026, '2026-04-12')).toBe('Easter');
    });

    it('follows Easter as it moves between years', () => {
      // 2027 falls a fortnight and a day later than 2026.
      expect(on('PL', 2027, '2027-03-28')).toBe('Easter Sunday');
    });
  });

  describe('weekday rules', () => {
    it('finds the fourth Thursday in November for Thanksgiving', () => {
      expect(on('US', 2026, '2026-11-26')).toBe('Thanksgiving');
    });

    it('counts back from the end of the month for the last Monday', () => {
      expect(on('US', 2026, '2026-05-25')).toBe('Memorial Day');
      expect(on('GB', 2026, '2026-05-25')).toBe('Spring Bank Holiday');
    });

    it('finds the first Monday of a month', () => {
      expect(on('GB', 2026, '2026-05-04')).toBe('Early May Bank Holiday');
    });
  });

  describe('holidays landing on a weekend', () => {
    it('moves an American Saturday holiday back to the Friday', () => {
      // 4 July 2026 is a Saturday.
      expect(on('US', 2026, '2026-07-03')).toBe('Independence Day');
      expect(on('US', 2026, '2026-07-04')).toBeUndefined();
    });

    it('moves a British Saturday holiday forward to the Monday', () => {
      // 26 December 2026 is a Saturday: the substitute day is the 28th.
      expect(on('GB', 2026, '2026-12-28')).toBe('Boxing Day');
    });

    it('moves a Sunday holiday to the Monday in both', () => {
      // 1 January 2028 is a Saturday; 2023 was a Sunday.
      expect(on('US', 2023, '2023-01-02')).toBe('New Year');
      expect(on('GB', 2023, '2023-01-02')).toBe('New Year');
    });

    it('leaves a weekday holiday where it is', () => {
      expect(on('US', 2025, '2025-07-04')).toBe('Independence Day');
    });
  });

  describe('ranges', () => {
    it('returns nothing when no country is chosen', () => {
      expect(holidaysInRange('', '2026-01-01', '2026-12-31').size).toBe(0);
    });

    it('spans a new year rather than stopping at December', () => {
      const found = holidaysInRange('PL', '2026-12-20', '2027-01-10');

      expect(found.get('2026-12-25')?.name).toBe('Christmas Day');
      expect(found.get('2027-01-01')?.name).toBe('New Year');
      expect(found.get('2027-01-06')?.name).toBe('Epiphany');
    });

    it('excludes what falls outside the range', () => {
      const found = holidaysInRange('PL', '2026-05-01', '2026-05-31');

      expect(found.get('2026-05-01')?.name).toBe('Labour Day');
      expect(found.has('2026-01-01')).toBe(false);
    });
  });
});
