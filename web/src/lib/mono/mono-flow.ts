/*
 * Carried over from the phone, verbatim where possible.
 *
 * The bank tab lived only in the pocket, and every formula here — what counts
 * as a transfer, how branches of one shop merge, what a day usually costs —
 * was already written and tested there. Parity between the platforms is
 * parity of files: if the web and the phone ever disagree about a figure,
 * that is a bug by definition, and keeping the code identical is the
 * cheapest way to make it a rare one.
 */
/**
 * The three names this file invents. Injectable because the page owns the
 * translations; defaulted to the phone's words so the shared tests hold on
 * both platforms.
 */
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
export const top = (bands: FlowBand[], keep: number, words: FlowWords = FLOW_WORDS): FlowBand[] => {
  const sorted = [...bands]
    .filter((band) => band.total > 0)
    .sort((one, two) => two.total - one.total);

  if (sorted.length <= keep) return sorted;

  const rest = sorted.slice(keep).reduce((sum, band) => sum + band.total, 0);

  return [...sorted.slice(0, keep), { name: words.rest, total: rest }];
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
