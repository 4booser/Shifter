import { beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => ({ raw: null as string | null }));
const server = vi.hoisted(() => ({
  calls: [] as { path: string; method?: string; body?: unknown }[],
  reply: (() => undefined) as (path: string, options?: { method?: string; body?: unknown }) => unknown,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => disk.raw,
    setItem: async (_key: string, value: string) => {
      disk.raw = value;
    },
    removeItem: async () => undefined,
  },
}));

vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {
    constructor(public status: number) {
      super(`HTTP ${status}`);
    }
  },
  api: async (path: string, options?: { method?: string; body?: unknown }) => {
    server.calls.push({ path, method: options?.method, body: options?.body });

    return server.reply(path, options);
  },
}));

const { ApiError } = await import('@/lib/api');
const { putDay, useOutbox } = await import('@/store/outbox');
const { writeFinishedShift } = await import('@/lib/live-finish');
const { hearDay } = await import('@/lib/day-writes');
const { rebaseDay } = await import('@/lib/outbox');
const { adoptAnswer, adoptBoxes, createDaySaver, dayBoxes, dayDraft, putOn } = await import('@/lib/day-saver');

import type { DayTyped } from '@/lib/day-saver';
import { CalendarDayData, DaySave, DayShiftEntry, toSavePayload } from '@/lib/types';
import { LiveShift } from '@/store/live';

const DATE = '2026-11-02';
const PATH = `/shifter/v1/days/${DATE}`;

const entry = (over: Partial<DayShiftEntry> = {}): DayShiftEntry =>
  ({
    shift_id: 4,
    name: 'Вечер',
    symbol: null,
    colour: null,
    start_time: '11:00',
    end_time: '22:00',
    hours: 11,
    worked: false,
    needs_cover: false,
    actual_start: null,
    actual_end: null,
    break_minutes: 30,
    earned: 0,
    revenue: null,
    guests: null,
    zone: 'unset',
    revenue_percent: null,
    auto_closed: false,
    ...over,
  }) as DayShiftEntry;

const day = (over: Partial<CalendarDayData> = {}): CalendarDayData =>
  ({
    date: DATE,
    shifts: [entry()],
    sales: [],
    tips: null,
    tips_cash: null,
    tip_pool: null,
    deductions: 0,
    deduction_reason: null,
    note: null,
    colour: null,
    hours: 0,
    earned: 0,
    planned: 0,
    version: 3,
    ...over,
  }) as CalendarDayData;

