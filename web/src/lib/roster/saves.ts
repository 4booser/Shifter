import { HttpError, apiErrorMessage } from '@/lib/api/http';
import { refusedForGood, rosterApi, sendEdits } from '@/lib/api/roster';
import { RosterEdit, peopleGone, personOf } from './edits';
import { SaveQueue, SaveState, createSaveQueue, overallState } from './save-queue';

/** What became of a batch the server turned down. */
export interface RosterRefusal {
  error: unknown;
  /** Those it named who are no longer on the roster. None means the refusal was about something else and the whole batch went. */
  went: number[];
  /** How many of its edits stayed, to be sent again. */
  kept: number;
}

export interface RosterSavesOptions {
  onChange: (state: SaveState, failure: string | null) => void;
  onRefused: (refusal: RosterRefusal) => void;
}

export interface RosterSaves {
  queueFor: (rosterId: number) => SaveQueue<RosterEdit>;
  flush: () => void;
  /** The same flush, in a request that survives the page going. */
  leave: () => void;
  /** Whether anything has not reached the server, or is still on its way there. */
  unsaved: () => boolean;
}

/** One save queue per roster, all alive at once, so a save that fails after the owner moved to another roster is still shown and still retried. */
export function createRosterSaves({ onChange, onRefused }: RosterSavesOptions): RosterSaves {
  const queues = new Map<number, SaveQueue<RosterEdit>>();
  let leaving = false;

  const states = () => [...queues.values()].map((queue) => queue.state());

  /** One stale person fails a whole batch, so the server's list says what is worth sending again. */
  const salvage = async (rosterId: number, error: unknown, batch: Map<string, RosterEdit>) => {
    const roster = (await rosterApi.list()).find((one) => one.id === rosterId);
    const went = roster === undefined ? [] : peopleGone(batch.values(), roster.people);

    // Everybody it names is still there, or the roster itself has gone. Either
    // way a second try gets the same answer, and only the batch can go with it.
    if (went.length === 0) {
      onRefused({ error, went, kept: 0 });

      return (key: string) => !batch.has(key);
    }

    const stays = (edit: RosterEdit) => {
      const person = personOf(edit);

      return person === null || !went.includes(person);
    };

    onRefused({ error, went, kept: [...batch.values()].filter(stays).length });

    return (_: string, edit: RosterEdit) => stays(edit);
  };

  const queueFor = (rosterId: number): SaveQueue<RosterEdit> => {
    const running = queues.get(rosterId);

    if (running !== undefined) return running;

    const queue = createSaveQueue<RosterEdit>({
      send: (batch) => sendEdits(rosterId, batch, leaving),
      refused: refusedForGood,
      onRefused: (error) => onRefused({ error, went: [], kept: 0 }),
      salvage: (error, batch) =>
        error instanceof HttpError && error.status === 404 ? salvage(rosterId, error, batch) : null,
      onChange: (_, error) => onChange(overallState(states()), error === null ? null : apiErrorMessage(error)),
    });

    queues.set(rosterId, queue);

    return queue;
  };

  const flush = (): void => {
    for (const queue of queues.values()) queue.flush();
  };

  return {
    queueFor,
    flush,

    leave: () => {
      // Only for as long as the sends take to start: they start inside flush.
      leaving = true;
      flush();
      leaving = false;
    },

    unsaved: () => states().some((state) => state === 'saving' || state === 'failed'),
  };
}

/**
 * The ways a page ends, each given its last chance to save. pagehide is here
 * for itself: at that moment the page still counts as visible, and the moment
 * after is too late for a request to get out. A plain fetch does not outlive
 * the page, so leaving goes with keepalive, and since even that may not make
 * it the browser is asked to hold the page while anything is unsent.
 */
export function watchLeaving(
  saves: Pick<RosterSaves, 'leave' | 'unsaved'>,
  page: EventTarget,
  doc: EventTarget & { visibilityState: string },
): () => void {
  const onHide = () => {
    if (doc.visibilityState === 'hidden') saves.leave();
  };

  const onPageHide = () => saves.leave();

  const onBeforeUnload = (event: Event) => {
    saves.leave();

    if (!saves.unsaved()) return;

    event.preventDefault();
    // What older browsers look at instead.
    (event as BeforeUnloadEvent).returnValue = true;
  };

  doc.addEventListener('visibilitychange', onHide);
  page.addEventListener('pagehide', onPageHide);
  page.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    doc.removeEventListener('visibilitychange', onHide);
    page.removeEventListener('pagehide', onPageHide);
    page.removeEventListener('beforeunload', onBeforeUnload);
  };
}
