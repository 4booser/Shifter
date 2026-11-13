/** Saving without a button: edits gather during a quiet spell, one request goes at a time, the newest batch waits behind it. */

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

/** The pause after the last change, the same the day panel waits. */
export const QUIET_BEFORE_SAVE = 500;

/** The most the server takes in one save. */
export const BATCH_LIMIT = 500;

export interface SaveQueueOptions<T> {
  send: (batch: T[]) => Promise<void>;
  /** An answer no retry can change. Such a batch is let go, or it would stop everything behind it for good. */
  refused?: (error: unknown) => boolean;
  onRefused?: (error: unknown) => void;
  /**
   * A second look at a refused batch, for a refusal that only part of it earned.
   * Nothing leaves meanwhile, and what comes back decides which of everything
   * pending stays. Null lets the whole batch go, by way of onRefused.
   */
  salvage?: (error: unknown, batch: Map<string, T>) => Promise<(key: string, edit: T) => boolean> | null;
  onChange?: (state: SaveState, error: unknown) => void;
  /**
   * Keys whose newer word goes to the back of the line, behind whatever was put
   * since the earlier one. Any other key's newer word takes the earlier one's
   * place. The line is the order the server hears things in, which matters
   * when one save changes what another means.
   */
  toBack?: (key: string) => boolean;
  quiet?: number;
  limit?: number;
}

export interface SaveQueue<T> {
  /** Takes an edit, over any earlier one with the same key, and starts the quiet again. */
  put: (key: string, edit: T) => void;
  /** Takes back what has not gone out. What is already on the wire is past recalling. */
  drop: (matches: (key: string) => boolean) => void;
  /** Sends now rather than after the quiet. This is also the retry. */
  flush: () => void;
  /** Flushes, then waits until nothing is on the wire. A failed batch is still pending when this resolves. */
  settled: () => Promise<void>;
  /** Everything not yet known to have landed, the newest word on each key, in the order it is to be sent. */
  pending: () => T[];
  state: () => SaveState;
  /** Moves on every put, so a read can tell it was overtaken. */
  revision: () => number;
}

/** What several queues add up to: the worst news among them. */
export function overallState(states: SaveState[]): SaveState {
  return (['failed', 'saving', 'saved'] as const).find((state) => states.includes(state)) ?? 'idle';
}

export function createSaveQueue<T>(options: SaveQueueOptions<T>): SaveQueue<T> {
  const quiet = options.quiet ?? QUIET_BEFORE_SAVE;
  const limit = options.limit ?? BATCH_LIMIT;
  const toBack = options.toBack ?? (() => false);

  const waiting = new Map<string, T>();
  let flying = new Map<string, T>();
  let wire: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let state: SaveState = 'idle';
  let revision = 0;
  // Whether anything was put since the last batch left, which is what tells a
  // retry earned by a new change from the same batch going round for ever.
  let changed = false;

  const become = (next: SaveState, error: unknown = null): void => {
    state = next;
    options.onChange?.(next, error);
  };

  const hush = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const take = (): Map<string, T> => {
    const batch = new Map<string, T>();

    for (const [key, edit] of waiting) {
      if (batch.size === limit) break;

      batch.set(key, edit);
      waiting.delete(key);
    }

    return batch;
  };

  const go = (): void => {
    if (wire !== null || waiting.size === 0) return;

    flying = take();
    changed = false;
    wire = options.send([...flying.values()]).then(landed, missed);
  };

  /** What is left once a batch is done with: the quiet still running sends it, or it goes now. */
  const onward = (): boolean => {
    if (waiting.size === 0) return false;
    if (timer === null) go();

    return true;
  };

  const landed = (): void => {
    flying = new Map();
    wire = null;

    if (!onward()) become('saved');
  };

  /**
   * Everything not yet known to have landed, in the order it is to be sent. The
   * batch on the wire was put before anything waiting, so it leads; a newer word
   * on one of its keys takes its place there, or keeps its own at the back.
   */
  const line = (): Map<string, T> => {
    const all = new Map<string, T>();

    for (const [key, edit] of flying) {
      if (!(waiting.has(key) && toBack(key))) all.set(key, waiting.get(key) ?? edit);
    }

    for (const [key, edit] of waiting) {
      if (!all.has(key)) all.set(key, edit);
    }

    return all;
  };

  /** The batch comes off the wire and back to the head of the line, under anything changed since. */
  const takeBack = (): void => {
    const all = line();

    waiting.clear();

    for (const [key, edit] of all) waiting.set(key, edit);

    flying = new Map();
    wire = null;
  };

  const failed = (error: unknown): void => {
    takeBack();

    if (timer !== null) return;

    if (changed) go();
    else become('failed', error);
  };

  const salvaged = (keep: (key: string, edit: T) => boolean): void => {
    takeBack();

    for (const [key, edit] of waiting) {
      if (!keep(key, edit)) waiting.delete(key);
    }

    if (onward()) return;

    hush();
    become('idle');
  };

  const missed = (error: unknown): void => {
    if (options.refused?.(error) !== true) {
      failed(error);

      return;
    }

    const looking = options.salvage?.(error, flying) ?? null;

    if (looking !== null) {
      // The wire stays taken and the batch stays counted as out, so a read
      // keeps it on the screen and nothing crosses the answer.
      wire = looking.then(salvaged, failed);

      return;
    }

    flying = new Map();
    wire = null;
    options.onRefused?.(error);

    if (!onward()) become('idle');
  };

  const flush = (): void => {
    hush();

    if (waiting.size === 0) return;
    if (wire !== null) return;

    if (state !== 'saving') become('saving');

    go();
  };

  return {
    put: (key, edit) => {
      if (toBack(key)) waiting.delete(key);

      waiting.set(key, edit);
      revision += 1;
      changed = true;

      if (state !== 'saving') become('saving');

      hush();
      timer = setTimeout(() => {
        timer = null;
        go();
      }, quiet);
    },

    drop: (matches) => {
      for (const key of [...waiting.keys()]) {
        if (matches(key)) waiting.delete(key);
      }

      if (waiting.size > 0 || wire !== null) return;

      hush();

      if (state === 'saving' || state === 'failed') become('idle');
    },

    flush,

    settled: async () => {
      flush();

      while (wire !== null) await wire;
    },

    pending: () => [...line().values()],

    state: () => state,

    revision: () => revision,
  };
}