const saved = (over: Partial<DaySave> = {}): DaySave =>
  ({
    shifts: [
      {
        shift_id: 4,
        worked: false,
        needs_cover: false,
        actual_start: null,
        actual_end: null,
        break_minutes: 30,
        revenue: null,
        guests: null,
        zone: 'unset',
        auto_closed: false,
      },
    ],
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

const held = (over: Partial<Parameters<ReturnType<typeof useOutbox.getState>['hold']>[0][number]> = {}) => ({
  method: 'PUT' as const,
  path: PATH,
  body: saved({ tips: 1500 }),
  base: saved(),
  days: [DATE],
  label: 'Пн',
  ...over,
});

const puts = () => server.calls.filter((call) => call.method === 'PUT');

/** A server that keeps one day and refuses a version that has gone, the way DayHandler does. */
const keeping = (start: CalendarDayData) => {
  let stored = start;

  server.reply = (path, options) => {
    if (options?.method !== 'PUT') return { days: [stored] };

    const body = options.body as DaySave;

    if (body.version !== stored.version) throw new ApiError(409, 'stale');

    stored = { ...stored, ...body, version: (stored.version ?? 0) + 1 } as CalendarDayData;

    return stored;
  };

  return { now: () => stored };
};

beforeEach(() => {
  server.calls.length = 0;
  server.reply = () => undefined;
  disk.raw = null;
  useOutbox.setState({ pending: [], refused: 0 });
});

describe('a held day refused for its version', () => {
  it('goes again over the day as it stands, rather than being dropped', async () => {
    let refusedOnce = false;

    server.reply = (path, options) => {
      if (options?.method === 'PUT') {
        if (!refusedOnce) {
          refusedOnce = true;
          throw new ApiError(409, 'stale');
        }

        return undefined;
      }

      return { days: [day({ note: 'с ноута', version: 4 })] };
    };

    await useOutbox.getState().hold([held()]);

    expect(await useOutbox.getState().flush()).toBe(1);

    const written = puts()[1].body as DaySave;

    expect(written).toMatchObject({ tips: 1500, note: 'с ноута', version: 4 });
    expect(useOutbox.getState().pending).toEqual([]);
    expect(useOutbox.getState().refused).toBe(0);
  });

  it('owns up when both sides changed the same amount', async () => {
    server.reply = (path, options) => {
      if (options?.method === 'PUT') throw new ApiError(409, 'stale');

      return { days: [day({ tips: 1200, version: 4 })] };
    };

    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().flush();

    expect(useOutbox.getState().pending).toEqual([]);
    expect(useOutbox.getState().refused).toBe(1);
  });

  it('does not take a fine of nothing, written two ways, for somebody else’s change', async () => {
    // The boxes say null where the server says 0, so the fine looked fought over.
    const kept = keeping(day({ note: 'с ноута', version: 4 }));

    await useOutbox.getState().hold([
      held({ body: saved({ deductions: 100 }), base: saved({ deductions: null }) }),
    ]);
    await useOutbox.getState().flush();

    expect(kept.now()).toMatchObject({ deductions: 100, note: 'с ноута', version: 5 });
    expect(useOutbox.getState().pending).toEqual([]);
    expect(useOutbox.getState().refused).toBe(0);
  });

  it('does not take the server’s order of the sales for a change', async () => {
    const sold = [
      { sales_id: 1, quantity: 2 },
      { sales_id: 2, quantity: 1 },
    ];
    const kept = keeping(day({ sales: [sold[1], sold[0]], note: 'с ноута', version: 4 }));

    await useOutbox.getState().hold([
      held({
        body: saved({ sales: [{ sales_id: 1, quantity: 3 }, sold[1]] }),
        base: saved({ sales: sold }),
      }),
    ]);
    await useOutbox.getState().flush();

    expect(kept.now().sales).toEqual([{ sales_id: 1, quantity: 3 }, sold[1]]);
    expect(kept.now().note).toBe('с ноута');
    expect(useOutbox.getState().refused).toBe(0);
  });

  it('loses only what was really fought over', async () => {
    const kept = keeping(day({ tips: 1400, version: 4 }));
    const told: (number | null)[] = [];
    const stop = hearDay(DATE, (answer) => told.push(answer.tips));

    await useOutbox.getState().hold([
      held({
        body: saved({
          tips: 1500,
          note: 'пересменка',
          shifts: [{ ...saved().shifts[0], revenue: 5400 }],
        }),
      }),
    ]);
    await useOutbox.getState().flush();
    stop();

    expect(kept.now()).toMatchObject({ tips: 1400, note: 'пересменка', version: 5 });
    expect(kept.now().shifts[0].revenue).toBe(5400);
    expect(told).toEqual([1400]);
    expect(useOutbox.getState().pending).toEqual([]);
    expect(useOutbox.getState().refused).toBe(1);
  });

  it('moves no version where the fight was all there was', async () => {
    const kept = keeping(day({ tips: 1400, version: 4 }));

    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().flush();

    expect(puts()).toHaveLength(1);
    expect(kept.now().version).toBe(4);
    expect(useOutbox.getState().refused).toBe(1);
  });

  it('finds no quarrel in a day that did not change, however the two sides spell it', async () => {
    // base is written by the boxes and now by the read, so everything the two
    // spell differently came back as a fight over nothing.
    const server_ = day({
      sales: [
        { sales_id: 7, quantity: 1 },
        { sales_id: 2, quantity: 4 },
      ],
      tips: 1000,
      tips_cash: 300,
      tip_pool: 0,
      deductions: 0,
      note: 'с ноута',
      colour: '#FF5C7A',
      version: 4,
    });
    const base = dayDraft(server_, dayBoxes(server_));

    expect(rebaseDay(base, base, toSavePayload(server_))).toEqual({ day: null, contested: false });
  });

  it('stays held if the day moves again in that moment', async () => {
    server.reply = (path, options) => {
      if (options?.method === 'PUT') throw new ApiError(409, 'stale');

      return { days: [day({ version: 4 })] };
    };

    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().flush();

    expect(useOutbox.getState().pending).toHaveLength(1);
    expect(useOutbox.getState().refused).toBe(0);
  });

  it('is still refused where nothing says what it changed', async () => {
    server.reply = () => {
      throw new ApiError(409, 'stale');
    };

    await useOutbox.getState().hold([held({ base: undefined })]);
    await useOutbox.getState().flush();

    expect(useOutbox.getState().pending).toEqual([]);
    expect(useOutbox.getState().refused).toBe(1);
  });
});

describe('a write the server fell over on', () => {
  it('stays held rather than being dropped', async () => {
    server.reply = () => {
      throw new ApiError(503, 'down');
    };

    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().flush();

    expect(useOutbox.getState().pending).toHaveLength(1);
    expect(useOutbox.getState().refused).toBe(0);
  });
});

describe('the newest draft of one screen', () => {
  it('takes the place of the one before', async () => {
    await useOutbox.getState().hold([held({ slot: 'день', body: saved({ tips: 15 }) })]);
    await useOutbox.getState().hold([held({ slot: 'день', body: saved({ tips: 1500 }) })]);

    expect(useOutbox.getState().pending).toHaveLength(1);
    expect((useOutbox.getState().pending[0].body as DaySave).tips).toBe(1500);
  });

  it('leaves everyone else’s writes where they are', async () => {
    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().hold([held({ slot: 'день' })]);

    expect(useOutbox.getState().pending).toHaveLength(2);
  });

  it('comes back out once a later save has landed', async () => {
    await useOutbox.getState().hold([held({ slot: 'день' }), held()]);
    await useOutbox.getState().release('день');

    expect(useOutbox.getState().pending).toHaveLength(1);
    expect(useOutbox.getState().pending[0].slot).toBeUndefined();
    expect(JSON.parse(disk.raw as string)).toHaveLength(1);
  });
});

describe('sending the queue', () => {
  it('waits for a run already going rather than saying nothing was sent', async () => {
    let open = () => undefined as void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });

    server.reply = () => gate;

    await useOutbox.getState().hold([held()]);

    const first = useOutbox.getState().flush();
    const second = useOutbox.getState().flush();

    open();

    expect(await Promise.all([first, second])).toEqual([1, 1]);
    expect(puts()).toHaveLength(1);
  });

  it('does not lose a write held during a run', async () => {
    let open = () => undefined as void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });

    server.reply = () => gate;

    await useOutbox.getState().hold([held()]);

    const running = useOutbox.getState().flush();

    await useOutbox.getState().hold([held({ path: '/shifter/v1/days/2026-11-03', days: ['2026-11-03'] })]);

    open();
    await running;

    expect(useOutbox.getState().pending.map((entry) => entry.days[0])).toEqual(['2026-11-03']);
  });

  it('does not read the disk back over what memory has since held', async () => {
    await useOutbox.getState().hydrate();

    disk.raw = null;
    await useOutbox.getState().hold([held()]);
    disk.raw = '[]';
    await useOutbox.getState().hydrate();

    expect(useOutbox.getState().pending).toHaveLength(1);
  });
});

