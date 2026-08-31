/**
 * Russian counts in three forms, and the teens are the exception that catches
 * every naive implementation: 11–14 take the plural however they end.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const last = count % 10;
  const teen = count % 100 >= 11 && count % 100 <= 14;

  if (teen || last === 0 || last >= 5) return many;
  if (last === 1) return one;

  return few;
}

export const daysWord = (count: number) => plural(count, 'день', 'дня', 'дней');
