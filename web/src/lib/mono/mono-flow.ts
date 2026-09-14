/* Carried over from the phone, verbatim where possible. */
/** The three names this file invents. */
export interface FlowWords {
  rest: string;
  fromBalance: string;
  leftOver: string;
}

export const FLOW_WORDS: FlowWords = {
  rest: 'остальное',
  fromBalance: 'из остатка',
  leftOver: 'осталось',
};

/** The arithmetic behind the flow picture, kept away from the drawing. */

export interface FlowBand {
  name: string;
  total: number;
}

/** The largest few, with everything else gathered rather than dropped. */
export const top = (bands: FlowBand[], keep: number, words: FlowWords = FLOW_WORDS): FlowBand[] => {
  const sorted = [...bands]
    .filter((band) => band.total > 0)
    .sort((one, two) => two.total - one.total);

  if (sorted.length <= keep) return sorted;

  const rest = sorted.slice(keep).reduce((sum, band) => sum + band.total, 0);

  return [...sorted.slice(0, keep), { name: words.rest, total: rest }];
};

/** The two columns, made to add to the same number. */
export function balance(
  sources: FlowBand[],
  categories: FlowBand[],
  earned: number,
  spent: number,
  keep = 5,
  words: FlowWords = FLOW_WORDS,
): { left: FlowBand[]; right: FlowBand[]; total: number } {
  const shortfall = Math.max(0, spent - earned);
  const kept = Math.max(0, earned - spent);

  const left = top(sources, keep, words);
  const right = top(categories, keep, words);

  if (shortfall > 0) left.push({ name: words.fromBalance, total: shortfall });
  if (kept > 0) right.push({ name: words.leftOver, total: kept });

  const sum = (bands: FlowBand[]) => bands.reduce((total, band) => total + band.total, 0);

  return { left, right, total: Math.max(sum(left), sum(right)) };
}

/** The names the balancing invents, which are drawn in the status colours. */
export const spareNames = (words: FlowWords = FLOW_WORDS): Set<string> => new Set([words.fromBalance, words.leftOver]);