describe('getting a day settled before reading it', () => {
  it('sends what is held for that date', async () => {
    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().settle(DATE);

    expect(puts()).toHaveLength(1);
    expect(useOutbox.getState().pending).toEqual([]);
  });

  it('leaves the queue alone with nothing held for it', async () => {
    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().settle('2026-11-03');

    expect(puts()).toEqual([]);
  });

  it('puts held tips in before a closing clock reads the day', async () => {
    // The tick used to read V and write V+1, so the held PUT at V met a 409
    // and went for good.
    const live: LiveShift = {
      date: DATE,
      shiftId: 4,
      name: 'Вечер',
      symbol: null,
      startedAt: new Date(`${DATE}T11:00:00`).toISOString(),
      hourlyRate: null,
      plannedStart: '11:00',
      plannedEnd: '22:00',
      autoClock: true,
    };
    let stored = day();

    server.reply = (path, options) => {
      if (options?.method === 'PUT') {
        const body = options.body as DaySave;

        if (body.version !== stored.version) throw new ApiError(409, 'stale');

        stored = {
          ...stored,
          ...body,
          shifts: stored.shifts.map((row, at) => ({ ...row, ...body.shifts[at] })),
          version: (stored.version ?? 0) + 1,
        } as CalendarDayData;

        return stored;
      }

      return { days: [stored] };
    };

    await useOutbox.getState().hold([held()]);
    await writeFinishedShift({ live, endAt: new Date(`${DATE}T22:00:00`).toISOString() });

    expect(stored).toMatchObject({ tips: 1500, version: 5 });
    expect(stored.shifts[0].worked).toBe(true);
    expect(useOutbox.getState().pending).toEqual([]);
  });
});

