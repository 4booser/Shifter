/** A calendar day as one sentence. */

export interface SpokenDay {
  /** "14 марта" — already in the reader's language. */
  date: string;
  /** Shift and event names, in the order they are drawn. */
  entries: string[];
  /** Already spelt with its unit — "8 ч" — because "8" and the word for hours go in different orders in different… */
  hours: string | null;
  /** Formatted, or null where there is nothing to say. */
  earned: string | null;
  holiday: string | null;
  selected: boolean;
}

/** The pieces, joined by the caller with its own translations. */
export function spokenDay(day: SpokenDay): string[] {
  const parts: string[] = [day.date];

  if (day.holiday !== null) parts.push(day.holiday);

  // An empty day says so.
  if (day.entries.length > 0) parts.push(day.entries.join(', '));

  if (day.hours !== null) parts.push(day.hours);

  if (day.earned !== null) parts.push(day.earned);

  return parts;
}
