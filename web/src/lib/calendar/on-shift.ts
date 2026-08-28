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

export interface TightTurnaround {
  memberId: number;
  /** The shift that ends, and the one that starts too soon after it. */
  before: RotaEntry;
  after: RotaEntry;
  /** Hours between clocking out and clocking back in. */
  gap: number;
}

/**
 * Two shifts on one person with too little between them.
 *
 * The daily rest rule exists, a rota can break it by accident, and the person
 * building the rota is looking at a grid rather than at a clock. Worth saying
 * out loud while it is still a plan — which is the only time it can be moved
 * without a conversation.
 *
 * It says "looks like" and never "breaks". The app does not know somebody's
 * contract, their country's exemptions, or what they agreed to; it knows two
 * times and the distance between them, and that is what it reports.
 *
 * Nothing here touches pay. A rest rule is about hours, and reaching from it
 * into somebody's wage would be inventing an entitlement.
 */
export function tightTurnarounds(
  entries: RotaEntry[],
  /** Hours below which it is worth mentioning. Eleven is the EU daily rule. */
  threshold = 11,
): TightTurnaround[] {
  const byMember = new Map<number, RotaEntry[]>();

  for (const entry of entries) {
    byMember.set(entry.member_id, [...(byMember.get(entry.member_id) ?? []), entry]);
  }

  const found: TightTurnaround[] = [];

  for (const [memberId, theirs] of byMember) {
    const ordered = [...theirs].sort(
      (one, two) => `${one.date}${one.start_time}`.localeCompare(`${two.date}${two.start_time}`),
    );

    for (let index = 1; index < ordered.length; index += 1) {
      const before = ordered[index - 1];
      const after = ordered[index];

      const minutes = (time: string) =>
        Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

      const dayStart = Date.parse(`${before.date}T00:00:00Z`) / 60_000;
      const nextStart = Date.parse(`${after.date}T00:00:00Z`) / 60_000;

      let end = dayStart + minutes(before.end_time);

      // A close ending at 02:00 ends the next morning; without the wrap the
      // gap comes out a day too long and the warning never fires.
      if (minutes(before.end_time) <= minutes(before.start_time)) end += 24 * 60;

      const gap = (nextStart + minutes(after.start_time) - end) / 60;

      if (gap >= 0 && gap < threshold) {
        found.push({ memberId, before, after, gap: Math.round(gap * 10) / 10 });
      }
    }
  }

  return found.sort((one, two) => one.gap - two.gap);
}
