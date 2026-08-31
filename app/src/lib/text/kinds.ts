/**
 * What work costs, in words.
 *
 * The same six kinds are used by the expense list and by the bank's reading
 * of a statement, so they are named once — a chart that says «transport» in
 * the middle of a Russian sentence is a chart nobody finished.
 */
export const KIND_NAMES: Record<string, string> = {
  transport: 'дорога',
  uniform: 'форма',
  tools: 'инструмент',
  food: 'еда',
  training: 'учёба',
  other: 'другое',
};

export const kindName = (kind: string) => KIND_NAMES[kind] ?? kind;
