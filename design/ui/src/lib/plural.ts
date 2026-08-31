/**
 * Русское число словом.
 *
 * «42 смен» выдаёт макет, который писали не по-русски, и это первое, за что
 * цепляется глаз. Правило простое: 11–14 всегда во множественном, дальше
 * решает последняя цифра.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const tail = Math.abs(count) % 100;

  if (tail >= 11 && tail <= 14) return many;

  const last = tail % 10;

  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;

  return many;
}

export const shifts = (n: number) => plural(n, 'смена', 'смены', 'смен');
export const days = (n: number) => plural(n, 'день', 'дня', 'дней');
export const hours = (n: number) => plural(n, 'час', 'часа', 'часов');
export const places = (n: number) => plural(n, 'место', 'места', 'мест');
