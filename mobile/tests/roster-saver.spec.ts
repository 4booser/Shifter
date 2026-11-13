import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BATCH_MOST, CellEdit, RosterBatch } from '@/lib/roster';
import { createRosterSaver, createRosterSavers, readPast, RosterSaveState } from '@/lib/roster-saver';

const stamp = (person: number, date: string, start = '11:00', end = '22:00'): CellEdit => ({
  person_id: person,
  date,
  hours: { start_time: start, end_time: end },
});

const blank = (person: number, date: string): CellEdit => ({ person_id: person, date, hours: null });

/** A day they work at no set time: filled, with no hours. */
const bare = (person: number, date: string): CellEdit => ({
  person_id: person,
  date,
  hours: { start_time: null, end_time: null },
});

describe('saving a roster by itself', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A server that answers when told to. */
  function rig() {
    const sent: RosterBatch[] = [];
    const pending: { resolve: () => void; reject: (why: unknown) => void }[] = [];
    const states: RosterSaveState[] = [];
    const failures: unknown[] = [];

    const saver = createRosterSaver({
      send: (batch) => {
        sent.push(batch);

        return new Promise((resolve, reject) => pending.push({ resolve, reject }));
      },
      onState: (state) => states.push(state),
      onFailed: (caught) => failures.push(caught),
    });

    const land = async () => {
      pending.shift()!.resolve();
      await vi.advanceTimersByTimeAsync(0);
    };
    const fail = async (why: unknown = new Error('нет сети')) => {
      pending.shift()!.reject(why);
      await vi.advanceTimersByTimeAsync(0);
    };

    return { saver, sent, pending, states, failures, land, fail };
  }

  it('sends nothing until something changes', async () => {
    const { sent } = rig();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(sent).toEqual([]);
  });

  it('waits half a second after the last change, however many there are', async () => {
    const { saver, sent } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(400);
    saver.edit(stamp(1, '2026-11-03'));
    await vi.advanceTimersByTimeAsync(400);

    expect(sent).toEqual([]);

    await vi.advanceTimersByTimeAsync(100);

    expect(sent).toHaveLength(1);
    expect(sent[0].set.map((cell) => cell.date)).toEqual(['2026-11-02', '2026-11-03']);
  });

  it('sends a cell changed twice once, by its last word', async () => {
    const { saver, sent } = rig();

    saver.edit(stamp(1, '2026-11-02', '11:00', '22:00'));
    saver.edit(stamp(1, '2026-11-02', '12:00', '20:00'));
    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toHaveLength(1);
    expect(sent[0].set).toEqual([
      { person_id: 1, date: '2026-11-02', start_time: '12:00', end_time: '20:00' },
    ]);
  });

  it('takes a day with no time and a timed one on the same cell as one cell, sending the last', async () => {
    const { saver, sent, land } = rig();

    saver.edit(stamp(1, '2026-11-02', '11:00', '22:00'));
    saver.edit(bare(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);

    expect(sent[0]).toEqual({
      set: [{ person_id: 1, date: '2026-11-02', start_time: null, end_time: null }],
      clear: [],
    });

    await land();
    saver.edit(bare(1, '2026-11-03'));
    saver.edit(stamp(1, '2026-11-03', '12:00', '20:00'));
    await vi.advanceTimersByTimeAsync(500);

    expect(sent[1]).toEqual({
      set: [{ person_id: 1, date: '2026-11-03', start_time: '12:00', end_time: '20:00' }],
      clear: [],
    });
  });

  it('sends a cell stamped and cleared as a clear, not as both', async () => {
    const { saver, sent } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    saver.edit(blank(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);

    expect(sent[0]).toEqual({ set: [], clear: [{ person_id: 1, date: '2026-11-02' }] });
  });

  it('keeps two people on one date apart', async () => {
    const { saver, sent } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    saver.edit(stamp(2, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);

    expect(sent[0].set.map((cell) => cell.person_id)).toEqual([1, 2]);
  });

  it('never has two requests out, and sends only the newest word after one lands', async () => {
    const { saver, sent, land } = rig();

    saver.edit(stamp(1, '2026-11-02', '11:00', '22:00'));
    await vi.advanceTimersByTimeAsync(500);

    saver.edit(stamp(1, '2026-11-03', '10:00', '18:00'));
    await vi.advanceTimersByTimeAsync(500);
    saver.edit(stamp(1, '2026-11-03', '12:00', '20:00'));
    await vi.advanceTimersByTimeAsync(500);
    saver.edit(stamp(1, '2026-11-04'));
    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toHaveLength(1);

    await land();

    expect(sent).toHaveLength(2);
    expect(sent[1].set).toEqual([
      { person_id: 1, date: '2026-11-03', start_time: '12:00', end_time: '20:00' },
      { person_id: 1, date: '2026-11-04', start_time: '11:00', end_time: '22:00' },
    ]);
  });

  it('still waits out the quiet for a change made just before one landed', async () => {
    const { saver, sent, land } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    saver.edit(stamp(1, '2026-11-03'));
    await land();

    expect(sent).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toHaveLength(2);
  });

  it('says what it is doing', async () => {
    const { saver, states, land } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    expect(states.at(-1)).toBe('waiting');

    await vi.advanceTimersByTimeAsync(500);
    expect(states.at(-1)).toBe('saving');

    await land();
    expect(states.at(-1)).toBe('saved');
  });

  it('owns up to a failure and does not try again by itself', async () => {
    const { saver, sent, states, failures, fail } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail();

    expect(states.at(-1)).toBe('failed');
    expect(failures).toHaveLength(1);
    expect(saver.clean()).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(sent).toHaveLength(1);
  });

  it('takes a failed batch along on the next change', async () => {
    const { saver, sent, fail } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail();

    saver.edit(stamp(2, '2026-11-03'));
    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toHaveLength(2);
    expect(sent[1].set.map((cell) => [cell.person_id, cell.date])).toEqual(
      expect.arrayContaining([
        [1, '2026-11-02'],
        [2, '2026-11-03'],
      ]),
    );
    expect(sent[1].set).toHaveLength(2);
  });

  it('tries again when somebody presses retry', async () => {
    const { saver, sent, states, fail, land } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail();

    void saver.flush();

    expect(states.at(-1)).toBe('saving');
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);

    await land();

    expect(states.at(-1)).toBe('saved');
    expect(saver.clean()).toBe(true);
  });

  it('does not let a failed batch overwrite what was changed since', async () => {
    const { saver, sent, fail } = rig();

    saver.edit(stamp(1, '2026-11-02', '11:00', '22:00'));
    await vi.advanceTimersByTimeAsync(500);

    saver.edit(stamp(1, '2026-11-02', '12:00', '20:00'));
    await fail();
    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toHaveLength(2);
    expect(sent[1].set).toEqual([
      { person_id: 1, date: '2026-11-02', start_time: '12:00', end_time: '20:00' },
    ]);
  });

  it('does not bring back a shift cleared while its save was failing', async () => {
    const { saver, sent, fail } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);

    saver.edit(blank(1, '2026-11-02'));
    await fail();
    await vi.advanceTimersByTimeAsync(500);

    expect(sent[1]).toEqual({ set: [], clear: [{ person_id: 1, date: '2026-11-02' }] });
  });

  it('keeps going after a failure once something lands', async () => {
    const { saver, sent, states, fail, land } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail();
    void saver.flush();
    await land();

    saver.edit(stamp(1, '2026-11-03'));
    await vi.advanceTimersByTimeAsync(500);
    await land();

    expect(sent).toHaveLength(3);
    expect(states.at(-1)).toBe('saved');
  });

  it('goes straight out when flushed, and the quiet sends nothing after', async () => {
    const { saver, sent } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    void saver.flush();

    expect(sent).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toHaveLength(1);
  });

  it('has nothing to flush when nothing changed', async () => {
    const { saver, sent } = rig();

    await saver.flush();

    expect(sent).toEqual([]);
    expect(saver.clean()).toBe(true);
  });

  it('flushes what is left when the screen closes during a save', async () => {
    const { saver, sent, land } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    saver.edit(stamp(1, '2026-11-03'));

    const closing = saver.flush();

    await land();

    expect(sent).toHaveLength(2);

    await land();
    await closing;

    expect(saver.clean()).toBe(true);
  });

  it('splits what one request cannot carry, and sends the rest unasked', async () => {
    const { saver, sent, land, states } = rig();

    for (let person = 1; person <= BATCH_MOST + 3; person++) saver.edit(stamp(person, '2026-11-02'));

    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toHaveLength(1);
    expect(sent[0].set).toHaveLength(BATCH_MOST);

    await land();

    expect(sent).toHaveLength(2);
    expect(sent[1].set).toHaveLength(3);

    await land();

    expect(states.at(-1)).toBe('saved');
  });

  it('counts clears and sets together towards what a request can carry', async () => {
    const { saver, sent } = rig();

    for (let person = 1; person <= BATCH_MOST; person++) {
      saver.edit(person % 2 === 0 ? stamp(person, '2026-11-02') : blank(person, '2026-11-02'));
    }

    saver.edit(stamp(BATCH_MOST + 1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);

    expect(sent[0].set.length + sent[0].clear.length).toBe(BATCH_MOST);
  });

  it('stops at a failure rather than running through the rest of a long list', async () => {
    const { saver, sent, fail } = rig();

    for (let person = 1; person <= BATCH_MOST + 3; person++) saver.edit(stamp(person, '2026-11-02'));

    await vi.advanceTimersByTimeAsync(500);
    await fail();

    expect(sent).toHaveLength(1);
    expect(saver.unsent()).toHaveLength(BATCH_MOST + 3);
  });

  it('knows what has not landed, whether it is out or still waiting', async () => {
    const { saver, land } = rig();

    saver.edit(stamp(1, '2026-11-02', '11:00', '22:00'));
    await vi.advanceTimersByTimeAsync(500);
    saver.edit(stamp(1, '2026-11-02', '12:00', '20:00'));
    saver.edit(stamp(2, '2026-11-02'));

    expect(saver.unsent()).toEqual([
      stamp(1, '2026-11-02', '12:00', '20:00'),
      stamp(2, '2026-11-02'),
    ]);

    await land();

    expect(saver.unsent()).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(500);
    await land();

    expect(saver.unsent()).toEqual([]);
  });

  it('counts a cell that is out and has nothing newer behind it', async () => {
    // A month read while this one is in the air has not heard of it either,
    // and without it the screen would show the old cell until the next read.
    const { saver, land } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);

    expect(saver.unsent()).toEqual([stamp(1, '2026-11-02')]);

    await land();

    expect(saver.unsent()).toEqual([]);
  });

  it('keeps what failed among what has not landed', async () => {
    const { saver, fail } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail();

    expect(saver.unsent()).toEqual([stamp(1, '2026-11-02')]);
  });

  it('lets go of somebody removed, so their cell cannot sink the batch', async () => {
    const { saver, sent, fail, land } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    saver.edit(stamp(2, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail({ status: 404 });

    saver.keep([2]);
    void saver.flush();

    expect(sent[1].set.map((cell) => cell.person_id)).toEqual([2]);

    await land();

    expect(saver.clean()).toBe(true);
  });

  it('calls off the wait when the only edit belonged to somebody removed', async () => {
    const { saver, sent, states } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    saver.keep([2]);
    await vi.advanceTimersByTimeAsync(500);

    expect(sent).toEqual([]);
    expect(states.at(-1)).toBe('clean');
    expect(saver.clean()).toBe(true);
  });

  it('clears a failure when the only thing failing belonged to somebody removed', async () => {
    const { saver, states, fail } = rig();

    saver.edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail({ status: 404 });

    saver.keep([2]);

    expect(states.at(-1)).toBe('clean');
    expect(saver.clean()).toBe(true);
  });

  it('moves the revision on every change, so a read knows it was overtaken', () => {
    const { saver } = rig();
    const before = saver.revision();

    saver.edit(stamp(1, '2026-11-02'));

    expect(saver.revision()).not.toBe(before);
  });

  it('knows when a request is out', async () => {
    const { saver, land } = rig();

    saver.edit(stamp(1, '2026-11-02'));

    expect(saver.sending()).toBe(false);

    await vi.advanceTimersByTimeAsync(500);

    expect(saver.sending()).toBe(true);

    await land();

    expect(saver.sending()).toBe(false);
  });

  describe('settling, which nobody pressed', () => {
    it('sends what is waiting without waiting out the quiet', async () => {
      const { saver, sent } = rig();

      saver.edit(stamp(1, '2026-11-02'));
      void saver.settle();

      expect(sent).toHaveLength(1);
    });

    it('waits for what is out', async () => {
      const { saver, land } = rig();
      let settled = false;

      saver.edit(stamp(1, '2026-11-02'));
      await vi.advanceTimersByTimeAsync(500);

      void saver.settle().then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);

      expect(settled).toBe(false);

      await land();

      expect(settled).toBe(true);
    });

    it('does not send a failed batch again with no change', async () => {
      const { saver, sent, states, fail } = rig();

      saver.edit(stamp(1, '2026-11-02'));
      await vi.advanceTimersByTimeAsync(500);
      await fail();

      await saver.settle();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(sent).toHaveLength(1);
      expect(states.at(-1)).toBe('failed');
      expect(saver.unsent()).toEqual([stamp(1, '2026-11-02')]);
    });

    it('still sends a change made on top of a failure, and the failure with it', async () => {
      const { saver, sent, fail } = rig();

      saver.edit(stamp(1, '2026-11-02'));
      await vi.advanceTimersByTimeAsync(500);
      await fail();

      saver.edit(stamp(2, '2026-11-02'));
      void saver.settle();

      expect(sent).toHaveLength(2);
      expect(sent[1].set).toHaveLength(2);
    });

    it('sends a change whose quiet is running behind a failure', async () => {
      const { saver, sent, fail } = rig();

      saver.edit(stamp(1, '2026-11-02'));
      await vi.advanceTimersByTimeAsync(500);
      saver.edit(stamp(2, '2026-11-02'));
      await fail();

      void saver.settle();

      expect(sent).toHaveLength(2);
    });

    it('leaves the retry as it was', async () => {
      const { saver, sent, fail } = rig();

      saver.edit(stamp(1, '2026-11-02'));
      await vi.advanceTimersByTimeAsync(500);
      await fail();

      await saver.settle();
      void saver.flush();

      expect(sent).toHaveLength(2);
    });
  });

  describe('reading past what is unsent', () => {
    /** A month read that answers when told to, numbered so a test can see what reached the screen. */
    function reader() {
      const answers: ((month: number) => void)[] = [];
      const shown: number[] = [];
      const read = vi.fn(() => new Promise<number>((resolve) => answers.push(resolve)));

      const answer = async (month: number) => {
        answers.shift()!(month);
        await vi.advanceTimersByTimeAsync(0);
      };

      return { read, answer, shown, show: (month: number) => void shown.push(month) };
    }

    const onScreen = () => false;
    const nothingOnScreen = () => true;

    it('reads straight away when nothing is unsent, and shows it', async () => {
      const { saver } = rig();
      const { read, answer, show, shown } = reader();

      void readPast(saver, read, show, onScreen);
      await vi.advanceTimersByTimeAsync(0);
      await answer(1);

      expect(read).toHaveBeenCalledTimes(1);
      expect(shown).toEqual([1]);
    });

    it('lets what is waiting land first, or the answer would bring the old cell back', async () => {
      const { saver, sent, land } = rig();
      const { read, answer, show, shown } = reader();

      saver.edit(stamp(1, '2026-11-02'));
      void readPast(saver, read, show, onScreen);
      await vi.advanceTimersByTimeAsync(0);

      expect(sent).toHaveLength(1);
      expect(read).not.toHaveBeenCalled();

      await land();
      await answer(1);

      expect(shown).toEqual([1]);
    });

    it('leaves a screen with a month on it where it is until the save is in', async () => {
      const { saver, land } = rig();
      const { read, answer, show } = reader();

      saver.edit(stamp(1, '2026-11-02'));
      await vi.advanceTimersByTimeAsync(500);

      void readPast(saver, read, show, onScreen);
      await vi.advanceTimersByTimeAsync(0);

      expect(read).not.toHaveBeenCalled();

      await land();

      expect(read).toHaveBeenCalledTimes(1);

      await answer(1);
    });

    it('does not keep an empty screen waiting on a request that is out, and reads again once it lands', async () => {
      const { saver, land } = rig();
      const { read, answer, show, shown } = reader();

      saver.edit(stamp(1, '2026-11-02'));
      await vi.advanceTimersByTimeAsync(500);

      void readPast(saver, read, show, nothingOnScreen);
      await vi.advanceTimersByTimeAsync(0);

      expect(read).toHaveBeenCalledTimes(1);

      await answer(1);

      expect(shown).toEqual([1]);
      expect(read).toHaveBeenCalledTimes(1);

      await land();

      expect(read).toHaveBeenCalledTimes(2);

      await answer(2);

      expect(shown).toEqual([1, 2]);
    });

    it('reads an empty screen once when nothing is out', async () => {
      const { saver } = rig();
      const { read, answer, show, shown } = reader();

      void readPast(saver, read, show, nothingOnScreen);
      await vi.advanceTimersByTimeAsync(0);
      await answer(1);

      expect(read).toHaveBeenCalledTimes(1);
      expect(shown).toEqual([1]);
    });

    it('reads again when a change arrives behind it, and shows only the later answer', async () => {
      const { saver, sent, land } = rig();
      const { read, answer, show, shown } = reader();

      void readPast(saver, read, show, onScreen);
      await vi.advanceTimersByTimeAsync(0);

      saver.edit(stamp(1, '2026-11-14'));
      await answer(1);

      expect(read).toHaveBeenCalledTimes(1);
      expect(sent).toHaveLength(1);
      expect(shown).toEqual([]);

      await land();

      expect(read).toHaveBeenCalledTimes(2);

      await answer(2);

      expect(shown).toEqual([2]);
    });

    it('does not send a failure again to read past it, and still reads', async () => {
      const { saver, sent, fail } = rig();
      const { read, answer, show, shown } = reader();

      saver.edit(stamp(1, '2026-11-02'));
      await vi.advanceTimersByTimeAsync(500);
      await fail();

      void readPast(saver, read, show, nothingOnScreen);
      await vi.advanceTimersByTimeAsync(0);
      await answer(1);

      expect(shown).toEqual([1]);
      expect(sent).toHaveLength(1);
      expect(read).toHaveBeenCalledTimes(1);
    });

    it('lets a failed send behind it end the wait', async () => {
      const { saver, fail } = rig();
      const { read, answer, show, shown } = reader();

      saver.edit(stamp(1, '2026-11-02'));
      void readPast(saver, read, show, onScreen);
      await vi.advanceTimersByTimeAsync(0);
      await fail();
      await answer(1);

      expect(shown).toEqual([1]);
      expect(saver.unsent()).toEqual([stamp(1, '2026-11-02')]);
    });

    it('passes on a read that failed', async () => {
      const { saver } = rig();

      await expect(
        readPast(saver, () => Promise.reject(new Error('нет сети')), () => undefined, onScreen),
      ).rejects.toThrow('нет сети');
    });
  });
});

describe('one saver per roster, whatever the screen does', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function rig() {
    const sent: { roster: number; batch: RosterBatch }[] = [];
    const pending: { resolve: () => void; reject: (why: unknown) => void }[] = [];

    const savers = createRosterSavers({
      send: (roster, batch) => {
        sent.push({ roster, batch });

        return new Promise((resolve, reject) => pending.push({ resolve, reject }));
      },
    });

    const land = async () => {
      pending.shift()!.resolve();
      await vi.advanceTimersByTimeAsync(0);
    };
    const fail = async (why: unknown = new Error('нет сети')) => {
      pending.shift()!.reject(why);
      await vi.advanceTimersByTimeAsync(0);
    };

    return { savers, sent, pending, land, fail };
  }

  it('hands back the same saver for a roster, and another for another', () => {
    const { savers } = rig();

    expect(savers.of(1)).toBe(savers.of(1));
    expect(savers.of(1)).not.toBe(savers.of(2));
  });

  it('sends each roster’s cells to that roster', async () => {
    const { savers, sent, land } = rig();

    savers.of(1).edit(stamp(1, '2026-11-02'));
    savers.of(2).edit(stamp(2, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);

    expect(sent.map((one) => [one.roster, one.batch.set[0].person_id])).toEqual([
      [1, 1],
      [2, 2],
    ]);

    await land();
    await land();
  });

  it('still shows a failure after the owner moved to another roster, and retries it from there', async () => {
    const { savers, sent, fail, land } = rig();

    savers.of(1).edit(stamp(1, '2026-11-12'));
    await vi.advanceTimersByTimeAsync(500);
    await fail();

    savers.of(2);

    expect(savers.state()).toBe('failed');

    savers.retry();

    expect(sent.map((one) => one.roster)).toEqual([1, 1]);

    await land();

    expect(savers.state()).toBe('saved');
    expect(savers.of(1).clean()).toBe(true);
  });

  it('shows a receipt only on the roster it was saved on', async () => {
    const { savers, fail, land } = rig();

    savers.of(1).edit(stamp(1, '2026-11-12'));
    await vi.advanceTimersByTimeAsync(500);
    await land();
    savers.of(2);

    expect(savers.state(1)).toBe('saved');
    expect(savers.state(2)).toBe('clean');
    expect(savers.state(null)).toBe('clean');

    savers.of(1).edit(stamp(1, '2026-11-13'));
    await vi.advanceTimersByTimeAsync(500);
    await fail();

    expect(savers.state(2)).toBe('failed');
  });

  it('keeps a cell whose last flush failed on the way out of the screen', async () => {
    const { savers, sent, fail } = rig();

    // The screen for roster 1 closes inside the quiet, offline.
    savers.of(1).edit(stamp(1, '2026-11-12'));
    void savers.of(1).settle();
    await fail();

    expect(savers.state()).toBe('failed');
    expect(savers.of(1).unsent()).toEqual([stamp(1, '2026-11-12')]);
    expect(sent).toHaveLength(1);
  });

  it('shows a screen coming back what has not landed', async () => {
    const { savers, land } = rig();

    savers.of(1).edit(stamp(1, '2026-11-12'));
    await vi.advanceTimersByTimeAsync(500);

    expect(savers.of(1).unsent()).toEqual([stamp(1, '2026-11-12')]);

    await land();

    expect(savers.of(1).unsent()).toEqual([]);
  });

  it('never has two requests out for one roster, however often its screen came back', async () => {
    const { savers, sent, pending, land } = rig();

    savers.of(1).edit(stamp(1, '2026-11-12'));
    await vi.advanceTimersByTimeAsync(500);

    savers.of(1).edit(stamp(1, '2026-11-13'));
    await vi.advanceTimersByTimeAsync(500);

    expect(pending).toHaveLength(1);
    expect(sent).toHaveLength(1);

    await land();

    expect(pending).toHaveLength(1);
    expect(sent).toHaveLength(2);
  });

  it('says the worst of them', async () => {
    const { savers, fail, land } = rig();

    expect(savers.state()).toBe('clean');

    savers.of(1).edit(stamp(1, '2026-11-02'));

    expect(savers.state()).toBe('waiting');

    await vi.advanceTimersByTimeAsync(500);

    expect(savers.state()).toBe('saving');

    savers.of(2).edit(stamp(2, '2026-11-02'));

    expect(savers.state()).toBe('saving');

    await land();

    expect(savers.state()).toBe('waiting');

    await vi.advanceTimersByTimeAsync(500);
    await fail();

    expect(savers.state()).toBe('failed');
  });

  it('retries only what failed', async () => {
    const { savers, sent, fail } = rig();

    savers.of(1).edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail();

    savers.of(2).edit(stamp(2, '2026-11-02'));
    savers.retry();

    expect(sent.map((one) => one.roster)).toEqual([1, 1]);
  });

  it('tells anybody listening when its state moves, until they stop', async () => {
    const { savers } = rig();
    const heard = vi.fn();
    const stop = savers.listen(heard);

    savers.of(1).edit(stamp(1, '2026-11-02'));

    expect(heard).toHaveBeenCalledTimes(1);

    stop();
    savers.of(1).edit(stamp(1, '2026-11-03'));

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('says which roster was refused for naming somebody gone, and only that', async () => {
    const { savers, fail } = rig();
    const refused = vi.fn();

    savers.onRefused(refused);

    savers.of(3).edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail();

    expect(refused).not.toHaveBeenCalled();

    savers.retry();
    await fail({ status: 404 });

    expect(refused).toHaveBeenCalledWith(3);
  });

  it('sends what is left of a refused roster, and says something had to go', async () => {
    const { savers, sent, fail, land } = rig();

    savers.of(1).edit(stamp(1, '2026-11-02'));
    savers.of(1).edit(stamp(2, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail({ status: 404 });

    expect(savers.absorb(1, [2])).toBe(true);
    expect(sent[1].batch.set.map((cell) => cell.person_id)).toEqual([2]);

    await land();

    expect(savers.state()).toBe('saved');
  });

  it('holds on to the failure when nobody in the batch has gone', async () => {
    const { savers, sent, fail } = rig();

    savers.of(1).edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail({ status: 404 });

    expect(savers.absorb(1, [1, 2])).toBe(false);
    expect(sent).toHaveLength(1);
    expect(savers.state()).toBe('failed');
  });

  it('forgets a deleted roster, so its failure stops being anybody’s news', async () => {
    const { savers, sent, fail } = rig();

    savers.of(1).edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);
    await fail();

    savers.forget(1);

    expect(savers.state()).toBe('clean');

    savers.retry();

    expect(sent).toHaveLength(1);
    expect(savers.of(1).unsent()).toEqual([]);
  });

  it('forgets everything for the next account, including what was only waiting', async () => {
    const { savers, sent, land } = rig();

    savers.of(1).edit(stamp(1, '2026-11-02'));
    await vi.advanceTimersByTimeAsync(500);

    savers.of(1).edit(stamp(1, '2026-11-03'));
    savers.of(2).edit(stamp(2, '2026-11-02'));

    savers.forgetAll();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sent).toHaveLength(1);
    expect(savers.state()).toBe('clean');

    await land();

    expect(sent).toHaveLength(1);
    expect(savers.state()).toBe('clean');
  });
});