describe('a held day landing under an open screen', () => {
  it('tells the screen what came back', async () => {
    keeping(day());

    const told: (number | undefined)[] = [];
    const stop = hearDay(DATE, (answer) => told.push(answer.version));

    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().flush();
    stop();

    expect(told).toEqual([4]);
  });

  it('tells it too when the write had to go again over a moved day', async () => {
    const server_ = keeping(day({ note: 'с ноута', version: 4 }));
    const told: (number | undefined)[] = [];
    const stop = hearDay(DATE, (answer) => told.push(answer.version));

    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().flush();
    stop();

    expect(told).toEqual([5]);
    expect(server_.now()).toMatchObject({ tips: 1500, note: 'с ноута', version: 5 });
  });

  it('says nothing about a write that is not a day', async () => {
    server.reply = () => ({ id: 9 });

    const told: unknown[] = [];
    const stop = hearDay(DATE, (answer) => told.push(answer));

    await useOutbox.getState().hold([held({ base: undefined, method: 'POST' })]);
    await useOutbox.getState().flush();
    stop();

    expect(told).toEqual([]);
  });

  it('does not read to the screen as an edit from another device', async () => {
    // The tips went in the queue at version 3, the clock's write put them in
    // and moved the day on, and the screen still holding 3 raised a conflict
    // about what its own phone had just done.
    const kept = keeping(day());
    const conflicts: DaySave[] = [];
    let shown = saved({ tips: 1500 });
    const saver = createDaySaver({
      send: (payload) => putDay(DATE, payload),
      adopt: (answer) => {
        shown = { ...shown, version: answer.version };

        return shown;
      },
      onState: () => undefined,
      onConflict: (payload) => conflicts.push(payload),
      onFailed: () => undefined,
      quiet: 1_000_000,
    });
    const stop = hearDay(DATE, (answer) => saver.overhear(answer, true));

    saver.edit(saved());
    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().settle(DATE);

    shown = saved({ tips: 1600, version: 4 });
    saver.edit(shown);
    await saver.flush();
    stop();

    expect(conflicts).toEqual([]);
    expect(kept.now()).toMatchObject({ tips: 1600, version: 5 });
  });
});

