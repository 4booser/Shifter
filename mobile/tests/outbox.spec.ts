import { describe, expect, it, vi } from 'vitest';

import { drain, failureOf, heldDays, Pending, rebaseDay, SendResult, stamp } from '@/lib/outbox';
import { DaySave } from '@/lib/types';

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

describe('what a failed attempt means', () => {
  it('keeps what never reached the server', () => {
    expect(failureOf(new Error('Network request failed'))).toBe('offline');
  });

  it('keeps what the server fell over on, which it may take later', () => {
    expect(failureOf({ status: 503 })).toBe('offline');
  });

  it('gives up on what the server said no to', () => {
    expect(failureOf({ status: 400 })).toBe('refused');
  });
});

describe('a held day whose version has gone', () => {
  const shift = (over: Partial<DaySave['shifts'][number]> = {}): DaySave['shifts'][number] => ({
    shift_id: 4,
    worked: false,
    needs_cover: false,
    actual_start: null,
    actual_end: null,
    break_minutes: 30,
    revenue: null,
    auto_closed: false,
    ...over,
  });
  const saved = (over: Partial<DaySave> = {}): DaySave =>
    ({
      shifts: [shift()],
      sales: [],
      tips: null,
      tips_cash: null,
      tip_pool: null,
      deductions: 0,
      deduction_reason: null,
      note: null,
      colour: null,
      version: 3,
      ...over,
    }) as DaySave;

  it('takes what was typed onto the day as it stands, at its version', () => {
    const { day } = rebaseDay(saved({ tips: 1500 }), saved(), saved({ note: 'с ноута', version: 4 }));

    expect(day).toMatchObject({ tips: 1500, note: 'с ноута', version: 4 });
  });

  it('leaves a clock’s close standing under held tips', () => {
    const closed = shift({ worked: true, actual_start: '11:00', actual_end: '22:00', auto_closed: true });
    const { day } = rebaseDay(saved({ tips: 1500 }), saved(), saved({ shifts: [closed], version: 4 }));

    expect(day?.shifts[0]).toEqual(closed);
    expect(day?.tips).toBe(1500);
  });

  it('carries the edit made on a shift, field by field', () => {
    const { day } = rebaseDay(
      saved({ shifts: [shift({ revenue: 5400 })] }),
      saved(),
      saved({ shifts: [shift({ worked: true })], version: 4 }),
    );

    expect(day?.shifts[0]).toMatchObject({ worked: true, revenue: 5400 });
  });

  it('does not choose between two different amounts', () => {
    // Nothing else was held, so there is nothing to write, and the person is
    // told rather than either amount being picked for them.
    expect(rebaseDay(saved({ tips: 1500 }), saved(), saved({ tips: 1200, version: 4 }))).toEqual({
      day: null,
      contested: true,
    });
    expect(
      rebaseDay(
        saved({ shifts: [shift({ revenue: 5400 })] }),
        saved(),
        saved({ shifts: [shift({ revenue: 6000 })], version: 4 }),
      ),
    ).toEqual({ day: null, contested: true });
  });

  it('keeps everything nobody fought over when one amount was', () => {
    // A whole write used to go for one contested field: the note and the
    // takings disagreed with nothing, and they went too.
    const { day, contested } = rebaseDay(
      saved({ tips: 1500, note: 'пересменка', shifts: [shift({ revenue: 5400 })] }),
      saved(),
      saved({ tips: 1400, version: 4 }),
    );

    expect(contested).toBe(true);
    expect(day).toMatchObject({ tips: 1400, note: 'пересменка', version: 4 });
    expect(day?.shifts[0].revenue).toBe(5400);
  });

  it('keeps the amount as it stands where only one field of a shift was fought over', () => {
    const { day, contested } = rebaseDay(
      saved({ shifts: [shift({ revenue: 5400, guests: 40 })] }),
      saved({ shifts: [shift({ guests: 0 })] }),
      saved({ shifts: [shift({ revenue: 6000, guests: 0 })], version: 4 }),
    );

    expect(contested).toBe(true);
    expect(day?.shifts[0]).toMatchObject({ revenue: 6000, guests: 40 });
  });

  it('has nothing to write where both said the same thing', () => {
    expect(rebaseDay(saved({ tips: 1500 }), saved(), saved({ tips: 1500, version: 4 }))).toEqual({
      day: null,
      contested: false,
    });
  });

  it('does not read a fine of nothing, written two ways, as a change', () => {
    // The boxes write null where the server writes 0, and base comes from one
    // while now comes from the other.
    const { day, contested } = rebaseDay(
      saved({ deductions: 100 }),
      saved({ deductions: null }),
      saved({ deductions: 0, note: 'с ноута', version: 4 }),
    );

    expect(contested).toBe(false);
    expect(day).toMatchObject({ deductions: 100, note: 'с ноута' });
  });

  it('does not read the order of the sales as a change', () => {
    const one = { sales_id: 1, quantity: 2 };
    const two = { sales_id: 2, quantity: 1 };
    const { day, contested } = rebaseDay(
      saved({ sales: [{ ...one, quantity: 3 }, two] }),
      saved({ sales: [one, two] }),
      saved({ sales: [two, one], version: 4 }),
    );

    expect(contested).toBe(false);
    expect(day?.sales).toEqual([{ ...one, quantity: 3 }, two]);
  });

  it('merges sales position by position', () => {
    const { day, contested } = rebaseDay(
      saved({ sales: [{ sales_id: 1, quantity: 3 }] }),
      saved({ sales: [{ sales_id: 1, quantity: 2 }, { sales_id: 3, quantity: 1 }] }),
      saved({
        sales: [
          { sales_id: 1, quantity: 2 },
          { sales_id: 2, quantity: 5 },
          { sales_id: 3, quantity: 1 },
        ],
        version: 4,
      }),
    );

    expect(contested).toBe(false);
    expect(day?.sales).toEqual([
      { sales_id: 1, quantity: 3 },
      { sales_id: 2, quantity: 5 },
    ]);
  });

  it('calls two different counts of one position a fight', () => {
    expect(
      rebaseDay(
        saved({ sales: [{ sales_id: 1, quantity: 3 }] }),
        saved({ sales: [{ sales_id: 1, quantity: 2 }] }),
        saved({ sales: [{ sales_id: 1, quantity: 5 }], version: 4 }),
      ),
    ).toEqual({ day: null, contested: true });
  });

  it('does not fight over a cash half this phone has no box for', () => {
    // Lowering the total clamps the half, so it reads as an edit of ours, and
    // the laptop having moved it is no quarrel with anything typed here.
    const { day, contested } = rebaseDay(
      saved({ tips: 300, tips_cash: 300 }),
      saved({ tips: 1500, tips_cash: 400 }),
      saved({ tips: 1500, tips_cash: 500, version: 4 }),
    );

    expect(contested).toBe(false);
    expect(day).toMatchObject({ tips: 300, tips_cash: 300 });
  });

  it('keeps a shift taken off or put on while it waited', () => {
    const added = shift({ shift_id: 9 });

    expect(rebaseDay(saved({ shifts: [] }), saved(), saved({ version: 4 })).day?.shifts).toEqual([]);
    expect(
      rebaseDay(saved({ shifts: [shift(), added] }), saved(), saved({ version: 4 })).day?.shifts,
    ).toEqual([shift(), added]);
  });

  it('does not bring back a shift the other side took off', () => {
    expect(
      rebaseDay(saved({ tips: 1500 }), saved(), saved({ shifts: [], version: 4 })).day?.shifts,
    ).toEqual([]);
  });

  it('clamps a cash half the lowered total never saw', () => {
    const { day } = rebaseDay(saved({ tips: 300 }), saved({ tips: 1500 }), saved({ tips: 1500, tips_cash: 400 }));

    expect(day?.tips_cash).toBe(300);
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
