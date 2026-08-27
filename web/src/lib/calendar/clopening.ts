import { CalendarDayData } from './models';

export interface Clopening {
  /** The evening shift's date. */
  date: string;
  /** Hours between clocking out and clocking back in. */
  gap: number;
}

/**
 * "Clopening": closing at two and opening at eight. The industry's own word
 * for its most quietly damaging habit, and the one thing a schedule can spot
 * that a person living it often cannot — by the third one in a fortnight it
 * stops feeling unusual.
 *
 * Pure and independent of the insight engine so it can be tested against
 * real overnight arithmetic: the gap is measured from the end of one shift
 * to the start of the next, both taken as actually worked when recorded.
 */
export function clopenings(
  days: readonly CalendarDayData[],
  /** A gap at or below this many hours counts. Eleven is the EU rest rule. */
  threshold = 11,
): Clopening[] {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const found: Clopening[] = [];

  const worked = [...days]
    .filter((day) => day.shifts.some((entry) => entry.worked))
    .sort((a, b) => a.date.localeCompare(b.date));

  for (let index = 0; index < worked.length - 1; index++) {
    const day = worked[index];
    const next = worked[index + 1];

    // Only consecutive calendar days can clopen; a day off in between is rest.
    const apart = (Date.parse(`${next.date}T00:00:00Z`) - Date.parse(`${day.date}T00:00:00Z`)) / 86_400_000;

    if (apart !== 1) continue;

    const evening = day.shifts.filter((entry) => entry.worked).at(-1);
    const morning = next.shifts.filter((entry) => entry.worked)[0];

    if (evening === undefined || morning === undefined) continue;

    const start = minutes(evening.actual_start ?? evening.start_time);
    let end = minutes(evening.actual_end ?? evening.end_time);

    // An overnight shift ends on the following day, which is precisely the
    // case this looks for; without the wrap the gap comes out negative.
    if (end <= start) end += 24 * 60;

    const back = minutes(morning.actual_start ?? morning.start_time) + 24 * 60;
    const gap = (back - end) / 60;

    if (gap >= 0 && gap <= threshold) {
      found.push({ date: day.date, gap: Math.round(gap * 10) / 10 });
    }
  }

  return found;
}
