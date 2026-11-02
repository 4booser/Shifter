import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from '@/lib/api/http';
import { calendarApi } from '@/lib/api/calendar';
import { CalendarDayData, DaySave, EMPTY_SUMMARY, ShiftTemplate, toSavePayload } from '@/lib/calendar/models';
import { applyToDates, catalogueActions, daySettled, flushOffline, loadClockDays, loadGrid, saveDay, useCalendar } from '@/lib/store/calendar';
import { offlineQueue } from '@/lib/store/offline';

vi.mock('@/lib/api/calendar', () => ({
  calendarApi: {
    saveDay: vi.fn(),
    days: vi.fn(),
    payouts: vi.fn(),
    bulk: vi.fn(),
  },
}));

vi.mock('@/lib/store/offline', () => ({
  offlineQueue: {
    all: vi.fn(),
    put: vi.fn(),
    remove: vi.fn(),
  },
}));

const api = vi.mocked(calendarApi);
const queue = vi.mocked(offlineQueue);

const DATE = '2026-11-02';

const save = (over: Partial<DaySave> = {}): DaySave => ({
  shifts: [],
  sales: [],
  tips: null,
  tips_cash: null,
  tip_pool: null,
  deductions: null,
  note: null,
  colour: null,
  version: 4,
  ...over,
});

const answer = (version: number | undefined, tips: number | null = null) =>
  ({ date: DATE, version, tips, shifts: [], sales: [] }) as unknown as CalendarDayData;

/** A PUT held open, answered when the test says. */
function held() {
  let resolve!: (day: CalendarDayData) => void;
  let reject!: (error: unknown) => void;

  const promise = new Promise<CalendarDayData>((yes, no) => {
    resolve = yes;
    reject = no;
  });

  return { promise, resolve, reject };
}

const flush = async () => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('location', { origin: 'http://localhost' });

  api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [] });
  api.payouts.mockResolvedValue([]);
  queue.all.mockResolvedValue([]);
  queue.put.mockResolvedValue(true);
  queue.remove.mockResolvedValue();

  useCalendar.setState({
    days: new Map(),
    dayStatus: new Map(),
    saving: false,
    error: null,
    conflict: null,
    pendingOffline: 0,
    undoStack: [],
    redoStack: [],
    undoVisible: false,
  });
});

