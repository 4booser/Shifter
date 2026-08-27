import type { Language } from '../settings/settings';

/**
 * The words that ever follow a number. Slavic languages bend them three ways
 * ("1 смена, 2 смены, 5 смен") and the app was pretending they don't.
 * English keeps [one, other]; ru/uk keep [one, few, many].
 */
const FORMS: Record<string, Record<Language, string[]>> = {
  days: { en: ['day', 'days'], ru: ['день', 'дня', 'дней'], uk: ['день', 'дні', 'днів'] },
  shifts: { en: ['shift', 'shifts'], ru: ['смена', 'смены', 'смен'], uk: ['зміна', 'зміни', 'змін'] },
  assignments: { en: ['assignment', 'assignments'], ru: ['смена', 'смены', 'смен'], uk: ['зміна', 'зміни', 'змін'] },
  people: { en: ['person', 'people'], ru: ['человек', 'человека', 'человек'], uk: ['людина', 'людини', 'людей'] },
  hours: { en: ['hour', 'hours'], ru: ['час', 'часа', 'часов'], uk: ['година', 'години', 'годин'] },
  weeks: { en: ['week', 'weeks'], ru: ['неделя', 'недели', 'недель'], uk: ['тиждень', 'тижні', 'тижнів'] },
  months: { en: ['month', 'months'], ru: ['месяц', 'месяца', 'месяцев'], uk: ['місяць', 'місяці', 'місяців'] },
  minutes: { en: ['minute', 'minutes'], ru: ['минуту', 'минуты', 'минут'], uk: ['хвилину', 'хвилини', 'хвилин'] },
};

export function pluralWord(lang: Language, key: string, count: number): string {
  const forms = FORMS[key]?.[lang];

  if (forms === undefined) return key;

  if (lang === 'en') return forms[Math.abs(count) === 1 ? 0 : 1];

  const rule = new Intl.PluralRules(lang).select(count);

  // Fractions land on 'other', which Russian reads with the few-form:
  // «1,5 часа», never «1,5 часов».
  return forms[rule === 'one' ? 0 : rule === 'many' ? 2 : 1];
}

/** "5 смен" in one move — the number and its correctly bent word. */
export function nWord(lang: Language, count: number, key: string): string {
  return `${count} ${pluralWord(lang, key, count)}`;
}