/** The day screen's saver with nothing native around it: a day, the boxes beside it, and the same wiring. */
const opened = (loaded: CalendarDayData) => {
  const conflicts: DaySave[] = [];
  let shown = loaded;
  let typed: DayTyped = dayBoxes(loaded);
  const saver = createDaySaver({
    send: (payload) => putDay(DATE, payload),
    adopt: (answer, known, own) => {
      shown = adoptAnswer(shown, known, answer);
      typed = own ? typed : adoptBoxes(typed, known, answer);

      return dayDraft(shown, typed);
    },
    onState: () => undefined,
    onConflict: (payload) => conflicts.push(payload),
    onFailed: () => undefined,
    quiet: 1_000_000,
  });

  saver.edit(dayDraft(shown, typed));

  return {
    saver,
    conflicts,
    boxes: () => typed,
    rows: () => shown.shifts.map((row) => row.shift_id),
    type: (boxes: Partial<DayTyped>) => {
      typed = { ...typed, ...boxes };
      saver.edit(dayDraft(shown, typed));
    },
    place: (row: DayShiftEntry) => {
      shown = { ...shown, shifts: [...shown.shifts, putOn(row)] };
      saver.edit(dayDraft(shown, typed));
    },
    fill: (shiftId: number, fields: Partial<DayShiftEntry>) => {
      shown = {
        ...shown,
        shifts: shown.shifts.map((row) => (row.shift_id === shiftId ? { ...row, ...fields } : row)),
      };
      saver.edit(dayDraft(shown, typed));
    },
    row: (shiftId: number) => shown.shifts.find((row) => row.shift_id === shiftId),
    stop: hearDay(DATE, (answer) => saver.overhear(answer, true)),
  };
};

/** The same server down a line that drops the first PUT and lets the read through. */
const patchy = (start: CalendarDayData) => {
  const kept = keeping(start);
  const answer = server.reply;
  let dropped = false;

  server.reply = (path, options) => {
    if (options?.method === 'PUT' && !dropped) {
      dropped = true;
      throw new TypeError('Network request failed');
    }

    return answer(path, options);
  };

  return kept;
};

describe('a held day landing under the boxes of an open screen', () => {
  it('is not wiped by the next save from a box that opened empty', async () => {
    // The settle PUT failed and the read got through, so the box opened empty
    // over tips still held. A note then went out, the tips landed ahead of it,
    // and the empty box took them back off with no conflict shown.
    const kept = patchy(day());

    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().settle(DATE);

    const screen = opened(kept.now());

    screen.type({ note: 'пересменка' });
    await screen.saver.flush();
    screen.stop();

    expect(puts().map((call) => (call.body as DaySave).tips)).toEqual([1500, 1500, null, 1500]);
    expect(kept.now()).toMatchObject({ tips: 1500, note: 'пересменка', version: 5 });
    expect(screen.boxes().tips).toBe('1500');
    expect(screen.conflicts).toEqual([]);
    expect(useOutbox.getState().pending).toEqual([]);
    expect(useOutbox.getState().refused).toBe(0);
  });

  it('reaches the box while nothing is being saved, and stays there', async () => {
    const kept = patchy(day());

    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().settle(DATE);

    const screen = opened(kept.now());

    await useOutbox.getState().flush();

    expect(screen.boxes().tips).toBe('1500');
    expect(screen.saver.clean()).toBe(true);

    screen.type({ note: 'пересменка' });
    await screen.saver.flush();
    screen.stop();

    expect(kept.now()).toMatchObject({ tips: 1500, note: 'пересменка', version: 5 });
  });

  it('leaves a box somebody has typed in to them', async () => {
    const kept = patchy(day());

    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().settle(DATE);

    const screen = opened(kept.now());

    screen.type({ tips: '2000' });
    await screen.saver.flush();
    screen.stop();

    expect(screen.boxes().tips).toBe('2000');
    expect(kept.now()).toMatchObject({ tips: 2000, version: 5 });
    expect(screen.conflicts).toEqual([]);
  });
});

