import { describe, expect, it, vi } from 'vitest';

import { drain, heldDays, Pending, SendResult, stamp } from '@/lib/outbox';

const write = (id: string, days: string[] = ['2026-08-01']): Pending => ({
  id,
  at: 1,
  method: 'PUT',
  path: `/shifter/v1/days/${days[0]}`,
  body: { shifts: [] },
  days,
  label: 'Вечер · 1 день',
});

/**
 * The queue is the only place in the app where the order of two writes is load
 * bearing. Everything else can be re-read from the server; a day that took the
 * wrong one of two edits cannot.
 */
describe('emptying the queue', () => {
  it('sends everything when the network is there', async () => {
    const seen: string[] = [];
    const send = async (entry: Pending): Promise<SendResult> => {
      seen.push(entry.id);

      return 'sent';
    };

    const result = await drain([write('a'), write('b'), write('c')], send);

    expect(result).toEqual({ sent: 3, refused: 0, left: [] });
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('stops at the first request that never left, and keeps the rest in order', async () => {
    const send = async (entry: Pending): Promise<SendResult> =>
      entry.id === 'b' ? 'offline' : 'sent';

    const result = await drain([write('a'), write('b'), write('c')], send);

    expect(result.sent).toBe(1);
    expect(result.left.map((entry) => entry.id)).toEqual(['b', 'c']);
  });

  it('does not skip past a held write to reach a later one', async () => {
    // The bug this rules out: 'b' and 'c' edit the same day. Sending 'c' while
    // 'b' waits leaves the day holding 'b' once the network returns.
    const seen: string[] = [];
    const send = async (entry: Pending): Promise<SendResult> => {
      seen.push(entry.id);

      return entry.id === 'b' ? 'offline' : 'sent';
    };

    await drain([write('a'), write('b', ['2026-08-05']), write('c', ['2026-08-05'])], send);

    expect(seen).toEqual(['a', 'b']);
  });

  it('drops what the server refuses rather than retrying it forever', async () => {
    const send = async (entry: Pending): Promise<SendResult> =>
      entry.id === 'b' ? 'refused' : 'sent';

    const result = await drain([write('a'), write('b'), write('c')], send);

    expect(result).toEqual({ sent: 2, refused: 1, left: [] });
  });

  it('writes the remainder down after every step, so a killed app resumes', async () => {
    const kept: string[][] = [];
    const send = async (entry: Pending): Promise<SendResult> =>
      entry.id === 'c' ? 'offline' : 'sent';

    await drain([write('a'), write('b'), write('c')], send, async (left) => {
      kept.push(left.map((entry) => entry.id));
    });

    expect(kept).toEqual([['b', 'c'], ['c']]);
  });

  it('has nothing to do with an empty queue', async () => {
    const send = vi.fn();

    expect(await drain([], send as never)).toEqual({ sent: 0, refused: 0, left: [] });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('which days are waiting', () => {
  it('collects them from every held write, without repeats', () => {
    const held = heldDays([
      write('a', ['2026-08-01', '2026-08-02']),
      write('b', ['2026-08-02', '2026-08-03']),
    ]);

    expect([...held].sort()).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
  });

  it('is empty when nothing is held', () => {
    expect(heldDays([]).size).toBe(0);
  });
});

describe('stamping held writes', () => {
  it('gives every entry of one stroke its own id', () => {
    const stamped = stamp(
      [1, 2, 3].map(() => {
        const { id: _id, at: _at, ...rest } = write('x');

        return rest;
      }),
      1000,
    );

    expect(new Set(stamped.map((entry) => entry.id)).size).toBe(3);
    expect(stamped.every((entry) => entry.at === 1000)).toBe(true);
  });
});
