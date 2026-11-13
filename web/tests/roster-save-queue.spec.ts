import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RosterEdit, editKey } from '@/lib/roster/edits';
import { INHERIT, NO_PATTERN } from '@/lib/roster/people';
import { SaveQueueOptions, SaveState, createSaveQueue, overallState } from '@/lib/roster/save-queue';

/** A send held open, answered when the test says. */
function held() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;

  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });

  return { promise, resolve, reject };
}

const BROKEN = new Error('Broken.');
const TURNED_DOWN = new Error('Person does not exist.');

/** A queue that records what it sent and which states it passed through. */
function queueWith(over: Partial<SaveQueueOptions<string>> = {}) {
  const send = vi.fn<(batch: string[]) => Promise<void>>().mockResolvedValue(undefined);
  const states: SaveState[] = [];

  const queue = createSaveQueue<string>({
    send,
    refused: (error) => error === TURNED_DOWN,
    onChange: (state) => states.push(state),
    ...over,
  });

  return { queue, send, states };
}

const quiet = () => vi.advanceTimersByTimeAsync(500);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the quiet', () => {
  it('sends nothing until 500 ms have passed with no change', async () => {
    const { queue, send } = queueWith();

    queue.put('a', '1');
    await vi.advanceTimersByTimeAsync(499);

    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('starts again on every change, so a run of stamps is one request', async () => {
    const { queue, send } = queueWith();

    for (const key of ['a', 'b', 'c', 'd']) {
      queue.put(key, '1');
      await vi.advanceTimersByTimeAsync(400);
    }

    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual(['1', '1', '1', '1']);
  });

  it('keeps only the last word on one key', async () => {
    const { queue, send } = queueWith();

    queue.put('cell', 'stamped');
    queue.put('other', 'kept');
    queue.put('cell', 'cleared');
    await quiet();

    expect(send.mock.calls[0][0]).toEqual(['cleared', 'kept']);
  });
});

