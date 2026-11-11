import { QUIET_BEFORE_SAVE, SaveState } from './day-saver';
import { BATCH_MOST, CellEdit, cellKey, goneFromServer, RosterBatch, toBatch } from './roster';

/**
 * Saving a roster without being asked to, with nothing native in it.
 *
 * One request out at a time, and one batch waiting behind it: a cell changed
 * twice is only its last word. A batch that fails goes back underneath whatever
 * was changed since and stays there until the next change or the retry. There
 * is no queue behind this, by decision: a roster is one person at one screen,
 * who sees the failure and is still there to do something about it. A saver
 * does outlive the screen, though, see createRosterSavers.
 */

export type RosterSaveState = Exclude<SaveState, 'conflict'>;

export interface RosterSaver {
  /** One cell changed. */
  edit: (edit: CellEdit) => void;
  /** Saves now rather than after the quiet. Resolves once nothing is left to send or a send has failed. This is also the retry. */
  flush: () => Promise<void>;
  /** The flush for moments the owner did not ask for one: reading, leaving, the app put away. A failure stays put, since going out again with no change could overwrite what was written elsewhere since. */
  settle: () => Promise<void>;
  /** Every edit not yet known to have landed, by its latest word. */
  unsent: () => CellEdit[];
  /** Lets go of edits for anybody not on this list. Only for once nothing is out: a batch naming somebody gone is refused whole. */
  keep: (people: number[]) => void;
  /** Whether everything changed has reached the server. */
  clean: () => boolean;
  /** Whether a request is out right now. */
  sending: () => boolean;
  /** Moves on every edit, so a read can tell it was overtaken. */
  revision: () => number;
}

export function createRosterSaver(options: {
  send: (batch: RosterBatch) => Promise<void>;
  onState: (state: RosterSaveState) => void;
  onFailed: (caught: unknown) => void;
  quiet?: number;
}): RosterSaver {
  const quiet = options.quiet ?? QUIET_BEFORE_SAVE;

  const waiting = new Map<string, CellEdit>();
  let out: [string, CellEdit][] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flying: Promise<void> | null = null;
  let again = false;
  let saved = false;
  let failed = false;
  let revision = 0;

  const report = () => {
    if (flying !== null) options.onState('saving');
    else if (failed) options.onState('failed');
    else if (waiting.size > 0) options.onState('waiting');
    else options.onState(saved ? 'saved' : 'clean');
  };

  const disarm = () => {
    if (timer !== null) clearTimeout(timer);

    timer = null;
  };

  const sendOnce = async () => {
    out = [...waiting.entries()].slice(0, BATCH_MOST);

    for (const [key] of out) waiting.delete(key);

    // A long failure can leave more than one request may carry, and what did
    // not fit has nobody coming back to send it.
    const spilled = waiting.size > 0;

    try {
      await options.send(toBatch(out.map(([, edit]) => edit)));
      saved = true;

      if (spilled) again = true;
    } catch (caught) {
      // Underneath: anything changed since is newer than what just failed.
      for (const [key, edit] of out) {
        if (!waiting.has(key)) waiting.set(key, edit);
      }

      failed = true;
      options.onFailed(caught);
    }

    out = [];
  };

  const run = async () => {
    do {
      again = false;
      await sendOnce();
    } while (again && waiting.size > 0 && !failed);

    flying = null;
    report();
  };

  const flush = (): Promise<void> => {
    disarm();

    if (flying !== null) {
      again = true;

      return flying;
    }

    if (waiting.size === 0) return Promise.resolve();

    failed = false;
    flying = run();
    report();

    return flying;
  };

  return {
    edit: (edit) => {
      waiting.set(cellKey(edit.person_id, edit.date), edit);
      revision += 1;
      failed = false;
      disarm();
      timer = setTimeout(() => void flush(), quiet);
      report();
    },

    flush,

    settle: () => (failed && timer === null ? Promise.resolve() : flush()),

    unsent: () => [...new Map([...out, ...waiting]).values()],

    keep: (people) => {
      const staying = new Set(people);

      for (const [key, edit] of waiting) {
        if (!staying.has(edit.person_id)) waiting.delete(key);
      }

      if (waiting.size === 0) {
        disarm();
        failed = false;
      }

      report();
    },

    clean: () => waiting.size === 0 && flying === null && !failed,

    sending: () => flying !== null,

    revision: () => revision,
  };
}

