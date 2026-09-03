/**
 * What work costs, in words.
 *
 * The same six kinds are used by the expense list and by the bank's reading
 * of a statement, so they are named once — as dictionary keys the reader's
 * own language fills in. Wrap a lookup in t() at the render site.
 */
export const KIND_NAMES: Record<string, string> = {
  transport: 'travel',
  uniform: 'uniform',
  tools: 'tools',
  food: 'food',
  training: 'training',
  other: 'other',
};

export const kindName = (kind: string) => KIND_NAMES[kind] ?? kind;
