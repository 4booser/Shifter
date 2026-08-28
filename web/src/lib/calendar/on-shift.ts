import { RotaEntry } from '@/lib/api/team';

/**
 * Who is on right now, who is coming, who has gone home.
 *
 * The simplest question a crew asks and the one currently answered by a group
 * chat: somebody types "кто сегодня?" and three people answer, two of them
 * wrong. The rota already knows — it is only that nobody has ever read it at
 * the one moment it matters, which is now.
 *
 * Pure, and given the clock rather than reading it, so a night at 01:00 can be
 * tested rather than waited for.
 */

export interface OnShiftNow {
  /** On the floor at this moment. */
  on: OnShiftEntry[];
  /** Coming in later today, soonest first. */
  soon: OnShiftEntry[];
  /** Finished today. */
  gone: OnShiftEntry[];
}

export interface OnShiftEntry {
  entry: RotaEntry;
  /** Minutes since they started, or until they do. */
  minutes: number;
}

const minutesOf = (time: string): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * The shift as an interval on one continuous clock, in minutes from midnight
 * of its own date. A close that ends at 02:00 ends at 1560, not at 120 —
 * otherwise every night shift looks like it finished before it began.
 */
const spanOf = (entry: RotaEntry): { start: number; end: number } => {
  const start = minutesOf(entry.start_time);
  let end = minutesOf(entry.end_time);

  if (end <= start) end += 24 * 60;

  return { start, end };
};

export function onShiftNow(
  /** Today's and yesterday's entries: a close that began yesterday is still on. */
  entries: RotaEntry[],
  today: string,
  /** Minutes since midnight, on the crew's own clock. */
  now: number,
): OnShiftNow {
  const on: OnShiftEntry[] = [];
  const soon: OnShiftEntry[] = [];
  const gone: OnShiftEntry[] = [];

  for (const entry of entries) {
    const span = spanOf(entry);

    // Yesterday's shifts count only while they are still running into today,
    // which is exactly the case a group chat gets wrong at two in the morning.
    const yesterday = entry.date < today;
    const start = yesterday ? span.start - 24 * 60 : span.start;
    const end = yesterday ? span.end - 24 * 60 : span.end;

    if (end <= 0) continue;
    if (yesterday && start > 0) continue;

    if (now >= start && now < end) on.push({ entry, minutes: now - start });
    else if (now < start) soon.push({ entry, minutes: start - now });
    else gone.push({ entry, minutes: now - end });
  }

  return {
    on: on.sort((one, two) => two.minutes - one.minutes),
    soon: soon.sort((one, two) => one.minutes - two.minutes),
    gone: gone.sort((one, two) => one.minutes - two.minutes),
  };
}

/** "через 40 мин", "2 ч 10 мин назад" — the shape a person says out loud. */
export const spell = (minutes: number): { hours: number; minutes: number } => ({
  hours: Math.floor(Math.abs(minutes) / 60),
  minutes: Math.abs(minutes) % 60,
});
