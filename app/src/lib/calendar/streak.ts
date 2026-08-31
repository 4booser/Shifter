import { fromKey, todayKey } from './calendar-date';

/**
 * The run of days worked without a day off: the one happening now, and the
 * best one in the period behind it.
 *
 * A day off does not end the run for this purpose — it is counted from
 * yesterday when today is free, because otherwise the tile reads «0» on
 * exactly the day somebody is most likely to be looking at it. Matches what
 * the other clients show.
 */
export function streakOf(workedDates: string[]): { run: number; record: number } {
  const keys = new Set(workedDates);
  const today = todayKey();
  const workedOn = (key: string) => keys.has(key);

  let run = 0;
  let cursor = workedOn(today) ? today : shiftDay(today, -1);

  while (workedOn(cursor)) {
    run += 1;
    cursor = shiftDay(cursor, -1);
  }

  let record = 0;
  let current = 0;

  for (const key of [...keys].sort()) {
    current = workedOn(shiftDay(key, -1)) ? current + 1 : 1;
    record = Math.max(record, current);
  }

  return { run, record };
}

export function shiftDay(key: string, by: number): string {
  const at = fromKey(key);

  at.setDate(at.getDate() + by);

  return `${at.getFullYear()}-${`${at.getMonth() + 1}`.padStart(2, '0')}-${`${at.getDate()}`.padStart(2, '0')}`;
}