describe('a write this screen did not make, changing the rows on the day', () => {
  const sequence = () =>
    puts().map((call) => {
      const body = call.body as DaySave;

      return { version: body.version, rows: body.shifts.length, tips: body.tips };
    });

  it('keeps a shift put on offline, rather than sending the day back without it', async () => {
    // Only the tips used to survive this: the shift went with no message, on
    // a save that met no conflict at all.
    const kept = patchy(day({ shifts: [] }));

    await useOutbox.getState().hold([held({ base: saved({ shifts: [] }) })]);
    await useOutbox.getState().settle(DATE);

    const screen = opened(kept.now());

    screen.type({ note: 'пересменка' });
    await screen.saver.flush();
    screen.stop();

    expect(sequence()).toEqual([
      { version: 3, rows: 1, tips: 1500 },
      { version: 3, rows: 1, tips: 1500 },
      { version: 3, rows: 0, tips: null },
      { version: 4, rows: 1, tips: 1500 },
    ]);
    expect(kept.now().shifts).toHaveLength(1);
    expect(kept.now()).toMatchObject({ tips: 1500, note: 'пересменка', version: 5 });
    expect(screen.rows()).toEqual([4]);
    expect(screen.conflicts).toEqual([]);
    expect(useOutbox.getState().refused).toBe(0);
  });

  it('does not put back a shift taken off offline', async () => {
    const kept = patchy(day());

    await useOutbox.getState().hold([held({ body: saved({ shifts: [] }) })]);
    await useOutbox.getState().settle(DATE);

    const screen = opened(kept.now());

    screen.type({ note: 'пересменка' });
    await screen.saver.flush();
    screen.stop();

    expect(sequence()).toEqual([
      { version: 3, rows: 0, tips: null },
      { version: 3, rows: 0, tips: null },
      { version: 3, rows: 1, tips: null },
      { version: 4, rows: 0, tips: null },
    ]);
    expect(kept.now().shifts).toEqual([]);
    expect(kept.now()).toMatchObject({ note: 'пересменка', version: 5 });
    expect(screen.rows()).toEqual([]);
    expect(screen.conflicts).toEqual([]);
  });

  it('shows the row with nothing typed, and has nothing to send about it', async () => {
    const kept = patchy(day({ shifts: [] }));

    await useOutbox.getState().hold([held({ base: saved({ shifts: [] }) })]);
    await useOutbox.getState().settle(DATE);

    const screen = opened(kept.now());

    await useOutbox.getState().flush();
    screen.stop();

    expect(screen.rows()).toEqual([4]);
    expect(screen.saver.clean()).toBe(true);
  });

  it('keeps a row added on this screen and not yet saved', async () => {
    const kept = patchy(day());

    await useOutbox.getState().hold([held()]);
    await useOutbox.getState().settle(DATE);

    const screen = opened(kept.now());

    screen.place(entry({ shift_id: 7 }));
    await screen.saver.flush();
    screen.stop();

    expect(sequence()).toEqual([
      { version: 3, rows: 1, tips: 1500 },
      { version: 3, rows: 1, tips: 1500 },
      { version: 3, rows: 2, tips: null },
      { version: 4, rows: 2, tips: 1500 },
    ]);
    expect(screen.rows()).toEqual([4, 7]);
    expect(kept.now().shifts.map((row) => row.shift_id)).toEqual([4, 7]);
  });

  describe('with the same shift put back on over a held copy of it', () => {
    const takings = () =>
      puts().map((call) => {
        const body = call.body as DaySave;

        return { version: body.version, revenue: body.shifts[0]?.revenue, tips: body.tips };
      });

    /** A shift held on an empty day, which the reopened screen cannot show because the server has not got it yet. */
    const putBack = async (body = saved({ tips: 1500 })) => {
      const kept = patchy(day({ shifts: [] }));

      await useOutbox.getState().hold([held({ base: saved({ shifts: [] }), body })]);
      await useOutbox.getState().settle(DATE);

      const screen = opened(kept.now());

      screen.place(entry());

      return { kept, screen };
    };

    it('keeps the takings typed on it', async () => {
      const { kept, screen } = await putBack();

      screen.fill(4, { revenue: 7300 });
      await screen.saver.flush();
      screen.stop();

      expect(takings()).toEqual([
        { version: 3, revenue: null, tips: 1500 },
        { version: 3, revenue: null, tips: 1500 },
        { version: 3, revenue: 7300, tips: null },
        { version: 4, revenue: 7300, tips: 1500 },
      ]);
      expect(kept.now()).toMatchObject({ tips: 1500, version: 5 });
      expect(kept.now().shifts[0].revenue).toBe(7300);
      expect(screen.conflicts).toEqual([]);
      expect(useOutbox.getState().refused).toBe(0);
    });

    it('keeps anything else typed on it, a zone and a flip included', async () => {
      const { kept, screen } = await putBack();

      screen.fill(4, { guests: 40, zone: 'hall', worked: true });
      await screen.saver.flush();
      screen.stop();

      expect(kept.now().shifts[0]).toMatchObject({ guests: 40, zone: 'hall', worked: true });
      expect(screen.conflicts).toEqual([]);
    });

    it('takes what the held copy said about a field nobody typed in here', async () => {
      const finish = saved({ tips: 1500 });

      finish.shifts[0] = { ...finish.shifts[0], worked: true, actual_start: '11:00', actual_end: '20:00', revenue: 500 };

      const { kept, screen } = await putBack(finish);

      screen.fill(4, { guests: 40 });
      await screen.saver.flush();
      screen.stop();

      expect(kept.now().shifts[0]).toMatchObject({
        worked: true,
        actual_start: '11:00',
        actual_end: '20:00',
        revenue: 500,
        guests: 40,
      });
    });

    it('changes nothing on the server when nothing was typed on it', async () => {
      const { kept, screen } = await putBack();

      await screen.saver.flush();
      screen.stop();

      expect(kept.now().shifts[0].revenue).toBeNull();
      expect(kept.now()).toMatchObject({ tips: 1500 });
      expect(screen.row(4)?.revenue).toBeNull();
      expect(screen.conflicts).toEqual([]);
    });
  });

  it('keeps the row a finish by hand had to put on', async () => {
    const kept = keeping(day({ shifts: [] }));
    const screen = opened(kept.now());

    await writeFinishedShift({
      live: {
        date: DATE,
        shiftId: 4,
        name: 'Вечер',
        symbol: null,
        startedAt: new Date(`${DATE}T11:00:00`).toISOString(),
        hourlyRate: null,
        plannedStart: '11:00',
        plannedEnd: '22:00',
      },
      endAt: new Date(`${DATE}T22:00:00`).toISOString(),
    });

    screen.type({ note: 'пересменка' });
    await screen.saver.flush();
    screen.stop();

    expect(screen.rows()).toEqual([4]);
    expect(kept.now().shifts[0]).toMatchObject({ worked: true, actual_end: '22:00' });
    expect(kept.now()).toMatchObject({ note: 'пересменка', version: 5 });
    expect(screen.conflicts).toEqual([]);
  });
});

describe('a screen saving a day', () => {
  it('goes behind what is held for it, not alongside', async () => {
    let open = () => undefined as void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const order: string[] = [];

    server.reply = async (path, options) => {
      if ((options?.body as DaySave).tips === 1500) {
        await gate;
        order.push('held');
      } else {
        order.push('screen');
      }

      return undefined;
    };

    await useOutbox.getState().hold([held()]);

    const running = useOutbox.getState().flush();
    const saving = putDay(DATE, saved({ tips: 1600 }));

    open();
    await Promise.all([running, saving]);

    expect(order).toEqual(['held', 'screen']);
  });

  it('still goes when what is held for it cannot', async () => {
    server.reply = (path, options) => {
      if ((options?.body as DaySave).tips === 1500) throw new ApiError(503, 'down');

      return undefined;
    };

    await useOutbox.getState().hold([held()]);
    await putDay(DATE, saved({ tips: 1600 }));

    expect(puts().map((call) => (call.body as DaySave).tips)).toEqual([1500, 1600]);
    expect(useOutbox.getState().pending).toHaveLength(1);
  });
});