describe('saveDay', () => {
  it('sends one save and lands the answer', async () => {
    api.saveDay.mockResolvedValue(answer(5, 100));

    await saveDay(DATE, save({ tips: 100 }));

    expect(api.saveDay).toHaveBeenCalledTimes(1);
    expect(useCalendar.getState().days.get(DATE)?.tips).toBe(100);
    expect(useCalendar.getState().saving).toBe(false);
  });

  it('runs two quick saves one after the other, the second on the first’s version', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise).mockResolvedValueOnce(answer(6, 200));

    void saveDay(DATE, save({ tips: 100 }));
    void saveDay(DATE, save({ tips: 200 }));
    await flush();

    // The second must not go out beside the first, on the same old version.
    expect(api.saveDay).toHaveBeenCalledTimes(1);

    first.resolve(answer(5, 100));
    await daySettled(DATE);

    expect(api.saveDay).toHaveBeenCalledTimes(2);
    expect(api.saveDay.mock.calls[0][1]).toMatchObject({ tips: 100, version: 4 });
    expect(api.saveDay.mock.calls[1][1]).toMatchObject({ tips: 200, version: 5 });
    expect(useCalendar.getState().days.get(DATE)?.tips).toBe(200);
  });

  it('coalesces three quick saves into two, keeping the newest', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise).mockResolvedValueOnce(answer(6, 300));

    void saveDay(DATE, save({ tips: 100 }));
    void saveDay(DATE, save({ tips: 200 }));
    void saveDay(DATE, save({ tips: 300 }));
    await flush();

    first.resolve(answer(5, 100));
    await daySettled(DATE);

    expect(api.saveDay).toHaveBeenCalledTimes(2);
    expect(api.saveDay.mock.calls[1][1]).toMatchObject({ tips: 300, version: 5 });
  });

  it('keeps dates apart: one day’s save never waits on another’s', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise).mockResolvedValueOnce(answer(1));

    void saveDay(DATE, save());
    void saveDay('2026-11-03', save());
    await flush();

    expect(api.saveDay).toHaveBeenCalledTimes(2);

    first.resolve(answer(5));
    await daySettled(DATE);
  });

  it('leaves alone a save that carries no version: it asked for last-write-wins', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise).mockResolvedValueOnce(answer(6));

    void saveDay(DATE, save());
    void saveDay(DATE, save({ version: undefined }));
    await flush();

    first.resolve(answer(5));
    await daySettled(DATE);

    expect(api.saveDay.mock.calls[1][1].version).toBeUndefined();
  });

  it('leaves the version alone when the answer carried none', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise).mockResolvedValueOnce(answer(undefined));

    void saveDay(DATE, save());
    void saveDay(DATE, save());
    await flush();

    first.resolve(answer(undefined));
    await daySettled(DATE);

    expect(api.saveDay.mock.calls[1][1].version).toBe(4);
  });

  it('loads the summary once, when the queue drains', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise).mockResolvedValueOnce(answer(6));

    void saveDay(DATE, save());
    void saveDay(DATE, save());
    await flush();

    expect(api.payouts).not.toHaveBeenCalled();

    first.resolve(answer(5));
    await daySettled(DATE);
    await flush();

    expect(api.payouts).toHaveBeenCalledTimes(1);
  });

  it('holds saving true for as long as anything is on the wire', async () => {
    const one = held();
    const two = held();

    api.saveDay.mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise);

    void saveDay(DATE, save());
    void saveDay('2026-11-03', save());
    await flush();

    expect(useCalendar.getState().saving).toBe(true);

    one.resolve(answer(5));
    await daySettled(DATE);

    expect(useCalendar.getState().saving).toBe(true);

    two.resolve({ ...answer(1), date: '2026-11-03' });
    await daySettled('2026-11-03');

    expect(useCalendar.getState().saving).toBe(false);
  });

  it('reports a date as saving, then clears it', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise);

    void saveDay(DATE, save());
    expect(useCalendar.getState().dayStatus.get(DATE)).toBe('saving');

    first.resolve(answer(5));
    await daySettled(DATE);

    expect(useCalendar.getState().dayStatus.has(DATE)).toBe(false);
  });

  it('hands a 409 to the conflict path with the newest payload', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise);

    void saveDay(DATE, save({ tips: 100 }));
    void saveDay(DATE, save({ tips: 200 }));
    await flush();

    first.reject(new HttpError(409, 'Changed elsewhere.'));
    await daySettled(DATE);

    expect(api.saveDay).toHaveBeenCalledTimes(1);
    expect(useCalendar.getState().conflict).toMatchObject({ date: DATE, mine: { tips: 200 } });
    expect(api.days).toHaveBeenCalled();
    expect(useCalendar.getState().dayStatus.has(DATE)).toBe(false);
  });

  it('takes the second to a 409 the same way once the first has landed', async () => {
    const first = held();

    api.saveDay
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new HttpError(409, 'Changed elsewhere.'));

    void saveDay(DATE, save({ tips: 100 }));
    void saveDay(DATE, save({ tips: 200 }));
    await flush();

    first.resolve(answer(5, 100));
    await daySettled(DATE);
    await flush();

    expect(useCalendar.getState().conflict?.mine).toMatchObject({ tips: 200, version: 5 });
    expect(api.payouts).toHaveBeenCalledTimes(1);
  });

  it('queues the newest payload when the network is gone', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise);
    queue.all.mockResolvedValue([{ date: DATE, body: save(), queuedAt: 0 }]);

    void saveDay(DATE, save({ tips: 100 }));
    void saveDay(DATE, save({ tips: 200 }));
    await flush();

    first.reject(new TypeError('Failed to fetch'));
    await daySettled(DATE);

    expect(queue.put).toHaveBeenCalledTimes(1);
    expect(queue.put.mock.calls[0][0]).toMatchObject({ date: DATE, body: { tips: 200 } });
    expect(useCalendar.getState().dayStatus.get(DATE)).toBe('queued');
    expect(useCalendar.getState().error).toBeNull();
  });

  it('counts a day saved twice into the queue as one waiting day', async () => {
    api.saveDay.mockRejectedValue(new TypeError('Failed to fetch'));
    queue.all.mockResolvedValue([{ date: DATE, body: save(), queuedAt: 0 }]);

    await saveDay(DATE, save({ tips: 100 }));
    await saveDay(DATE, save({ tips: 200 }));

    expect(useCalendar.getState().pendingOffline).toBe(1);
  });

  it('says so, and puts the date back, when the browser will not hold it', async () => {
    const earlier = answer(4, 50);

    useCalendar.setState({ days: new Map([[DATE, earlier]]) });
    api.saveDay.mockRejectedValue(new TypeError('Failed to fetch'));
    queue.put.mockResolvedValue(false);

    await saveDay(DATE, save({ tips: 100 }));

    expect(useCalendar.getState().dayStatus.get(DATE)).toBe('failed');
    expect(useCalendar.getState().error).not.toBeNull();
    expect(useCalendar.getState().days.get(DATE)).toBe(earlier);
  });

  it('reports a refused save as failed, on what last landed', async () => {
    const first = held();

    api.saveDay
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new HttpError(500, 'Broken.'));

    void saveDay(DATE, save({ tips: 100 }));
    void saveDay(DATE, save({ tips: 200 }));
    await flush();

    first.resolve(answer(5, 100));
    await daySettled(DATE);

    expect(useCalendar.getState().dayStatus.get(DATE)).toBe('failed');
    expect(useCalendar.getState().days.get(DATE)?.tips).toBe(100);
  });

  it('sends the newer save waiting behind a refused one, which answers for itself', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise).mockResolvedValueOnce(answer(5, 1500));

    useCalendar.setState({ days: new Map([[DATE, answer(4, null)]]) });

    void saveDay(DATE, save({ tips: 1 }));
    void saveDay(DATE, save({ tips: 1500 }));
    await flush();

    first.reject(new HttpError(400, 'Cash tips cannot exceed the total.'));
    await daySettled(DATE);

    expect(api.saveDay).toHaveBeenCalledTimes(2);
    expect(api.saveDay.mock.calls[1][1]).toMatchObject({ tips: 1500, version: 4 });
    expect(useCalendar.getState().days.get(DATE)?.tips).toBe(1500);
    expect(useCalendar.getState().dayStatus.has(DATE)).toBe(false);
  });

  it('tells whoever opened the lane their own save was refused, whatever landed after it', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise).mockResolvedValueOnce(answer(5, 1500));

    const opener = saveDay(DATE, save({ tips: 1 }));

    void saveDay(DATE, save({ tips: 1500 }));
    await flush();

    first.reject(new HttpError(500, 'Broken.'));

    await expect(opener).resolves.toBe('failed');
  });

  it('reports failure when the newer one is refused too, on what last landed', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise).mockRejectedValueOnce(new HttpError(500, 'Broken.'));

    useCalendar.setState({ days: new Map([[DATE, answer(4, 7)]]) });

    void saveDay(DATE, save({ tips: 1 }));
    void saveDay(DATE, save({ tips: 1500 }));
    await flush();

    first.reject(new HttpError(500, 'Broken.'));
    await expect(daySettled(DATE)).resolves.toBe('failed');

    expect(api.saveDay).toHaveBeenCalledTimes(2);
    expect(useCalendar.getState().dayStatus.get(DATE)).toBe('failed');
    expect(useCalendar.getState().days.get(DATE)?.tips).toBe(7);
  });

  it('lets the next save run after a failure', async () => {
    api.saveDay.mockRejectedValueOnce(new HttpError(500, 'Broken.')).mockResolvedValueOnce(answer(5));

    await saveDay(DATE, save());
    await saveDay(DATE, save());

    expect(api.saveDay).toHaveBeenCalledTimes(2);
    expect(useCalendar.getState().dayStatus.has(DATE)).toBe(false);
  });

  it('does not lose a save made while a refused one is being dealt with', async () => {
    let answerRead!: () => void;

    api.saveDay.mockRejectedValueOnce(new HttpError(409, 'Changed.')).mockResolvedValueOnce(answer(9, 300));
    api.days.mockReturnValueOnce(
      new Promise((resolve) => {
        answerRead = () => resolve({ ...EMPTY_SUMMARY, days: [] });
      }),
    );

    const refused = saveDay(DATE, save({ tips: 100 }));

    await flush();
    await saveDay(DATE, save({ tips: 300 }));

    answerRead();
    await refused;

    expect(api.saveDay).toHaveBeenCalledTimes(2);
    expect(api.saveDay.mock.calls[1][1]).toMatchObject({ tips: 300 });
  });

  it('forgets a queued copy of the day once a save built on it lands', async () => {
    useCalendar.setState({ pendingOffline: 1, days: new Map([[DATE, { ...answer(4), queued_at: 7 }]]) });
    api.saveDay.mockResolvedValue(answer(5));
    queue.all
      .mockResolvedValueOnce([{ date: DATE, body: save({ tips: 1500 }), queuedAt: 7 }])
      .mockResolvedValueOnce([]);

    await saveDay(DATE, save());

    expect(queue.remove).toHaveBeenCalledWith(DATE);
    expect(useCalendar.getState().pendingOffline).toBe(0);
  });

  it('keeps a queued copy a landed save was not built on: nothing else holds what it says', async () => {
    const waiting = [{ date: DATE, body: save({ tips: 1500 }), queuedAt: 7 }];

    useCalendar.setState({ pendingOffline: 1, days: new Map([[DATE, answer(4)]]) });
    api.saveDay.mockResolvedValue(answer(5));
    queue.all.mockResolvedValue(waiting);

    await saveDay(DATE, save());
    await flush();

    expect(queue.remove).not.toHaveBeenCalled();
    expect(useCalendar.getState().pendingOffline).toBe(1);
    expect(useCalendar.getState().dayStatus.get(DATE)).toBe('queued');
  });

  it('lays a queued save over the store, so whatever is built from it next carries it', async () => {
    useCalendar.setState({ days: new Map([[DATE, answer(4)]]) });
    api.saveDay.mockRejectedValue(new TypeError('Failed to fetch'));

    await saveDay(DATE, save({ tips: 1500, tips_cash: 200, note: 'cash in the jar' }));

    const held = useCalendar.getState().days.get(DATE);

    expect(toSavePayload(held)).toMatchObject({ tips: 1500, tips_cash: 200, note: 'cash in the jar' });
    expect(held?.version).toBe(4);
  });

  it('keeps the meal money apart from the fine on a day laid over the store', async () => {
    useCalendar.setState({ days: new Map([[DATE, { ...answer(4), deductions: 80, fine: 0 }]]) });
    api.saveDay.mockRejectedValue(new TypeError('Failed to fetch'));

    await saveDay(DATE, save({ deductions: 50 }));

    const held = useCalendar.getState().days.get(DATE);

    expect(held).toMatchObject({ deductions: 130, fine: 50 });
    expect(toSavePayload(held).deductions).toBe(50);
  });

  it('lays a queued shift’s fields and sales over the entries they belong to', async () => {
    const entry = { shift_id: 1, name: 'Bar', worked: false, actual_start: null, break_minutes: 30 };

    useCalendar.setState({
      days: new Map([[DATE, { ...answer(4), shifts: [entry] } as unknown as CalendarDayData]]),
      positions: [{ id: 3, name: 'Tea', price: 10, percentage: 5, archived: false }],
    });
    api.saveDay.mockRejectedValue(new TypeError('Failed to fetch'));

    await saveDay(
      DATE,
      save({
        shifts: [{ shift_id: 1, worked: true, needs_cover: false, actual_start: '10:40', break_minutes: null }],
        sales: [{ sales_id: 3, quantity: 2 }],
      }),
    );

    expect(useCalendar.getState().days.get(DATE)?.shifts[0]).toMatchObject({
      name: 'Bar',
      worked: true,
      actual_start: '10:40',
      break_minutes: 30,
    });
    expect(useCalendar.getState().days.get(DATE)?.sales[0]).toMatchObject({ name: 'Tea', quantity: 2 });
  });

  it('leaves what is queued on the store through a load: the server has not heard it', async () => {
    useCalendar.setState({ days: new Map([[DATE, answer(4)]]) });
    api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [answer(4)] });
    queue.all.mockResolvedValue([{ date: DATE, body: save({ tips: 1500 }), queuedAt: 7 }]);

    await loadGrid();

    expect(useCalendar.getState().days.get(DATE)).toMatchObject({ tips: 1500, queued_at: 7 });
  });

  it('puts what is queued back after a reload, where the store started out empty', async () => {
    api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [] });
    queue.all.mockResolvedValue([{ date: DATE, body: save({ tips: 1500 }), queuedAt: 7 }]);

    await loadGrid();

    expect(useCalendar.getState().days.get(DATE)).toMatchObject({ tips: 1500, version: 0 });
  });

  it('builds on the queued copy, not over it, when the save after it goes out', async () => {
    useCalendar.setState({ days: new Map([[DATE, answer(4)]]), pendingOffline: 0 });
    api.saveDay.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await saveDay(DATE, save({ tips: 1500 }));

    const queuedAt = queue.put.mock.calls[0][0].queuedAt;

    queue.all.mockResolvedValueOnce([{ date: DATE, body: save({ tips: 1500 }), queuedAt }]);
    useCalendar.setState({ pendingOffline: 1 });
    api.saveDay.mockResolvedValueOnce(answer(5, 1500));

    await saveDay(DATE, { ...toSavePayload(useCalendar.getState().days.get(DATE)), version: 4 });

    expect(api.saveDay.mock.calls[1][1].tips).toBe(1500);
    expect(queue.remove).toHaveBeenCalledWith(DATE);
  });

  it('keeps what the day said when the edit was made, for a day that moves before it can go', async () => {
    useCalendar.setState({ days: new Map([[DATE, answer(4, 50)]]) });
    api.saveDay.mockRejectedValue(new TypeError('Failed to fetch'));

    await saveDay(DATE, save({ tips: 100 }));

    expect(queue.put.mock.calls[0][0].base).toMatchObject({ tips: 50 });
  });

  it('keeps that first base through a second offline save, which says everything the first did', async () => {
    useCalendar.setState({ days: new Map([[DATE, { ...answer(4, 100), queued_at: 7 }]]) });
    api.saveDay.mockRejectedValue(new TypeError('Failed to fetch'));
    queue.all.mockResolvedValue([{ date: DATE, body: save({ tips: 100 }), base: save({ tips: 50 }), queuedAt: 7 }]);

    await saveDay(DATE, save({ tips: 200 }));

    expect(queue.put.mock.calls[0][0]).toMatchObject({ body: { tips: 200 }, base: { tips: 50 } });
  });

  it('keeps a queued edit a save was not built on, replayed under it, rather than replace it', async () => {
    useCalendar.setState({ days: new Map([[DATE, answer(4)]]) });
    api.saveDay.mockRejectedValue(new TypeError('Failed to fetch'));
    queue.all.mockResolvedValue([{ date: DATE, body: save({ note: 'typed' }), base: save(), queuedAt: 7 }]);

    await saveDay(DATE, save({ tips: 200 }));

    expect(queue.put.mock.calls[0][0].body).toMatchObject({ tips: 200, note: 'typed' });
  });

  it('remembers one undo step for a burst, and none for a write the app made itself', async () => {
    const first = held();

    api.saveDay.mockReturnValueOnce(first.promise).mockResolvedValue(answer(6));

    void saveDay(DATE, save());
    void saveDay(DATE, save());
    await flush();

    first.resolve(answer(5));
    await daySettled(DATE);

    expect(useCalendar.getState().undoStack).toHaveLength(1);

    await saveDay(DATE, save(), { undoable: false });

    expect(useCalendar.getState().undoStack).toHaveLength(1);
  });
});

