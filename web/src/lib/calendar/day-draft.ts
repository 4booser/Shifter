/** The bookkeeping behind a day being edited, apart from the panel so it can be held to its word. */

import { DaySave } from './models';

/** What the panel should count as already sent once the server has answered: a draft nobody touched since the send takes the answer in, and one that moved on keeps the old baseline so it stays dirty and goes out. So does one the server overruled. */
export function baselineAfterAnswer(
  sent: string | null,
  before: string,
  now: string,
  overruled = false,
): string {
  return sent === null || (before === sent && !overruled) ? now : sent;
}

/** What a close changes on a shift. */
interface ClosedEdges {
  shift_id: number;
  actual_start: string | null;
  actual_end: string | null;
  auto_closed: boolean;
}

/** Whether a close only now heard of kept the stored times over ones typed here. The save went out without the echo, so the server took it for a screen that had not seen the close, which is what it was; the times are still what the person meant, and now they can go out with the echo. */
export function closeOverruled(
  before: ClosedEdges[] | undefined,
  after: ClosedEdges[],
  starts: Record<number, string | null>,
  ends: Record<number, string | null>,
): boolean {
  return after.some(({ shift_id: id, auto_closed, actual_start, actual_end }) => {
    if (!auto_closed || before?.find((entry) => entry.shift_id === id)?.auto_closed === true) return false;

    return (id in starts && starts[id] !== actual_start) || (id in ends && ends[id] !== actual_end);
  });
}

/** The cash part of the tips, held inside the total: the server refuses more, and a total retyped lower is an answer about the total, not a mistake to send back. */
export function cashWithin(tips: number | null, cash: number | null): number | null {
  return cash === null ? null : Math.min(cash, tips ?? 0);
}

/** Drops the edits the server has said back, and those on something no longer there, so whatever it says next shows through. */
export function withoutEchoes<T>(
  edits: Record<number, T>,
  serverOf: (id: number) => T | undefined,
): Record<number, T> {
  const kept = Object.entries(edits).filter(([id, value]) => {
    const server = serverOf(Number(id));

    return server !== undefined && server !== value;
  });

  return kept.length === Object.keys(edits).length
    ? edits
    : (Object.fromEntries(kept) as Record<number, T>);
}

export type SaveState = 'saving' | 'saved' | 'queued' | 'failed';

/** What the panel tells the person. A change still inside the debounce is already as good as saving: naming that half-second as a state of its own only made the line flicker. */
export function saveStateOf(
  status: 'saving' | 'queued' | 'failed' | undefined,
  dirty: boolean,
): SaveState {
  if (dirty || status === 'saving') return 'saving';

  return status ?? 'saved';
}

/** What a field says, however it was written down: left out says what null says, no fine is a fine of nothing, and the server hands sales back in no order. */
function said(key: string, value: unknown): unknown {
  if (key === 'deductions') return value || null;
  if (key === 'auto_closed') return value === true;

  if (key === 'sales') {
    return (value as DaySave['sales'])
      .filter((sale) => sale.quantity > 0)
      .sort((one, two) => one.sales_id - two.sales_id);
  }

  return value ?? null;
}

const same = (key: string, one: unknown, two: unknown): boolean =>
  JSON.stringify(said(key, one)) === JSON.stringify(said(key, two));

/** `now` with what changed from `base` to `held` laid over it, and whether the two sides changed one thing to different ends. Such a field goes `held`'s way, unless `yielding`. */
function overlay<T extends object>(
  held: T,
  base: Partial<T>,
  now: T,
  yielding: boolean,
): { merged: T; contested: boolean; moved: boolean } {
  const merged = { ...now };
  let contested = false;
  let moved = false;

  for (const key of Object.keys(held) as (keyof T & string)[]) {
    if (same(key, held[key], base[key])) continue;

    const clash = !same(key, now[key], base[key]) && !same(key, now[key], held[key]);

    contested ||= clash;

    if (clash && yielding) continue;

    moved ||= !same(key, held[key], now[key]);
    merged[key] = held[key];
  }

  return { merged, contested, moved };
}

export interface Replayed {
  /** The day as it stands now, with the edits on it. Without a version: that is for the caller to say. */
  day: DaySave;
  /** Both sides changed one thing to different ends. Whose is right is the person's to say. */
  contested: boolean;
  /** Whether `day` says anything `now` does not. */
  moved: boolean;
}

/**
 * Edits made on `base` and held back, replayed over the day as it stands `now`:
 * only what they changed goes on, so a close or another device's note survives
 * the write that waited, and a shift taken off meanwhile stays off. Where both
 * sides changed one thing the edit stands, unless `yielding` gives it up: the
 * person has said to keep the other side, and only that is what they gave up.
 */
export function replayEdits(held: DaySave, base: DaySave, now: DaySave, yielding = false): Replayed {
  const bare = ({ shifts: _shifts, version: _version, ...rest }: DaySave) => rest;
  const rowIn = (rows: DaySave['shifts'], id: number) => rows.find((row) => row.shift_id === id);
  const rest = overlay(bare(held), bare(base), bare(now), yielding);
  let { contested, moved } = rest;

  const shifts = now.shifts.flatMap((entry) => {
    const mine = rowIn(held.shifts, entry.shift_id);
    const was = rowIn(base.shifts, entry.shift_id);

    // Never touched by it.
    if (mine === undefined && was === undefined) return [entry];

    // Taken off while it waited.
    if (mine === undefined) {
      moved = true;

      return [];
    }

    const row = overlay(mine, was ?? {}, entry, yielding);

    contested ||= row.contested;
    moved ||= row.moved;

    return [row.merged];
  });

  // Put on while it waited.
  const placed = held.shifts.filter(
    (row) => rowIn(base.shifts, row.shift_id) === undefined && rowIn(now.shifts, row.shift_id) === undefined,
  );

  shifts.push(...placed);

  return {
    // The total may have dropped under a cash part this edit never saw.
    day: { ...rest.merged, shifts, tips_cash: cashWithin(rest.merged.tips ?? null, rest.merged.tips_cash ?? null) },
    contested,
    moved: moved || placed.length > 0,
  };
}