/**
 * A read nothing can overtake. What is waiting goes first, or the answer brings
 * the old cell back, and a change arriving behind the read sends it round again:
 * that change can land first, and then it is neither in the answer nor among
 * what is laid over it. Only a screen with nothing on it does not wait for a
 * request that is out, which may take as long as the network likes: it reads
 * at once, with show laying the unsent over the answer, and again afterwards.
 */
export async function readPast<T>(
  saver: Pick<RosterSaver, 'settle' | 'revision' | 'sending'>,
  read: () => Promise<T>,
  show: (answer: T) => void,
  empty: () => boolean,
): Promise<void> {
  let answer: T;
  let edited: number;

  do {
    edited = saver.revision();

    const settling = saver.settle();

    if (saver.sending() && empty()) show(await read());

    await settling;
    answer = await read();
  } while (saver.revision() !== edited);

  show(answer);
}

/** Bad news first: what the header shows of several savers. */
const WORST_FIRST: RosterSaveState[] = ['failed', 'saving', 'waiting', 'saved'];

export interface RosterSavers {
  /** A roster's saver, the same one however often its screen comes and goes. */
  of: (rosterId: number) => RosterSaver;
  /** The worst news among them. */
  state: (shown?: number | null) => RosterSaveState;
  /** Tries again whatever failed, on whichever roster it was. */
  retry: () => void;
  /** Takes the server's word for who is on a refused roster, and sends what is left. True if anything had to go. */
  absorb: (rosterId: number, people: number[]) => boolean;
  /** Lets a roster's edits go: it has been deleted, and they have nowhere to land. */
  forget: (rosterId: number) => void;
  /** Lets everything go, for the next account to sign in. */
  forgetAll: () => void;
  /** Told of every change of state. Hands back the way to stop listening. */
  listen: (listener: () => void) => () => void;
  /** Told when the server refuses a batch for naming somebody gone. */
  onRefused: (listener: (rosterId: number) => void) => () => void;
}

/**
 * One saver per roster, held apart from any screen. A saver that lived and died
 * with its screen took its unsent cells with it on a switch of roster, and left
 * a request out that the next screen knew nothing about.
 */
export function createRosterSavers(options: {
  send: (rosterId: number, batch: RosterBatch) => Promise<void>;
  quiet?: number;
}): RosterSavers {
  const held = new Map<number, { saver: RosterSaver; state: RosterSaveState }>();
  const listeners = new Set<() => void>();
  const refusals = new Set<(rosterId: number) => void>();

  const announce = () => {
    for (const listener of listeners) listener();
  };

  const of = (rosterId: number): RosterSaver => {
    const known = held.get(rosterId);

    if (known !== undefined) return known.saver;

    const entry: { saver: RosterSaver; state: RosterSaveState } = {
      state: 'clean',
      saver: createRosterSaver({
        send: (batch) => options.send(rosterId, batch),
        quiet: options.quiet,
        onState: (state) => {
          entry.state = state;
          announce();
        },
        onFailed: (caught) => {
          if (!goneFromServer(caught)) return;

          for (const listener of refusals) listener(rosterId);
        },
      }),
    };

    held.set(rosterId, entry);

    return entry.saver;
  };

  const forget = (rosterId: number) => {
    held.get(rosterId)?.saver.keep([]);
    held.delete(rosterId);
    announce();
  };

  return {
    of,

    state: (shown) => {
      // A failure follows the owner across rosters. A receipt does not: it
      // would say Сохранено over a roster nothing was saved on.
      const states = [...held]
        .filter(([rosterId, entry]) => shown === undefined || rosterId === shown || entry.state !== 'saved')
        .map(([, entry]) => entry.state);

      return WORST_FIRST.find((state) => states.includes(state)) ?? 'clean';
    },

    retry: () => {
      for (const { saver, state } of held.values()) {
        if (state === 'failed') void saver.flush();
      }
    },

    absorb: (rosterId, people) => {
      const saver = of(rosterId);
      const had = saver.unsent().length;

      saver.keep(people);

      if (saver.unsent().length === had) return false;

      void saver.flush();

      return true;
    },

    forget,

    forgetAll: () => {
      for (const rosterId of [...held.keys()]) forget(rosterId);
    },

    listen: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },

    onRefused: (listener) => {
      refusals.add(listener);

      return () => refusals.delete(listener);
    },
  };
}
