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