describe('painting', () => {
  it('takes the version the stroke moved to, or a tip typed before the read lands is refused over its own paint', async () => {
    const template = { id: 7, name: 'Вечер', start_time: '11:00', end_time: '22:00', break_minutes: 0, week_hours: [] };

    useCalendar.setState({ days: new Map([[DATE, answer(4)]]) });
    api.bulk.mockResolvedValue([answer(5)]);

    await applyToDates([DATE], template as unknown as ShiftTemplate);

    const held = useCalendar.getState().days.get(DATE);

    expect(held?.version).toBe(5);
    // Only the version: that answer does not name what else is on the day.
    expect(held?.shifts.map((entry) => entry.shift_id)).toEqual([7]);
  });
});

describe('loadGrid', () => {
  const inGrid = () => {
    const today = new Date();

    return `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
  };

  const on = (version: number, tips: number | null) =>
    ({ ...answer(version, tips), date: inGrid() }) as CalendarDayData;

  it('will not walk a day back to a read that left before a save landed', async () => {
    useCalendar.setState({ days: new Map([[inGrid(), on(4, 900)]]) });
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on(3, null)] });

    await loadGrid();

    expect(useCalendar.getState().days.get(inGrid())).toMatchObject({ version: 4, tips: 900 });
  });

  it('keeps a day with a save on the wire, read or no read', async () => {
    const first = held();

    useCalendar.setState({ days: new Map([[inGrid(), on(4, 900)]]) });
    api.saveDay.mockReturnValueOnce(first.promise);
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on(4, null)] });

    void saveDay(inGrid(), save());
    await loadGrid();

    expect(useCalendar.getState().days.get(inGrid())?.tips).toBe(900);

    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [] });
    await loadGrid();

    expect(useCalendar.getState().days.get(inGrid())?.tips).toBe(900);

    first.resolve(on(5, 900));
    await daySettled(inGrid());
  });

  it('takes a read at the same version or newer, the way it always did', async () => {
    useCalendar.setState({ days: new Map([[inGrid(), on(4, 900)]]) });
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on(4, 950)] });

    await loadGrid();

    expect(useCalendar.getState().days.get(inGrid())?.tips).toBe(950);
  });
});

describe('a read with a save still queued', () => {
  const today = new Date();
  const key = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;

  const on = (over: Partial<CalendarDayData>) =>
    ({ ...answer(over.version, null), date: key, ...over }) as CalendarDayData;

  const waiting = (edits: Partial<DaySave>) => ({
    date: key,
    body: save({ version: 3, ...edits }),
    base: save({ version: undefined }),
    queuedAt: 7,
  });

  it('shows what came meanwhile, with only what the edit changed on top, on the version read', async () => {
    useCalendar.setState({ days: new Map([[key, on({ version: 3 })]]) });
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on({ version: 4, tips: 1500 })] });
    queue.all.mockResolvedValue([waiting({ note: 'typed offline' })]);

    await loadClockDays();

    expect(useCalendar.getState().days.get(key)).toMatchObject({
      tips: 1500,
      note: 'typed offline',
      version: 4,
      queued_at: 7,
    });
  });

  it('stays on the edit’s own version where both sides changed one thing, so a save on it gets asked', async () => {
    useCalendar.setState({ days: new Map([[key, on({ version: 3 })]]) });
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on({ version: 4, tips: 1500 })] });
    queue.all.mockResolvedValue([waiting({ tips: 100 })]);

    await loadClockDays();

    expect(useCalendar.getState().days.get(key)).toMatchObject({ tips: 100, version: 3 });
  });

  it('leaves a shift the read no longer has off the store', async () => {
    const entry = { shift_id: 1, worked: false, needs_cover: false, actual_start: null, actual_end: null };
    const row = entry as unknown as CalendarDayData['shifts'][number];

    useCalendar.setState({ days: new Map([[key, on({ version: 3, shifts: [row] })]]) });
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on({ version: 4, shifts: [] })] });
    queue.all.mockResolvedValue([
      { date: key, body: save({ version: 3, tips: 100, shifts: [entry] }), base: save({ shifts: [entry] }), queuedAt: 7 },
    ]);

    await loadClockDays();

    expect(useCalendar.getState().days.get(key)?.shifts).toEqual([]);
  });

  it('takes a copy queued before bases were kept whole on its own version, which nothing moved under', async () => {
    useCalendar.setState({ days: new Map([[key, on({ version: 3, tips: 50 })]]) });
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on({ version: 3, tips: 50 })] });
    queue.all.mockResolvedValue([{ date: key, body: save({ version: 3, tips: 100 }), queuedAt: 7 }]);

    await loadClockDays();

    expect(useCalendar.getState().days.get(key)).toMatchObject({ tips: 100, version: 3 });
  });

  it('on another version asks about a copy like that, which cannot say what it changed', async () => {
    useCalendar.setState({ days: new Map([[key, on({ version: 3 })]]) });
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on({ version: 4, tips: 1500 })] });
    queue.all.mockResolvedValue([{ date: key, body: save({ version: 3, tips: 100 }), queuedAt: 7 }]);

    await loadClockDays();

    expect(useCalendar.getState().days.get(key)).toMatchObject({ tips: 100, version: 3 });
  });
});

describe('loadClockDays', () => {
  const today = new Date();
  const key = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;

  const on = (version: number, tips: number | null) =>
    ({ ...answer(version, tips), date: key }) as CalendarDayData;

  it('lets a close from the server in at the same version, and refreshes the money once', async () => {
    useCalendar.setState({ days: new Map([[key, on(4, null)]]) });
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on(4, 100)] });

    await expect(loadClockDays()).resolves.toBe(true);
    await flush();

    expect(useCalendar.getState().days.get(key)?.tips).toBe(100);
    expect(api.payouts).toHaveBeenCalledTimes(1);
  });

  it('will not walk a day back to an older version', async () => {
    useCalendar.setState({ days: new Map([[key, on(5, 100)]]) });
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on(4, null)] });

    await loadClockDays();

    expect(useCalendar.getState().days.get(key)?.tips).toBe(100);
  });

  it('stays out of a date with a save on the wire', async () => {
    const first = held();

    useCalendar.setState({ days: new Map([[key, on(4, null)]]) });
    api.saveDay.mockReturnValueOnce(first.promise);
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on(4, 100)] });

    void saveDay(key, save());
    await loadClockDays();

    expect(useCalendar.getState().days.get(key)?.tips).toBeNull();

    first.resolve(on(5, null));
    await daySettled(key);
  });

  it('leaves what is queued on the store: the server has not heard it', async () => {
    useCalendar.setState({ days: new Map([[key, on(4, null)]]) });
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on(4, null)] });
    queue.all.mockResolvedValue([{ date: key, body: save({ tips: 1500 }), queuedAt: 7 }]);

    await loadClockDays();

    expect(useCalendar.getState().days.get(key)?.tips).toBe(1500);
  });

  it('asks for nothing more when nothing moved', async () => {
    useCalendar.setState({ days: new Map([[key, on(4, null)]]) });
    api.days.mockResolvedValueOnce({ ...EMPTY_SUMMARY, days: [on(4, null)] });

    await loadClockDays();
    await flush();

    expect(api.payouts).not.toHaveBeenCalled();
  });

  it('says when the server could not be asked', async () => {
    api.days.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(loadClockDays()).resolves.toBe(false);
  });
});

describe('flushOffline', () => {
  const OTHER = '2026-11-03';

  /** An edit made on version 3, held back. */
  const edit = (edits: Partial<DaySave>, date = DATE, queuedAt = 1) => ({
    date,
    body: save({ version: 3, ...edits }),
    base: save({ version: undefined }),
    queuedAt,
  });

  const moved = (date: string, over: Partial<CalendarDayData>) =>
    ({ ...answer(4), date, ...over }) as CalendarDayData;

  /** A queue that holds what it was given until it is told to let go. */
  const holding = (...entries: ReturnType<typeof edit>[]) => {
    let left = entries;

    queue.all.mockImplementation(async () => left);
    queue.remove.mockImplementation(async (date) => {
      left = left.filter((item) => item.date !== date);
    });
    queue.put.mockImplementation(async (entry) => {
      left = [...left.filter((item) => item.date !== entry.date), entry as ReturnType<typeof edit>];

      return true;
    });
  };

  const stale = new HttpError(409, 'Changed elsewhere.');

  it('sends what is waiting on its own version when nothing moved', async () => {
    holding(edit({ tips: 100 }));
    api.saveDay.mockResolvedValue(answer(4, 100));

    await flushOffline();

    expect(api.saveDay.mock.calls[0][1]).toMatchObject({ tips: 100, version: 3 });
    expect(queue.remove).toHaveBeenCalledWith(DATE);
    expect(useCalendar.getState().pendingOffline).toBe(0);
  });

  it('replays over a day that moved, instead of stopping on the 409', async () => {
    holding(edit({ tips: 100 }));
    api.saveDay.mockRejectedValueOnce(stale).mockResolvedValueOnce(answer(5, 100));
    api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [moved(DATE, { note: 'from the phone' })] });

    await flushOffline();

    expect(api.saveDay).toHaveBeenCalledTimes(2);
    expect(api.saveDay.mock.calls[1][1]).toMatchObject({ tips: 100, note: 'from the phone', version: 4 });
    expect(queue.remove).toHaveBeenCalledWith(DATE);
    expect(useCalendar.getState().conflict).toBeNull();
    expect(useCalendar.getState().pendingOffline).toBe(0);
  });

  it('asks the person where both sides changed one thing, keeping the copy until they answer', async () => {
    holding(edit({ tips: 100 }));
    api.saveDay.mockRejectedValueOnce(stale);
    api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [moved(DATE, { tips: 1500 })] });

    await flushOffline();

    expect(api.saveDay).toHaveBeenCalledTimes(1);
    expect(useCalendar.getState().conflict).toMatchObject({ date: DATE, mine: { tips: 100 }, queuedAt: 1 });
    expect(queue.remove).not.toHaveBeenCalled();
    expect(useCalendar.getState().pendingOffline).toBe(1);
  });

  it('shows the other side as the other side while the person weighs it, through a reload too', async () => {
    const today = new Date();
    const key = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;

    holding(edit({ tips: 100 }, key));
    api.saveDay.mockRejectedValueOnce(stale);
    api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [moved(key, { tips: 1500 })] });

    await flushOffline();
    await loadGrid();

    expect(useCalendar.getState().days.get(key)?.tips).toBe(1500);
  });

  it('does not let one date’s conflict keep the next from going', async () => {
    holding(edit({ tips: 100 }), edit({ tips: 200 }, OTHER, 2));
    api.saveDay.mockRejectedValueOnce(stale).mockResolvedValueOnce(moved(OTHER, { tips: 200 }));
    api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [moved(DATE, { tips: 1500 })] });

    await flushOffline();

    expect(api.saveDay.mock.calls[1][0]).toBe(OTHER);
    expect(useCalendar.getState().pendingOffline).toBe(1);
    expect(useCalendar.getState().conflict?.date).toBe(DATE);
  });

  it('asks about one date at a time, and comes to the next once answered', async () => {
    holding(edit({ tips: 100 }), edit({ tips: 200 }, OTHER, 2));
    api.saveDay.mockRejectedValue(stale);
    api.days.mockImplementation(async (from) => ({
      ...EMPTY_SUMMARY,
      days: [moved(from, { tips: 1500 })],
    }));

    await flushOffline();

    expect(useCalendar.getState().conflict?.date).toBe(DATE);

    await catalogueActions.dropConflict();

    expect(useCalendar.getState().conflict?.date).toBe(OTHER);
  });

  it('lets go of the copy when the person keeps theirs', async () => {
    holding(edit({ tips: 100 }));
    api.saveDay.mockRejectedValueOnce(stale);
    api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [moved(DATE, { tips: 1500 })] });

    await flushOffline();
    await catalogueActions.dropConflict();

    expect(queue.remove).toHaveBeenCalledWith(DATE);
    expect(useCalendar.getState().pendingOffline).toBe(0);
    expect(useCalendar.getState().days.get(DATE)?.tips).toBe(1500);
  });

  it('writes the person’s fields over the day as it stands when they keep theirs, and forgets the copy', async () => {
    holding(edit({ tips: 100 }));
    api.saveDay.mockRejectedValueOnce(stale).mockResolvedValueOnce(moved(DATE, { tips: 100, version: 5 }));
    api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [moved(DATE, { tips: 1500, note: 'from the phone' })] });

    await flushOffline();
    await catalogueActions.overwriteConflict();

    expect(api.saveDay.mock.calls[1][1]).toMatchObject({ tips: 100, note: 'from the phone', version: 4 });
    expect(queue.remove).toHaveBeenCalledWith(DATE);
    expect(useCalendar.getState().pendingOffline).toBe(0);
  });

  describe('answered with Write mine on a read of the day as it stands', () => {
    const asked = async (typed: Partial<DaySave> = {}) => {
      holding(edit({ tips: 100 }));
      useCalendar.setState({ days: new Map([[DATE, { ...answer(3, 100), queued_at: 1 }]]), pendingOffline: 1 });
      api.saveDay.mockRejectedValueOnce(stale).mockResolvedValueOnce(moved(DATE, { tips: 100, version: 6 }));
      api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [moved(DATE, { tips: 1500 })] });

      await saveDay(DATE, save({ tips: 100, version: 3, ...typed }));
    };

    /** The other side moves again after the question. */
    const movedAgain = () =>
      api.days.mockResolvedValue({
        ...EMPTY_SUMMARY,
        days: [moved(DATE, { tips: 1500, note: 'second word', version: 5 })],
      });

    it('keeps what a panel typed over the queued copy, along with the copy', async () => {
      await asked({ colour: 'typed here' });
      movedAgain();

      await catalogueActions.overwriteConflict();

      expect(api.saveDay.mock.calls[1][1]).toMatchObject({
        tips: 100,
        colour: 'typed here',
        note: 'second word',
        version: 5,
      });
      expect(queue.remove).toHaveBeenCalledWith(DATE);
    });

    it('sends a panel’s conflict on the version it asked at where the day cannot be read', async () => {
      await asked({ colour: 'typed here' });
      api.days.mockRejectedValue(new TypeError('Failed to fetch'));

      useCalendar.setState({ days: new Map([[DATE, moved(DATE, { tips: 1500, version: 5 })]]) });

      await catalogueActions.overwriteConflict();

      expect(api.saveDay.mock.calls[1][1]).toMatchObject({ tips: 100, colour: 'typed here', version: 4 });
    });

    it('puts the question again if the day moves once more between the read and the write', async () => {
      await asked();
      movedAgain();
      api.saveDay.mockReset();
      api.saveDay.mockRejectedValue(stale);

      await catalogueActions.overwriteConflict();

      expect(useCalendar.getState().conflict).toMatchObject({ date: DATE, mine: { tips: 100 }, queuedAt: 1 });
      expect(queue.remove).not.toHaveBeenCalled();
    });

    it('sends nothing where another tab sent the copy meanwhile', async () => {
      holding(edit({ tips: 100 }));
      api.saveDay.mockRejectedValueOnce(stale);
      api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [moved(DATE, { tips: 1500 })] });

      await flushOffline();
      await queue.remove(DATE);
      api.saveDay.mockClear();

      await catalogueActions.overwriteConflict();

      expect(api.saveDay).not.toHaveBeenCalled();
    });
  });

  it('settles the queued copy along with a panel’s conflict built on it, so it is not asked about twice', async () => {
    holding(edit({ tips: 100 }));
    useCalendar.setState({ days: new Map([[DATE, { ...answer(3, 100), queued_at: 1 }]]) });
    api.saveDay.mockRejectedValueOnce(stale);
    api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [moved(DATE, { tips: 1500 })] });

    await saveDay(DATE, save({ tips: 200, version: 3 }));
    await catalogueActions.dropConflict();

    expect(queue.remove).toHaveBeenCalledWith(DATE);
  });

  describe('answered with Keep theirs, where the copy says more than what was contested', () => {
    const planned = { shift_id: 7, worked: false, needs_cover: false, actual_start: null, actual_end: null };
    const finished = { ...planned, worked: true, actual_start: '10:40', actual_end: '19:30' };
    const finishQueued = {
      date: DATE,
      body: save({ version: 3, tips: 100, shifts: [finished] }),
      base: save({ version: undefined, shifts: [planned] }),
      queuedAt: 1,
    };
    const phone = () =>
      ({ ...EMPTY_SUMMARY, days: [moved(DATE, { tips: 1500, shifts: [planned] as never })] });

    it('still sends the finish, with the tip the person kept', async () => {
      holding(finishQueued);
      api.saveDay.mockRejectedValueOnce(stale).mockResolvedValueOnce(answer(5, 1500));
      api.days.mockResolvedValue(phone());

      await flushOffline();
      await catalogueActions.dropConflict();

      expect(api.saveDay).toHaveBeenCalledTimes(2);
      expect(api.saveDay.mock.calls[1][1]).toMatchObject({ tips: 1500, version: 4, shifts: [finished] });
      expect(useCalendar.getState().pendingOffline).toBe(0);
    });

    it('keeps the copy waiting when the day cannot be read to do that', async () => {
      holding(finishQueued);
      api.saveDay.mockRejectedValueOnce(stale);
      api.days.mockResolvedValueOnce(phone()).mockRejectedValue(new TypeError('Failed to fetch'));

      await flushOffline();
      await catalogueActions.dropConflict();

      expect(queue.remove).not.toHaveBeenCalled();
      expect(useCalendar.getState().pendingOffline).toBe(1);
      expect(useCalendar.getState().dayStatus.get(DATE)).toBe('queued');
    });

    it('leaves the copy alone when the question is put down unanswered, and asks again next time', async () => {
      holding(finishQueued);
      api.saveDay.mockRejectedValue(stale);
      api.days.mockResolvedValue(phone());

      await flushOffline();
      await catalogueActions.leaveConflict();

      expect(queue.remove).not.toHaveBeenCalled();
      expect(queue.put).not.toHaveBeenCalled();
      expect(useCalendar.getState().conflict).toBeNull();
      expect(useCalendar.getState().pendingOffline).toBe(1);
      expect(useCalendar.getState().dayStatus.get(DATE)).toBe('queued');

      await flushOffline();

      expect(useCalendar.getState().conflict).toMatchObject({ date: DATE, mine: { tips: 100 } });
    });
  });

  it('still drops a panel’s draft when its conflict is put down: it has nowhere to wait', async () => {
    api.saveDay.mockRejectedValueOnce(stale);

    await saveDay(DATE, save({ tips: 200 }));

    const dropped = useCalendar.getState().draftsDropped;

    await catalogueActions.leaveConflict();

    expect(useCalendar.getState().conflict).toBeNull();
    expect(useCalendar.getState().draftsDropped).toBe(dropped + 1);
  });

  describe('a save typed offline over a day whose older queued copy is still unanswered', () => {
    const offline = () => api.saveDay.mockRejectedValue(new TypeError('Failed to fetch'));

    it('lets the newer word win on what both changed, on the version it was typed on', async () => {
      holding(edit({ tips: 100, note: 'typed first' }));
      useCalendar.setState({ days: new Map([[DATE, answer(4, 1500)]]) });
      offline();

      await saveDay(DATE, save({ tips: 200, version: 4 }));

      expect(queue.put.mock.calls[0][0].body).toMatchObject({ tips: 200, note: 'typed first', version: 4 });
      expect(useCalendar.getState().days.get(DATE)?.tips).toBe(200);
    });

    it('does not take a field the new save only carried across for a word about it', async () => {
      holding(edit({ tips: 100 }));
      useCalendar.setState({ days: new Map([[DATE, answer(4, 1500)]]) });
      offline();

      await saveDay(DATE, save({ tips: 1500, note: 'just a note', version: 4 }));

      // The copy's tip still has not been answered, so it goes on being asked.
      expect(queue.put.mock.calls[0][0].body).toMatchObject({ tips: 100, note: 'just a note', version: 3 });
    });

    it('gives an open question the newer word, and leaves the other side showing', async () => {
      holding(edit({ tips: 100 }));
      api.saveDay.mockRejectedValueOnce(stale);
      api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [moved(DATE, { tips: 1500 })] });

      await flushOffline();
      offline();
      await saveDay(DATE, save({ tips: 200, version: 4 }));

      const { conflict, days } = useCalendar.getState();

      expect(conflict?.mine.tips).toBe(200);
      expect(conflict?.queuedAt).toBe(queue.put.mock.calls[0][0].queuedAt);
      expect(days.get(DATE)?.tips).toBe(1500);

      api.saveDay.mockReset();
      api.saveDay.mockResolvedValue(answer(5, 200));

      await catalogueActions.overwriteConflict();

      expect(api.saveDay.mock.calls[0][1]).toMatchObject({ tips: 200, version: 4 });
      expect(queue.remove).toHaveBeenCalledWith(DATE);
    });
  });

  it('stops at a dead network, with the rest kept', async () => {
    holding(edit({ tips: 100 }), edit({ tips: 200 }, OTHER, 2));
    api.saveDay.mockRejectedValue(new TypeError('Failed to fetch'));

    await flushOffline();

    expect(api.saveDay).toHaveBeenCalledTimes(1);
    expect(useCalendar.getState().pendingOffline).toBe(2);
    expect(useCalendar.getState().dayStatus.get(OTHER)).toBe('queued');
  });

  it('keeps a date the server refused and goes on to the next', async () => {
    holding(edit({ tips: 100 }), edit({ tips: 200 }, OTHER, 2));
    api.saveDay.mockRejectedValueOnce(new HttpError(500, 'Broken.')).mockResolvedValueOnce(moved(OTHER, {}));

    await flushOffline();

    expect(api.saveDay).toHaveBeenCalledTimes(2);
    expect(useCalendar.getState().pendingOffline).toBe(1);
  });

  it('keeps a shift put on offline through the replay, its template loaded or not', async () => {
    const placed = { shift_id: 9, worked: false, needs_cover: false };

    holding(edit({ shifts: [placed] }));
    useCalendar.setState({ templates: [] });
    api.saveDay.mockRejectedValueOnce(stale).mockResolvedValueOnce(answer(5));
    api.days.mockResolvedValue({ ...EMPTY_SUMMARY, days: [moved(DATE, { note: 'from the phone' })] });

    await flushOffline();

    expect(api.saveDay.mock.calls[1][1]).toMatchObject({ note: 'from the phone', shifts: [{ shift_id: 9 }] });
  });

  it('does not send a queued copy over the newer save built on it, which is on the wire', async () => {
    const first = held();

    holding(edit({ tips: 100 }));
    useCalendar.setState({ pendingOffline: 1, days: new Map([[DATE, { ...answer(3, 100), queued_at: 1 }]]) });
    api.saveDay.mockReturnValueOnce(first.promise);

    void saveDay(DATE, save({ tips: 300, version: 3 }));

    const flushed = flushOffline();

    await flush();
    first.resolve(answer(4, 300));
    await flushed;

    expect(api.saveDay).toHaveBeenCalledTimes(1);
    expect(useCalendar.getState().days.get(DATE)?.tips).toBe(300);
  });

  it('waits its turn behind a save that said nothing of the copy, then goes on its own version', async () => {
    const first = held();

    holding(edit({ tips: 100 }));
    api.saveDay.mockReturnValueOnce(first.promise).mockResolvedValueOnce(answer(5));

    void saveDay(DATE, save({ note: 'typed' }));

    const flushed = flushOffline();

    await flush();
    expect(api.saveDay).toHaveBeenCalledTimes(1);

    first.resolve(answer(4));
    await flushed;

    expect(api.saveDay.mock.calls[1][1]).toMatchObject({ tips: 100, version: 3 });
  });

  it('sends a copy once, however many asked at the same moment', async () => {
    holding(edit({ tips: 100 }));
    api.saveDay.mockResolvedValue(answer(4, 100));

    await Promise.all([flushOffline(), flushOffline()]);

    expect(api.saveDay).toHaveBeenCalledTimes(1);
  });
});
