import type { DaySave } from './types';

/** The rules of the queue, with nothing native in them. */

/** One write that has not reached the server yet. */
export interface Pending {
  id: string;
  /** When it was queued, so a banner can say how old the backlog is. */
  at: number;
  method: 'PUT' | 'POST' | 'DELETE';
  path: string;
  body: unknown | null;
  /** The days it touches, so the calendar can mark them as not yet recorded. */
  days: string[];
  /** What to call it out loud: "Вечер · 5 дней". */
  label: string;
  /** For a day: what the server had when this was edited, which is how a day that moved since can take the edits anyway. */
  base?: unknown;
  /** Whose write it is, where only the newest of them matters: a newer one takes its place, and a save that lands takes it back. */
  slot?: string;
}

/** What happened to one attempt. */
export type SendResult = 'sent' | 'refused' | 'offline';

export interface Drained {
  sent: number;
  /** Dropped rather than retried: a 400 held is a 400 forever. */
  refused: number;
  /** Still waiting, in the order they were made. */
  left: Pending[];
}

/** What an attempt that threw says. A server that fell over may yet take it; one that said no will say it again. */
export const failureOf = (caught: unknown): SendResult => {
  const status = (caught as { status?: number } | null)?.status;

  return status !== undefined && status < 500 ? 'refused' : 'offline';
};

/** Empties the queue as far as the network allows. */
export async function drain(
  pending: Pending[],
  send: (entry: Pending) => Promise<SendResult>,
  /** Called after every change so a killed app resumes where it stopped. */
  keep?: (left: Pending[]) => Promise<void>,
): Promise<Drained> {
  let sent = 0;
  let refused = 0;
  let left = pending;

  while (left.length > 0) {
    const result = await send(left[0]);

    if (result === 'offline') break;

    if (result === 'sent') sent += 1;
    else refused += 1;

    left = left.slice(1);
    await keep?.(left);
  }

  return { sent, refused, left };
}

export const same = (one: unknown, two: unknown): boolean =>
  JSON.stringify(one) === JSON.stringify(two);

/** `now` with what changed from `base` to `held` laid over it. Where both changed one thing to different ends `now` keeps it, and `contest` hears. */
function overlay<T extends object>(held: T, base: T, now: T, contest: () => void): T {
  const merged = { ...now };

  for (const key of Object.keys({ ...base, ...held }) as (keyof T)[]) {
    if (same(held[key], base[key])) continue;

    if (same(now[key], base[key]) || same(now[key], held[key])) merged[key] = held[key];
    else contest();
  }

  return merged;
}

/** Counts by position: the server keeps its rows in no order, and a count of nothing is no row. */
const counts = (sales: DaySave['sales']): Record<number, number> =>
  Object.fromEntries(
    sales.filter((row) => row.quantity > 0).map((row) => [row.sales_id, row.quantity]),
  );

/** What a held day comes to over the day as it stands. */
export interface Rebased {
  /** What is left to write, or null where the write would change nothing. */
  day: DaySave | null;
  /** Both sides changed something to different ends, and the day as it stands kept it. */
  contested: boolean;
}

/**
 * A held day whose version has gone: only what the person changed goes over
 * the day as it stands now, so a clock's close or another device's note
 * survives the write that waited. Where both sides changed the same thing
 * differently the day as it stands keeps it, because guessing whose tips are
 * right is not the queue's to do, and `contested` says so. The rest of the
 * write has no quarrel with anybody and goes in regardless.
 */
export function rebaseDay(held: DaySave, base: DaySave, now: DaySave): Rebased {
  let contested = false;
  const contest = () => {
    contested = true;
  };

  // No fine is null from the boxes and 0 from the server, which is nobody's
  // edit. The cash half has no box, so this phone never said anything about
  // it: it only has to fit under the total, below.
  const bare = ({
    shifts: _shifts,
    sales: _sales,
    tips_cash: _cash,
    version: _version,
    ...rest
  }: DaySave) => ({ ...rest, deductions: rest.deductions || null });
  const rest = overlay(bare(held), bare(base), bare(now), contest);
  const sold = overlay(counts(held.sales), counts(base.sales), counts(now.sales), contest);

  const hasShift = (shifts: DaySave['shifts'], id: number) =>
    shifts.find((row) => row.shift_id === id);
  const shifts: DaySave['shifts'] = [];

  for (const entry of now.shifts) {
    const mine = hasShift(held.shifts, entry.shift_id);
    const was = hasShift(base.shifts, entry.shift_id);

    // Taken off while it waited.
    if (mine === undefined && was !== undefined) continue;

    shifts.push(mine === undefined || was === undefined ? entry : overlay(mine, was, entry, contest));
  }

  // Put on while it waited.
  shifts.push(
    ...held.shifts.filter(
      (row) =>
        hasShift(base.shifts, row.shift_id) === undefined
        && hasShift(now.shifts, row.shift_id) === undefined,
    ),
  );

  const moved =
    !same(rest, bare(now)) || !same(sold, counts(now.sales)) || !same(shifts, now.shifts);

  return {
    day: moved
      ? {
          ...rest,
          shifts,
          sales: Object.entries(sold)
            .filter(([, quantity]) => quantity > 0)
            .map(([id, quantity]) => ({ sales_id: Number(id), quantity })),
          // The total may have dropped under a cash half this write never saw.
          tips_cash: now.tips_cash == null ? null : Math.min(now.tips_cash, rest.tips ?? 0),
          version: now.version,
        }
      : null,
    contested,
  };
}

/** Every day currently waiting to be recorded. */
export const heldDays = (pending: Pending[]): Set<string> =>
  new Set(pending.flatMap((entry) => entry.days));

/** Gives each held write an id that will not collide with the next one. */
export const stamp = (
  entries: Omit<Pending, 'id' | 'at'>[],
  now = Date.now(),
): Pending[] =>
  entries.map((entry, index) => ({
    ...entry,
    id: `${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    at: now,
  }));
