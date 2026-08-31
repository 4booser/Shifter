/**
 * Dates people can read.
 *
 * The period is the thing being paid for, so it is said as a span with the
 * month named once — «16–30 июня», not the pair of stamps the API sends.
 */
export function dayOf(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString('ru', {
    day: 'numeric',
    month: 'short',
  });
}

export function spanOf(from: string, to: string): string {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);

  // Asked for on its own, Russian gives the month in the nominative — «июнь»,
  // which reads wrong after a date. Asking for the day as well gets the
  // genitive the sentence needs, and the day is then dropped.
  const month = (date: Date) =>
    date.toLocaleDateString('ru', { day: 'numeric', month: 'long' }).replace(/^\d+\s*/, '');

  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${month(end)}`
    : `${start.getDate()} ${month(start)} — ${end.getDate()} ${month(end)}`;
}
