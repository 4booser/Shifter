/**
 * Dates people can read.
 *
 * The period is the thing being paid for, so it is said as a span with the
 * month named once — «16–30 июня», not the pair of stamps the API sends.
 *
 * Neither of these is a component, so neither can read the setting itself:
 * the language comes in as an argument, and a caller that forgets it does
 * not compile.
 */
export function dayOf(key: string, lang: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString(lang, {
    day: 'numeric',
    month: 'short',
  });
}

export function spanOf(from: string, to: string, lang: string): string {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);

  // Asked for on its own, Russian gives the month in the nominative — «июнь»,
  // which reads wrong after a date. Asking for the day as well gets the
  // genitive the sentence needs, and the month is then read back out of the
  // formatted parts. Cutting the digits off the front instead only worked
  // while the language was fixed: English puts the day last, so «1–15 June»
  // came out «1–15 June 15».
  const month = (date: Date) =>
    new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' })
      .formatToParts(date)
      .find((part) => part.type === 'month')?.value ?? '';

  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${month(end)}`
    : `${start.getDate()} ${month(start)} — ${end.getDate()} ${month(end)}`;
}
