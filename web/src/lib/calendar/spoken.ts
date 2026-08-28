/**
 * A calendar day as one sentence.
 *
 * A screen reader on this grid used to read a cell as its visible fragments in
 * whatever order they were painted — a number, a symbol, another number — which
 * is a decoration of a day rather than a day. Somebody arrowing across a month
 * heard nothing they could act on.
 *
 * So the cell carries a label that says the whole thing: the date, what is on
 * it, how long, and what it came to. Everything a sighted reader takes from the
 * cell at a glance, in the order they would take it.
 *
 * Pure, given already-formatted money, because the currency and the hiding of
 * amounts are settled elsewhere and this must not disagree with the screen.
 */

export interface SpokenDay {
  /** "14 марта" — already in the reader's language. */
  date: string;
  /** Shift and event names, in the order they are drawn. */
  entries: string[];
  /**
   * Already spelt with its unit — "8 ч" — because "8" and the word for hours
   * go in different orders in different languages, and a sentence assembled
   * here would eventually put them the wrong way round.
   */
  hours: string | null;
  /** Formatted, or null where there is nothing to say. */
  earned: string | null;
  holiday: string | null;
  selected: boolean;
}

/**
 * The pieces, joined by the caller with its own translations.
 *
 * Returned as parts rather than a finished string so the word order belongs to
 * the language file: "8 hours" and "8 часов" agree, but a sentence assembled
 * here would eventually not.
 */
export function spokenDay(day: SpokenDay): string[] {
  const parts: string[] = [day.date];

  if (day.holiday !== null) parts.push(day.holiday);

  // An empty day says so. Silence would be read as a cell that failed to load,
  // and a person arrowing across a month needs to hear the gaps — those are
  // where they are looking to put a shift.
  if (day.entries.length > 0) parts.push(day.entries.join(', '));

  if (day.hours !== null) parts.push(day.hours);

  if (day.earned !== null) parts.push(day.earned);

  return parts;
}
