/** The colour a sum of money is allowed to wear. */
export const earnedTone = (value: number): string =>
  value > 0 ? 'text-good-read' : value < 0 ? 'text-danger-read' : '';
