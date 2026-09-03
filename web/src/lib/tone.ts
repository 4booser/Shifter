/**
 * The colour a sum of money is allowed to wear.
 *
 * «Заработано» was painted `text-good-read` at six places on the assumption
 * that earning is good news. A month that finishes below nought — withheld
 * more than it paid — then printed «−156 ₴» in green, directly above a red
 * «↓ 104%» derived from the same figure. Green is a claim about the number,
 * not about the label above it.
 */
export const earnedTone = (value: number): string =>
  value > 0 ? 'text-good-read' : value < 0 ? 'text-danger-read' : '';
