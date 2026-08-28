import { t } from '@/lib/i18n';

/**
 * The arithmetic behind the flow picture, kept away from the drawing.
 *
 * This is the claim the picture makes — money in equals money out plus what
 * stayed — and a claim should be checkable without a renderer.
 */

export interface FlowBand {
  name: string;
  total: number;
}

/**
 * The largest few, with everything else gathered rather than dropped.
 *
 * Dropping the tail would make the two sides stop adding up, which is the one
 * thing this picture must never do.
 */
export const top = (bands: FlowBand[], keep: number): FlowBand[] => {
  const sorted = [...bands]
    .filter((band) => band.total > 0)
    .sort((one, two) => two.total - one.total);

  if (sorted.length <= keep) return sorted;

  const rest = sorted.slice(keep).reduce((sum, band) => sum + band.total, 0);

  return [...sorted.slice(0, keep), { name: t('остальное'), total: rest }];
};

/**
 * The two columns, made to add to the same number.
 *
 * Spend more than came in and the shortfall appears on the left as money taken
 * out of the balance, named — rather than the picture quietly failing to add
 * up and leaving the reader to work out why.
 */
export function balance(
  sources: FlowBand[],
  categories: FlowBand[],
  earned: number,
  spent: number,
  keep = 5,
): { left: FlowBand[]; right: FlowBand[]; total: number } {
  const shortfall = Math.max(0, spent - earned);
  const kept = Math.max(0, earned - spent);

  const left = top(sources, keep);
  const right = top(categories, keep);

  if (shortfall > 0) left.push({ name: t('из остатка'), total: shortfall });
  if (kept > 0) right.push({ name: t('осталось'), total: kept });

  const sum = (bands: FlowBand[]) => bands.reduce((total, band) => total + band.total, 0);

  return { left, right, total: Math.max(sum(left), sum(right)) };
}

/** The names the balancing invents, which are drawn in the status colours. */
export const spareNames = (): Set<string> => new Set([t('из остатка'), t('осталось')]);