describe('the wire', () => {
  it('holds one request at a time, the newest batch waiting behind it', async () => {
    const first = held();
    const { queue, send } = queueWith();

    send.mockReturnValueOnce(first.promise);

    queue.put('a', 'one');
    await quiet();

    queue.put('b', 'two');
    await quiet();

    queue.put('c', 'three');
    await quiet();

    expect(send).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual(['two', 'three']);
  });

  it('lets a change made during a request have its own quiet', async () => {
    const first = held();
    const { queue, send } = queueWith();

    send.mockReturnValueOnce(first.promise);

    queue.put('a', 'one');
    await quiet();

    queue.put('b', 'two');
    first.resolve();
    await vi.advanceTimersByTimeAsync(499);

    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('splits what the server would refuse as too big, and sends the rest as soon as the first lands', async () => {
    const { queue, send } = queueWith({ limit: 2 });

    for (const key of ['a', 'b', 'c', 'd', 'e']) queue.put(key, key);

    await quiet();
    await vi.advanceTimersByTimeAsync(0);

    expect(send.mock.calls.map(([batch]) => batch)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });
});

describe('the state', () => {
  it('says saving from the first change and saved once it lands', async () => {
    const { queue, states } = queueWith();

    queue.put('a', '1');

    expect(queue.state()).toBe('saving');

    await quiet();

    expect(states).toEqual(['saving', 'saved']);
  });

  it('stays on saving while a batch waits behind one that landed', async () => {
    const first = held();
    const { queue, send, states } = queueWith();

    send.mockReturnValueOnce(first.promise);

    queue.put('a', '1');
    await quiet();

    queue.put('b', '2');
    first.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(states).toEqual(['saving']);

    await quiet();

    expect(states).toEqual(['saving', 'saved']);
  });

  it('starts idle and says nothing for no reason', () => {
    const { queue, states } = queueWith();

    expect(queue.state()).toBe('idle');
    expect(states).toEqual([]);
  });
});

describe('several rosters at once', () => {
  it('says the worst of them, so a failure on the roster left behind still shows', () => {
    expect(overallState(['saved', 'failed', 'saving'])).toBe('failed');
    expect(overallState(['saved', 'saving', 'idle'])).toBe('saving');
    expect(overallState(['idle', 'saved'])).toBe('saved');
    expect(overallState(['idle'])).toBe('idle');
    expect(overallState([])).toBe('idle');
  });
});

describe('a failure', () => {
  it('says so with the reason, and does not go round by itself', async () => {
    const onChange = vi.fn();
    const { queue, send } = queueWith({ onChange });

    send.mockRejectedValue(BROKEN);

    queue.put('a', '1');
    await quiet();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(queue.state()).toBe('failed');
    expect(onChange).toHaveBeenLastCalledWith('failed', BROKEN);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps the batch, and a retry sends it', async () => {
    const { queue, send, states } = queueWith();

    send.mockRejectedValueOnce(BROKEN);

    queue.put('a', '1');
    await quiet();

    queue.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(send.mock.calls[1][0]).toEqual(['1']);
    expect(states).toEqual(['saving', 'failed', 'saving', 'saved']);
  });

  it('goes again with the next change, carrying what failed', async () => {
    const { queue, send } = queueWith();

    send.mockRejectedValueOnce(BROKEN);

    queue.put('a', 'failed first');
    await quiet();

    queue.put('b', 'next');
    await quiet();

    expect(send.mock.calls[1][0].sort()).toEqual(['failed first', 'next']);
    expect(queue.state()).toBe('saved');
  });

  it('lets a newer word beat the failed one on the same key', async () => {
    const { queue, send } = queueWith();

    send.mockRejectedValueOnce(BROKEN);

    queue.put('a', 'older');
    await quiet();

    queue.put('a', 'newer');
    await quiet();

    expect(send.mock.calls[1][0]).toEqual(['newer']);
  });

  it('does not put an older failure back over a newer word made while it was out', async () => {
    const first = held();
    const { queue, send } = queueWith();

    send.mockReturnValueOnce(first.promise);

    queue.put('a', 'older');
    await quiet();

    queue.put('a', 'newer');
    first.reject(BROKEN);
    await quiet();

    expect(send.mock.calls[1][0]).toEqual(['newer']);
  });

  it('sends a change whose quiet ran out behind the failed request, once', async () => {
    const first = held();
    const { queue, send } = queueWith();

    send.mockReturnValueOnce(first.promise).mockRejectedValue(BROKEN);

    queue.put('a', 'one');
    await quiet();

    queue.put('b', 'two');
    await quiet();

    first.reject(BROKEN);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(send).toHaveBeenCalledTimes(2);
    expect(queue.state()).toBe('failed');
  });

  it('does not spin through a backlog bigger than one batch against a dead network', async () => {
    const { queue, send } = queueWith({ limit: 2 });

    send.mockRejectedValue(BROKEN);

    for (const key of ['a', 'b', 'c', 'd', 'e']) queue.put(key, key);

    await quiet();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.state()).toBe('failed');
    expect(queue.pending().sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps every failed edit in what a read has to lay back on top', async () => {
    const { queue, send } = queueWith();

    send.mockRejectedValue(BROKEN);

    queue.put('a', '1');
    queue.put('b', '2');
    await quiet();

    expect(queue.pending().sort()).toEqual(['1', '2']);
  });
});

describe('a refusal', () => {
  it('lets the batch go, reports it, and is not a failure anyone can retry', async () => {
    const onRefused = vi.fn();
    const { queue, send, states } = queueWith({ onRefused });

    send.mockRejectedValueOnce(TURNED_DOWN);

    queue.put('a', '1');
    await quiet();

    expect(onRefused).toHaveBeenCalledWith(TURNED_DOWN);
    expect(queue.pending()).toEqual([]);
    expect(states).toEqual(['saving', 'idle']);

    queue.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends the newer batch behind it, which answers for itself', async () => {
    const first = held();
    const { queue, send } = queueWith();

    send.mockReturnValueOnce(first.promise);

    queue.put('a', 'bad');
    await quiet();

    queue.put('b', 'good');
    await quiet();

    first.reject(TURNED_DOWN);
    await vi.advanceTimersByTimeAsync(0);

    expect(send.mock.calls[1][0]).toEqual(['good']);
    expect(queue.state()).toBe('saved');
  });
});

describe('a refusal only part of the batch earned', () => {
  /** A queue whose second look is held open until the test answers it. */
  function salvaging() {
    let answer!: (keep: (key: string, edit: string) => boolean) => void;
    let refuse!: (error: unknown) => void;

    const salvage = vi.fn(
      () =>
        new Promise<(key: string, edit: string) => boolean>((yes, no) => {
          answer = yes;
          refuse = no;
        }),
    );

    return { ...queueWith({ salvage }), salvage, answer: () => answer, refuse: () => refuse };
  }

  it('sends what is still good, and lets go of the rest', async () => {
    const { queue, send, answer } = salvaging();

    send.mockRejectedValueOnce(TURNED_DOWN);

    queue.put('gone', 'stale');
    queue.put('here', 'good');
    await quiet();

    answer()((key) => key !== 'gone');
    await vi.advanceTimersByTimeAsync(0);

    expect(send.mock.calls[1][0]).toEqual(['good']);
    expect(queue.state()).toBe('saved');
    expect(queue.pending()).toEqual([]);
  });

  it('shows the batch to the second look along with its keys', async () => {
    const { queue, send, salvage } = salvaging();

    send.mockRejectedValueOnce(TURNED_DOWN);

    queue.put('a', '1');
    await quiet();

    expect(salvage).toHaveBeenCalledWith(TURNED_DOWN, new Map([['a', '1']]));
  });

  it('sends nothing while it waits for the answer, however much is flushed', async () => {
    const { queue, send, answer } = salvaging();

    send.mockRejectedValueOnce(TURNED_DOWN);

    queue.put('a', '1');
    await quiet();

    queue.put('b', '2');
    queue.flush();
    await quiet();

    expect(send).toHaveBeenCalledTimes(1);

    answer()(() => true);
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('keeps the batch on the screen meanwhile, and a read waits for the answer', async () => {
    const { queue, send, answer } = salvaging();
    let settled = false;

    send.mockRejectedValueOnce(TURNED_DOWN);

    queue.put('a', '1');
    await quiet();

    void queue.settled().then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);

    expect(queue.pending()).toEqual(['1']);
    expect(settled).toBe(false);

    answer()(() => true);
    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toBe(true);
    expect(queue.pending()).toEqual([]);
  });

  it('does not put the batch back over a newer word on the same key', async () => {
    const { queue, send, answer } = salvaging();

    send.mockRejectedValueOnce(TURNED_DOWN);

    queue.put('a', 'older');
    await quiet();

    queue.put('a', 'newer');
    answer()(() => true);
    await quiet();

    expect(send.mock.calls[1][0]).toEqual(['newer']);
  });

  it('lets go of a newer word that would only be refused the same way', async () => {
    const { queue, send, answer } = salvaging();

    send.mockRejectedValueOnce(TURNED_DOWN);

    queue.put('gone', 'older');
    await quiet();

    queue.put('gone', 'newer');
    answer()(() => false);
    await quiet();

    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.state()).toBe('idle');
  });

  it('settles idle when nothing is left', async () => {
    const { queue, send, states, answer } = salvaging();

    send.mockRejectedValueOnce(TURNED_DOWN);

    queue.put('a', '1');
    await quiet();

    answer()(() => false);
    await vi.advanceTimersByTimeAsync(0);

    expect(states).toEqual(['saving', 'idle']);
  });

  it('holds everything as failed when the second look cannot get through, and a retry starts over', async () => {
    const onChange = vi.fn();
    const salvage = vi.fn(() => Promise.reject(BROKEN));
    const { queue, send } = queueWith({ salvage, onChange });

    send.mockRejectedValueOnce(TURNED_DOWN);

    queue.put('a', '1');
    await quiet();

    expect(onChange).toHaveBeenLastCalledWith('failed', BROKEN);
    expect(queue.pending()).toEqual(['1']);

    queue.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(send.mock.calls[1][0]).toEqual(['1']);
    expect(queue.state()).toBe('saved');
  });

  it('skips the second look for a refusal it passes on, and says so as before', async () => {
    const onRefused = vi.fn();
    const salvage = vi.fn(() => null);
    const { queue, send, states } = queueWith({ salvage, onRefused });

    send.mockRejectedValueOnce(TURNED_DOWN);

    queue.put('a', '1');
    await quiet();

    expect(onRefused).toHaveBeenCalledWith(TURNED_DOWN);
    expect(states).toEqual(['saving', 'idle']);
  });

  it('leaves a plain failure alone', async () => {
    const salvage = vi.fn(() => null);
    const { queue, send } = queueWith({ salvage });

    send.mockRejectedValueOnce(BROKEN);

    queue.put('a', '1');
    await quiet();

    expect(salvage).not.toHaveBeenCalled();
    expect(queue.state()).toBe('failed');
  });
});

describe('the order of the line', () => {
  /** Cells go to the back when set again, as the roster's do; anything else keeps its place. */
  const roster = () => queueWith({ toBack: (key) => key.startsWith('cell') });

  it('sends in the order things were put, a newer word in the earlier one’s place', async () => {
    const { queue, send } = queueWith();

    queue.put('a', 'a1');
    queue.put('b', 'b');
    queue.put('a', 'a2');
    await quiet();

    expect(send.mock.calls[0][0]).toEqual(['a2', 'b']);
  });

  it('sends a newer word on a key that goes to the back behind what was put since', async () => {
    const { queue, send } = roster();

    queue.put('cell', 'set before');
    queue.put('person', 'moved');
    queue.put('cell', 'set after');
    await quiet();

    expect(send.mock.calls[0][0]).toEqual(['moved', 'set after']);
  });

  it('puts a failed batch back at the head of the line, ahead of what was put while it was out', async () => {
    const first = held();
    const { queue, send } = queueWith();

    send.mockReturnValueOnce(first.promise);

    queue.put('person', 'moved');
    await quiet();

    queue.put('cell', 'set after');
    first.reject(BROKEN);
    await quiet();

    expect(send.mock.calls[1][0]).toEqual(['moved', 'set after']);
  });

  it('lays out what is pending in the order it is to go, the wire first', async () => {
    const first = held();
    const { queue, send } = roster();

    send.mockReturnValueOnce(first.promise);

    queue.put('cell', 'set before');
    queue.put('person', 'moved');
    await quiet();

    queue.put('cell', 'set after');
    queue.put('person', 'moved again');

    // The newer cell keeps its own place behind the move; the newer move takes the older one's.
    expect(queue.pending()).toEqual(['moved again', 'set after']);

    first.reject(BROKEN);
    await quiet();

    expect(send.mock.calls[1][0]).toEqual(['moved again', 'set after']);
  });
});

describe('what is pending', () => {
  it('counts both the waiting and what is on the wire, the newest word on each key', async () => {
    const first = held();
    const { queue, send } = queueWith();

    send.mockReturnValueOnce(first.promise);

    queue.put('a', 'older');
    queue.put('b', 'flying');
    await quiet();

    queue.put('a', 'newer');
    queue.put('c', 'waiting');

    expect(queue.pending().sort()).toEqual(['flying', 'newer', 'waiting']);

    first.resolve();
    await quiet();

    expect(queue.pending()).toEqual([]);
  });

  it('moves the revision on every change, so a read knows it was overtaken', () => {
    const { queue } = queueWith();
    const before = queue.revision();

    queue.put('a', '1');

    expect(queue.revision()).not.toBe(before);
  });
});

describe('drop', () => {
  it('takes back what has not gone out, so it cannot fail the batch it would ride in', async () => {
    const { queue, send } = queueWith();

    queue.put('gone', '1');
    queue.put('stays', '2');
    queue.drop((key) => key === 'gone');
    await quiet();

    expect(send.mock.calls[0][0]).toEqual(['2']);
  });

  it('has nothing to report once everything is taken back', async () => {
    const { queue, send, states } = queueWith();

    queue.put('gone', '1');
    queue.drop(() => true);
    await quiet();

    expect(send).not.toHaveBeenCalled();
    expect(states).toEqual(['saving', 'idle']);
  });

  it('clears a failure there is nothing left to retry for', async () => {
    const { queue, send } = queueWith();

    send.mockRejectedValueOnce(BROKEN);

    queue.put('gone', '1');
    await quiet();

    queue.drop(() => true);

    expect(queue.state()).toBe('idle');
  });

  it('cannot recall what is already on the wire', async () => {
    const first = held();
    const { queue, send } = queueWith();

    send.mockReturnValueOnce(first.promise);

    queue.put('a', '1');
    await quiet();

    queue.drop(() => true);
    first.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(queue.state()).toBe('saved');
  });
});

describe('flush and settled', () => {
  it('does not wait out the quiet', async () => {
    const { queue, send } = queueWith();

    queue.put('a', '1');
    queue.flush();

    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not open a second request beside one that is out', async () => {
    const first = held();
    const { queue, send } = queueWith();

    send.mockReturnValueOnce(first.promise);

    queue.put('a', '1');
    queue.flush();
    queue.put('b', '2');
    queue.flush();

    expect(send).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('settles only once everything waiting has landed', async () => {
    const first = held();
    const { queue, send } = queueWith();
    let settled = false;

    send.mockReturnValueOnce(first.promise);

    queue.put('a', '1');
    queue.flush();
    queue.put('b', '2');

    void queue.settled().then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toBe(false);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledTimes(2);
    expect(settled).toBe(true);
  });

  it('settles on a failure too, with the edits still pending for the caller to see', async () => {
    const { queue, send } = queueWith();

    send.mockRejectedValue(BROKEN);

    queue.put('a', '1');
    await queue.settled();

    expect(queue.state()).toBe('failed');
    expect(queue.pending()).toEqual(['1']);
  });

  it('settles at once when there is nothing to do', async () => {
    const { queue, send } = queueWith();

    await queue.settled();

    expect(send).not.toHaveBeenCalled();
    expect(queue.state()).toBe('idle');
  });
});

describe('the roster’s own edits', () => {
  it('coalesce a day with no time over hours, and a person’s latest position, hours and days', async () => {
    const send = vi.fn<(batch: RosterEdit[]) => Promise<void>>().mockResolvedValue(undefined);
    const queue = createSaveQueue<RosterEdit>({ send });
    const put = (edit: RosterEdit) => queue.put(editKey(edit), edit);
    const bare: RosterEdit = { kind: 'set', shift: { person_id: 1, date: '2026-11-02', start_time: null, end_time: null } };
    const person: RosterEdit = {
      kind: 'person',
      id: 1,
      save: {
        name: 'Толик',
        colour: '#6366f1',
        position_id: 4,
        hours: { mode: 'own', start_time: '18:00', end_time: '02:00', week_hours: [] },
        pattern: { kind: 'weekdays', weekdays: [5, 6], on: null, off: null, from: null },
      },
    };

    put({ kind: 'set', shift: { person_id: 1, date: '2026-11-02', start_time: '11:00', end_time: '22:00' } });
    put({ kind: 'person', id: 1, save: { ...person.save, position_id: null, hours: INHERIT, pattern: NO_PATTERN } });
    put(bare);
    put(person);
    await quiet();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual([bare, person]);
  });
});
