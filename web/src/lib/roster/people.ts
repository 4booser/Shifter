import type { RosterPerson, RosterPersonSave } from '@/lib/api/roster';

/** The colours a roster is drawn in. Lower case, which is how the server holds them. */
export const ROSTER_COLOURS = [
  '#6366f1',
  '#d97706',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#a855f7',
  '#059669',
  '#dc2626',
  '#2563eb',
  '#78716c',
] as const;

/** The next person's colour: one nobody wears yet, then round again. */
export function nextColour(people: RosterPerson[]): string {
  const worn = new Set(people.map((person) => person.colour));

  return ROSTER_COLOURS.find((colour) => !worn.has(colour)) ?? ROSTER_COLOURS[people.length % ROSTER_COLOURS.length];
}

/** The names behind these ids, for a sentence. Whoever the page never knew is left out rather than shown as a number. */
export function namesOf(ids: number[], people: RosterPerson[]): string {
  const known = new Map(people.map((person) => [person.id, person.name]));

  return ids.flatMap((id) => known.get(id) ?? []).join(', ');
}

/** A form's values the way the server will keep them, so the screen is not corrected by the answer. */
export function cleanPerson(name: string, position: string, colour: string): RosterPersonSave {
  return { name: name.trim(), position: position.trim() || null, colour };
}
