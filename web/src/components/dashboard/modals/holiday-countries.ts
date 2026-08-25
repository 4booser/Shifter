import { HOLIDAY_COUNTRIES } from '@/lib/calendar/holidays';

/** Re-exported under the shape the settings sheet reads; the blank "None"
 * entry is drawn by the sheet itself. */
export const holidaysCountries = HOLIDAY_COUNTRIES.filter((country) => country.code !== '').map(
  (country) => ({ code: country.code, name: country.label }),
);
