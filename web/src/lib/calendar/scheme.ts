import { ColourScheme } from '../settings/settings';

/**
 * What a scheme puts on a given date, or undefined when it says nothing about
 * it — which is different from saying "no colour". A weekday with nothing
 * assigned is left exactly as it was; only an explicit null clears.
 */
export function schemeColourFor(scheme: ColourScheme, date: string): string | null | undefined {
  if (scheme.kind === 'weekday') {
    const weekday = new Date(`${date}T00:00:00`).getDay();

    return scheme.byWeekday[weekday];
  }

  const length = scheme.cycle.length;

  if (length === 0) return undefined;

  // Counted in whole days from the start rather than in weeks, so a rotation
  // that is not a multiple of seven does not drift as months change length.
  const start = Date.parse(`${scheme.cycleFrom}T00:00:00Z`);
  const here = Date.parse(`${date}T00:00:00Z`);
  const offset = Math.round((here - start) / 86_400_000);

  // Modulo that stays positive before the start date, so a cycle laid over
  // earlier days repeats backwards rather than falling off the front.
  return scheme.cycle[((offset % length) + length) % length];
}
