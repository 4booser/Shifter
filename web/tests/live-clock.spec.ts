import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { calendarApi } from '@/lib/api/calendar';
import { HttpError } from '@/lib/api/http';
import { CalendarDayData, DaySave, DayShiftEntry, EMPTY_SUMMARY, ShiftTemplate, toSavePayload } from '@/lib/calendar/models';
import {
  LiveShift,
  SHIFT_DONE_EVENT,
  cancelLiveShift,
  coverLiveShift,
  finishLiveShift,
  liveTick,
  moveLiveShift,
  startLiveShift,
  syncLive,
  useLive,
} from '@/lib/live/live-shift';
import { clockStep } from '@/lib/live/auto-clock';
import { daySettled, saveDay, useCalendar } from '@/lib/store/calendar';
import { offlineQueue } from '@/lib/store/offline';

vi.mock('@/lib/api/calendar', () => ({
  calendarApi: { saveDay: vi.fn(), days: vi.fn(), payouts: vi.fn() },
}));

vi.mock('@/lib/store/offline', () => ({
  offlineQueue: { all: vi.fn(async () => []), put: vi.fn(async () => true), remove: vi.fn(async () => undefined) },
}));

const api = vi.mocked(calendarApi);
const queue = vi.mocked(offlineQueue);

const DATE = '2026-11-06';

const template = (over: Partial<ShiftTemplate> = {}): ShiftTemplate => ({
  id: 1,
  name: 'Bar',
  symbol: null,
  location_id: null,
  location_name: null,
  location_colour: null,
  colour: null,
  effective_colour: null,
  start_time: '11:00',
  end_time: '22:00',
  salary_period: 'hour',
  salary_amount: 200,
  revenue_percent: null,
  tip_source: 'personal',
  tip_pool_percent: null,
  break_minutes: 30,
  hours: 10.5,
  archived: false,
  week_hours: [{ weekday: 5, start_time: '11:00', end_time: '23:00' }],
  auto_clock: true,
  ...over,
});

const entry = (over: Partial<DayShiftEntry> = {}): DayShiftEntry => ({
  shift_id: 1,
  name: 'Bar',
  symbol: null,
  colour: null,
  start_time: '11:00',
  end_time: '23:00',
  hours: 11.5,
  earned: 0,
  revenue: null,
  guests: null,
  zone: 'unset',
  revenue_percent: null,
  worked: false,
  needs_cover: false,
  actual_start: null,
  actual_end: null,
  break_minutes: 30,
  auto_closed: false,
  ...over,
});

const day = (...shifts: DayShiftEntry[]) =>
  ({ date: DATE, version: 3, shifts, sales: [], tips: 40, earned: 0, hours: 0 }) as unknown as CalendarDayData;

const at = (hours: number, minutes = 0) => new Date(2026, 10, 6, hours, minutes).getTime();

const clock = (over: Partial<LiveShift> = {}): LiveShift => ({
  shiftId: 1,
  date: DATE,
  startedAt: at(11),
  breakMs: 0,
  pausedAt: null,
  breakUntil: null,
  ...over,
});

/** What the server holds, which the store's copy may be behind. */
let server: Map<string, CalendarDayData>;

/** The same day on the server and in the store. */
const holding = (held: CalendarDayData) => {
  server = new Map([[held.date, held]]);
  useCalendar.setState({ days: new Map([[held.date, held]]) });
};

const sent = () => api.saveDay.mock.calls.at(-1)?.[1];
const shiftSent = () => sent()?.shifts[0];

const flushed = async () => {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
};

const settle = async () => {
  await flushed();
  await daySettled(DATE);
  await flushed();
};

let done: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('location', { origin: 'http://localhost' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });

  done = vi.fn();
  vi.stubGlobal('dispatchEvent', done);

  server = new Map([[DATE, day(entry())]]);
  queue.all.mockResolvedValue([]);

  api.days.mockImplementation(async (from, to) => ({
    ...EMPTY_SUMMARY,
    days: [...server.values()].filter((item) => item.date >= from && item.date <= to),
  }));
  api.payouts.mockResolvedValue([]);
  api.saveDay.mockImplementation(async (date, body) => {
    const saved = {
      ...server.get(date),
      ...body,
      date,
      shifts: body.shifts.map((item) => entry(item as Partial<DayShiftEntry>)),
      version: (server.get(date)?.version ?? 0) + 1,
    } as unknown as CalendarDayData;

    server.set(date, saved);

    return saved;
  });

  useLive.setState({ live: null });
  useCalendar.setState({
    days: new Map([[DATE, day(entry())]]),
    templates: [template()],
    dayStatus: new Map(),
    undoStack: [],
    undoVisible: false,
    conflict: null,
  });
});

describe('startLiveShift', () => {
  it('writes the real start to the day straight away, alone, when started by hand', async () => {
    vi.useFakeTimers({ now: at(10, 40), toFake: ['Date'] });

    startLiveShift(template(), { date: DATE });
    await settle();

    vi.useRealTimers();

    expect(shiftSent()).toMatchObject({ actual_start: '10:40', worked: false });
    expect(shiftSent()?.actual_end).toBeNull();
    expect(useLive.getState().live).toMatchObject({ date: DATE, startedAt: at(10, 40) });
    // Nothing of the person's to take back, and no banner offering to.
    expect(useCalendar.getState().undoStack).toHaveLength(0);
  });

  it('writes the start on what the server holds now, on the version it read', async () => {
    server.set(DATE, { ...day(entry()), version: 7, tips: 500 });

    startLiveShift(template(), { date: DATE });
    await settle();

    expect(sent()).toMatchObject({ version: 7, tips: 500 });
    expect(shiftSent()?.actual_start).not.toBeNull();
  });

  it('takes an explicit start without writing anything: the plan already says it', async () => {
    startLiveShift(template(), { date: DATE, startedAt: at(11) });
    await settle();

    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).toMatchObject({ date: DATE, startedAt: at(11) });
  });

  it('runs on the entry’s own date, the night a shift began', () => {
    startLiveShift(template(), { date: '2026-11-05', startedAt: at(1) });

    expect(useLive.getState().live?.date).toBe('2026-11-05');
  });

  it('remembers whether the day held the shift, for a close that finds it missing', () => {
    startLiveShift(template(), { date: DATE, startedAt: at(11) });

    expect(useLive.getState().live?.placed).toBe(true);

    holding(day());
    startLiveShift(template(), { date: DATE, startedAt: at(11) });

    expect(useLive.getState().live?.placed).toBe(false);
  });

  it('counts on the close, on a shift that clocks itself', () => {
    startLiveShift(template(), { date: DATE, startedAt: at(11) });

    expect(useLive.getState().live?.autoClock).toBe(true);
  });

  it('does not count on the close by hand on a shift told to keep out, nor on one that does not clock itself', () => {
    holding(day(entry({ auto_closed: true })));
    startLiveShift(template(), { date: DATE });

    expect(useLive.getState().live?.autoClock).toBe(false);

    holding(day(entry()));
    startLiveShift(template({ auto_clock: false }), { date: DATE });

    expect(useLive.getState().live?.autoClock).toBe(false);
  });

  it('remembers that through a reload, and reads a clock from before it as not counting', () => {
    const stored = (over: Partial<LiveShift>) => JSON.stringify(clock({ startedAt: Date.now(), ...over }));

    vi.stubGlobal('localStorage', { getItem: () => stored({ autoClock: true }), removeItem: () => undefined });
    syncLive();

    expect(useLive.getState().live?.autoClock).toBe(true);

    vi.stubGlobal('localStorage', { getItem: () => stored({}), removeItem: () => undefined });
    syncLive();

    expect(useLive.getState().live?.autoClock).toBe(false);
  });

  it('will not start a shift out for cover', () => {
    holding(day(entry({ needs_cover: true })));

    startLiveShift(template(), { date: DATE });

    expect(useLive.getState().live).toBeNull();
  });

  it('has nothing to write on a day the shift is not placed on', async () => {
    holding(day());

    startLiveShift(template(), { date: DATE });
    await settle();

    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).not.toBeNull();
  });
});

describe('moveLiveShift', () => {
  it('moves the clock and nothing else', () => {
    useLive.setState({ live: clock({ breakMs: 5 }) });

    moveLiveShift(at(10, 30));

    expect(useLive.getState().live).toMatchObject({ startedAt: at(10, 30), breakMs: 5 });
  });
});

describe('finishLiveShift', () => {
  // A minute after Friday's close, which is what a close by itself reads the
  // day against.
  beforeEach(() => {
    vi.useFakeTimers({ now: at(23, 1), toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops at the given moment, not at the moment anybody looked', async () => {
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(shiftSent()).toMatchObject({ worked: true, actual_start: '11:00', actual_end: '23:00' });
    expect(useLive.getState().live).toBeNull();
  });

  it('closes quietly by itself: no overlay, and the entry says so', async () => {
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(done).not.toHaveBeenCalled();
    expect(shiftSent()?.auto_closed).toBe(true);
    expect(useCalendar.getState().undoStack).toHaveLength(0);
  });

  describe('at the sixteen-hour limit', () => {
    const limit = { byItself: true, atLimit: true };

    it('keeps the current time as the end, stamps the close and shows no overlay', async () => {
      useLive.setState({ live: clock({ placed: true }) });

      await expect(finishLiveShift(template({ auto_clock: false }), limit)).resolves.toBe('written');

      expect(shiftSent()).toMatchObject({ worked: true, actual_start: '11:00', actual_end: '23:01', auto_closed: true });
      expect(done).not.toHaveBeenCalled();
    });

    it('decides on the fresh read: a shift gone from the server does not come back as sixteen hours worked', async () => {
      // The held copy still shows it, which is all the limit used to look at.
      server.set(DATE, day());
      useLive.setState({ live: clock({ placed: true }) });

      await expect(finishLiveShift(template(), limit)).resolves.toBe('gone');

      expect(api.saveDay).not.toHaveBeenCalled();
      expect(useLive.getState().live).toBeNull();
    });

    it.each([
      ['twenty and a half hours on', 20.5],
      ['twenty-five and a half, which would wrap past a whole day', 25.5],
    ])('records the limit and not the moment the tab woke: %s', async (_, hours) => {
      vi.useFakeTimers({ now: at(11) + hours * 3600_000, toFake: ['Date'] });
      useLive.setState({ live: clock({ placed: true, startedAt: at(11) }) });

      const outcome = await finishLiveShift(template({ auto_clock: false }), limit);

      vi.useRealTimers();

      expect(outcome).toBe('written');
      expect(shiftSent()).toMatchObject({ worked: true, actual_start: '11:00', actual_end: '03:00', auto_closed: true });
    });

    it('rolls a pause still open into the break only up to the limit', async () => {
      vi.useFakeTimers({ now: at(11) + 20 * 3600_000, toFake: ['Date'] });
      useLive.setState({ live: clock({ placed: true, startedAt: at(11), pausedAt: at(11) + 15 * 3600_000 }) });

      await finishLiveShift(template({ auto_clock: false }), limit);

      vi.useRealTimers();

      expect(shiftSent()).toMatchObject({ actual_end: '03:00', break_minutes: 60 });
    });

    it('lets a shift planned past the limit reach the end of its plan', async () => {
      holding(day(entry({ start_time: '08:00', end_time: '02:00' })));
      vi.useFakeTimers({ now: at(8) + 20 * 3600_000, toFake: ['Date'] });
      useLive.setState({ live: clock({ placed: true, startedAt: at(8) }) });

      await finishLiveShift(template({ auto_clock: false, start_time: '08:00', end_time: '02:00' }), limit);

      vi.useRealTimers();

      expect(shiftSent()).toMatchObject({ actual_start: '08:00', actual_end: '02:00' });
    });

    it.each([
      ['manual, nothing written yet', false, null],
      ['closing by itself, nothing written yet', true, null],
      ['closing by itself, with its own start written on the day', true, '18:00'],
    ])('records the start plus the limit for a clock started after its plan ended: %s', async (_, auto_clock, actual_start) => {
      const early = { start_time: '09:00', end_time: '17:00' };

      holding(day(entry({ ...early, actual_start })));
      vi.useFakeTimers({ now: at(18) + 23.6 * 3600_000, toFake: ['Date'] });
      useLive.setState({ live: clock({ placed: true, startedAt: at(18) }) });

      const outcome = await finishLiveShift(template({ ...early, auto_clock }), limit);

      vi.useRealTimers();

      expect(outcome).toBe('written');
      expect(shiftSent()).toMatchObject({ worked: true, actual_start: '18:00', actual_end: '10:00', auto_closed: true });
    });

    it('goes by an end said on the day, which its own guess does not overrule', async () => {
      server.set(DATE, day(entry({ actual_end: '20:00' })));
      vi.useFakeTimers({ now: at(11) + 17 * 3600_000, toFake: ['Date'] });
      useLive.setState({ live: clock({ placed: true, startedAt: at(11) }) });

      const outcome = await finishLiveShift(template({ auto_clock: false }), limit);

      vi.useRealTimers();

      expect(outcome).toBe('written');
      expect(shiftSent()).toMatchObject({ worked: true, actual_start: '11:00', actual_end: '20:00', auto_closed: true });
    });

    it('takes no end from before the clock started for one said about this clock', async () => {
      const early = { start_time: '09:00', end_time: '17:00' };

      holding(day(entry({ ...early, actual_end: '17:30' })));
      vi.useFakeTimers({ now: at(18) + 17 * 3600_000, toFake: ['Date'] });
      useLive.setState({ live: clock({ placed: true, startedAt: at(18) }) });

      await finishLiveShift(template({ ...early, auto_clock: false }), limit);

      vi.useRealTimers();

      expect(shiftSent()).toMatchObject({ actual_start: '18:00', actual_end: '10:00' });
    });

    // Its end is a guess, so it overrules no answer already on the day. The
    // phone waits on all of these too, and the two have to agree.
    it.each([
      ['flipped back to Planned over a close, the plan still copied on it', { actual_start: '11:00', actual_end: '23:00' }, true],
      ['the same, on a clock started by hand since', { actual_start: '11:00', actual_end: '23:00' }, false],
      ['with a start somebody recorded', { actual_start: '10:50' }, false],
      ['with no times on it, on a clock that did not count on the close', {}, false],
    ])('leaves a shift told to keep out and keeps the clock: %s', async (_, edges, autoClock) => {
      server.set(DATE, day(entry({ auto_closed: true, ...edges })));
      vi.useFakeTimers({ now: at(11) + 22 * 3600_000, toFake: ['Date'] });
      useLive.setState({ live: clock({ placed: true, startedAt: at(11), autoClock }) });

      const outcome = await finishLiveShift(template(), limit);

      vi.useRealTimers();

      expect(outcome).toBe('wait');
      expect(api.saveDay).not.toHaveBeenCalled();
      expect(useLive.getState().live).not.toBeNull();
    });

    it('stops a clock that counted on the close over a discard, with nothing left to record', async () => {
      server.set(DATE, day(entry({ auto_closed: true })));
      useLive.setState({ live: clock({ placed: true, autoClock: true }) });

      await expect(finishLiveShift(template(), limit)).resolves.toBe('gone');

      expect(api.saveDay).not.toHaveBeenCalled();
      expect(useLive.getState().live).toBeNull();
    });

    it.each([
      ['from the phone, on the plan’s own times', entry({ worked: true, actual_start: '11:00', actual_end: '23:00' })],
      ['with no times on it', entry({ worked: true })],
      ['closed by the server', entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '23:00' })],
    ])('takes a worked entry for finished: the clock stops and the day stays, %s', async (_, worked) => {
      server.set(DATE, day(worked));
      vi.useFakeTimers({ now: at(11) + 17 * 3600_000, toFake: ['Date'] });
      useLive.setState({ live: clock({ placed: true, startedAt: at(11) }) });

      const outcome = await finishLiveShift(template({ auto_clock: false }), limit);

      vi.useRealTimers();

      expect(outcome).toBe('gone');
      expect(api.saveDay).not.toHaveBeenCalled();
      expect(useLive.getState().live).toBeNull();
      expect(done).not.toHaveBeenCalled();
    });

    it('takes a worked entry queued from this device for finished too', async () => {
      const edits = { shifts: [{ ...toSavePayload(day(entry())).shifts[0], worked: true, actual_end: '22:00' }] };

      queue.all.mockResolvedValue([queuedEdit(edits)]);
      useCalendar.setState({ pendingOffline: 1 });
      useLive.setState({ live: clock({ placed: true }) });

      await expect(finishLiveShift(template({ auto_clock: false }), limit)).resolves.toBe('gone');

      expect(api.saveDay).not.toHaveBeenCalled();
      expect(useLive.getState().live).toBeNull();
    });

    it('takes the server’s worked for finished under a queued flip back to Planned: the flip is still on its way', async () => {
      const worked = entry({ worked: true, actual_start: '11:00', actual_end: '23:00' });
      const edits = { shifts: [{ ...toSavePayload(day(worked)).shifts[0], worked: false }] };

      server.set(DATE, day(worked));
      queue.all.mockResolvedValue([queuedEdit(edits, [worked])]);
      useCalendar.setState({ pendingOffline: 1 });
      useLive.setState({ live: clock({ placed: true }) });

      await expect(finishLiveShift(template({ auto_clock: false }), limit)).resolves.toBe('gone');

      expect(api.saveDay).not.toHaveBeenCalled();
    });

    it('does not wait for a plan that has no say in it', async () => {
      // A later end typed elsewhere would make a close wait; the limit is the limit.
      server.set(DATE, day(entry({ actual_end: '23:40' })));
      useLive.setState({ live: clock({ placed: true }) });

      await expect(finishLiveShift(template(), limit)).resolves.toBe('written');
    });

    it('waits for the next look over a day it cannot read', async () => {
      api.days.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      useLive.setState({ live: clock({ placed: true }) });

      await expect(finishLiveShift(template(), limit)).resolves.toBe('wait');

      expect(api.saveDay).not.toHaveBeenCalled();
      expect(useLive.getState().live).not.toBeNull();
    });
  });

  describe('over a start on the plan’s own hour that no close put there', () => {
    const recorded = entry({ worked: true, actual_start: '11:00', actual_end: '23:00' });

    it.each([
      ['a clock started late', at(11, 20)],
      ['a clock started early', at(10, 40)],
    ])('leaves it alone, and writes nothing: %s', async (_, startedAt) => {
      holding(day(recorded));
      useLive.setState({ live: clock({ startedAt, placed: true }) });

      await expect(finishLiveShift(template(), { endAt: at(23), byItself: true })).resolves.toBe('gone');

      expect(api.saveDay).not.toHaveBeenCalled();
      expect(useLive.getState().live).toBeNull();
    });

    it('goes by it on a finish by hand too', async () => {
      holding(day(recorded));
      useLive.setState({ live: clock({ startedAt: at(11, 20), placed: true }) });

      await finishLiveShift(template(), { endAt: at(22) });

      expect(shiftSent()?.actual_start).toBe('11:00');
    });
  });

  it('keeps a start somebody settled, on a finish by hand too', async () => {
    holding(day(entry({ worked: true, actual_start: '10:50' })));
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(22) });

    expect(shiftSent()?.actual_start).toBe('10:50');
  });

  it.each([
    ['by hand', false],
    ['by itself', true],
  ])('keeps a start recorded on a shift still planned, %s: ten minutes of pay rest on it', async (_, byItself) => {
    // The phone saved it after this tab last looked, so the store cannot say.
    server.set(DATE, day(entry({ actual_start: '10:50' })));
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(23), byItself });

    expect(shiftSent()).toMatchObject({ worked: true, actual_start: '10:50', actual_end: '23:00' });
  });

  it('counts a start on a planned shift even where it is the plan’s own time: a close copies only onto a worked one', async () => {
    server.set(DATE, day(entry({ actual_start: '11:00' })));
    useLive.setState({ live: clock({ startedAt: at(10, 40) }) });

    await finishLiveShift(template(), { endAt: at(23) });

    expect(shiftSent()?.actual_start).toBe('11:00');
  });

  it('writes its own start over the one it wrote itself', async () => {
    server.set(DATE, day(entry({ actual_start: '10:40' })));
    useLive.setState({ live: clock({ startedAt: at(10, 40) }) });

    await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(shiftSent()?.actual_start).toBe('10:40');
  });

  it('still celebrates a finish by hand, and leaves the entry unstamped', async () => {
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(22) });

    expect(done).toHaveBeenCalledTimes(1);
    expect((done.mock.calls[0][0] as CustomEvent).type).toBe(SHIFT_DONE_EVENT);
    expect(shiftSent()?.auto_closed).toBe(false);
  });

  it('rolls a pause still open into the break, up to the close', async () => {
    useLive.setState({ live: clock({ breakMs: 10 * 60_000, pausedAt: at(22, 30) }) });

    await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(shiftSent()?.break_minutes).toBe(40);
  });

  it('keeps the planned break when nobody paused a clock that ran by itself', async () => {
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(shiftSent()?.break_minutes).toBe(30);
  });

  it('keeps the planned break on a finish by hand too: pressing Finish pays what leaving it alone pays', async () => {
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(22) });

    expect(shiftSent()?.break_minutes).toBe(30);
  });

  it('keeps the break the day holds now, not the template’s', async () => {
    server.set(DATE, day(entry({ break_minutes: 45 })));
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(22) });

    expect(shiftSent()?.break_minutes).toBe(45);
  });

  it.each([
    ['by hand', false],
    ['by itself', true],
  ])('reads a stray tap of a pause as no pause at all, %s', async (_, byItself) => {
    useLive.setState({ live: clock({ breakMs: 20_000 }) });

    await finishLiveShift(template(), { endAt: at(23), byItself });

    expect(shiftSent()?.break_minutes).toBe(30);
  });

  it('draws the line for a pause at thirty seconds, the same line the phone draws', async () => {
    useLive.setState({ live: clock({ breakMs: 30_000 }) });
    await finishLiveShift(template(), { endAt: at(23) });
    expect(shiftSent()?.break_minutes).toBe(30);

    useLive.setState({ live: clock({ breakMs: 31_000 }) });
    await finishLiveShift(template(), { endAt: at(23) });
    expect(shiftSent()?.break_minutes).toBe(1);
  });

  it('gives a shift placed by the finish the template’s break, never nothing', async () => {
    holding(day());
    useLive.setState({ live: clock() });

    await finishLiveShift(template({ break_minutes: 45 }), { endAt: at(22) });

    expect(shiftSent()?.break_minutes).toBe(45);
  });

  it.each([
    ['by hand', false],
    ['by itself', true],
  ])('keeps the clock when the save is refused, %s: it alone holds the real times', async (_, byItself) => {
    api.saveDay.mockRejectedValueOnce(new HttpError(500, 'Broken.'));
    useLive.setState({ live: clock({ breakMs: 45 * 60_000 }) });

    expect(await finishLiveShift(template(), { endAt: at(23), byItself })).toBe('wait');

    expect(useLive.getState().live).toMatchObject({ breakMs: 45 * 60_000 });
    expect(done).not.toHaveBeenCalled();
  });

  describe('with a typed save waiting behind its own', () => {
    /** The clock's save held open, a save typed meanwhile behind it. */
    const behindIt = async (fail: unknown, byItself: boolean) => {
      let refuse!: (error: unknown) => void;

      api.saveDay.mockImplementationOnce(() => new Promise((_, no) => { refuse = no; }));
      useLive.setState({ live: clock({ breakMs: 45 * 60_000 }) });

      const finishing = finishLiveShift(template(), { endAt: at(23), byItself });

      await flushed();

      const { saveDay } = await import('@/lib/store/calendar');

      void saveDay(DATE, { ...toPayload(), tips: 75, version: 3 });
      refuse(fail);

      return finishing;
    };

    it.each([
      ['by hand', false],
      ['by itself', true],
    ])('keeps the clock when the typed one lands in place of its refused one, %s', async (_, byItself) => {
      expect(await behindIt(new HttpError(500, 'Broken.'), byItself)).toBe('wait');

      expect(sent()?.tips).toBe(75);
      expect(useLive.getState().live).toMatchObject({ breakMs: 45 * 60_000 });
      expect(done).not.toHaveBeenCalled();
    });

    it('keeps the clock when the typed one is what the queue took', async () => {
      expect(await behindIt(new TypeError('Failed to fetch'), false)).toBe('wait');

      expect(queue.put.mock.calls.at(-1)?.[0].body).toMatchObject({ tips: 75 });
      expect(useLive.getState().live).not.toBeNull();
      expect(done).not.toHaveBeenCalled();
    });
  });

  describe('with a save typed while its own is on the wire', () => {
    /** A save built on the day the store holds, with the clock's write held open under it. */
    const typedBehind = async (edits: Partial<DaySave>, write: () => Promise<unknown>) => {
      const answered = api.saveDay.getMockImplementation();
      let release!: () => void;

      api.saveDay.mockImplementationOnce(async (date, body) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });

        return (answered as typeof calendarApi.saveDay)(date, body);
      });

      const writing = write();

      await flushed();

      const { saveDay } = await import('@/lib/store/calendar');

      void saveDay(DATE, { ...toSavePayload(useCalendar.getState().days.get(DATE)), version: 3, ...edits });
      release();
      await writing;
      await settle();
    };

    it('goes over the finish that landed, instead of undoing it on the new version', async () => {
      useLive.setState({ live: clock() });

      await typedBehind({ tips: 77 }, () => finishLiveShift(template(), { endAt: at(22) }));

      expect(api.saveDay).toHaveBeenCalledTimes(2);
      expect(sent()).toMatchObject({ version: 4, tips: 77 });
      expect(shiftSent()).toMatchObject({ worked: true, actual_start: '11:00', actual_end: '22:00' });
      expect(server.get(DATE)?.shifts[0]).toMatchObject({ worked: true, actual_end: '22:00' });
    });

    it('does the same on a day the server had nothing of, where the finish placed the shift', async () => {
      server.clear();
      useCalendar.setState({ days: new Map() });
      useLive.setState({ live: clock({ placed: false }) });

      await typedBehind({ tips: 77 }, () => finishLiveShift(template(), { endAt: at(22) }));

      expect(sent()).toMatchObject({ version: 1, tips: 77 });
      expect(shiftSent()).toMatchObject({ worked: true, actual_end: '22:00' });
    });

    it('takes what the read behind that write brought in, which the store had not heard', async () => {
      server.set(DATE, { ...day(entry()), version: 7, tips: 500 });
      useLive.setState({ live: clock() });

      await typedBehind({ note: 'typed here' }, () => finishLiveShift(template(), { endAt: at(22) }));

      expect(sent()).toMatchObject({ version: 8, tips: 500, note: 'typed here' });
    });

    it('stays on its old version where it and the clock said different things, to be refused and asked about', async () => {
      useLive.setState({ live: clock() });

      const rows = toSavePayload(day(entry())).shifts.map((row) => ({ ...row, actual_end: '21:00' }));

      await typedBehind({ shifts: rows }, () => finishLiveShift(template(), { endAt: at(22) }));

      expect(sent()?.version).toBe(3);
      expect(shiftSent()?.actual_end).toBe('21:00');
    });

    it('goes back to following the version once it has landed, each save after it being built on the last', async () => {
      const { saveDay } = await import('@/lib/store/calendar');
      const answered = api.saveDay.getMockImplementation();
      let release!: () => void;

      api.saveDay.mockImplementationOnce(async (date, body) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });

        return (answered as typeof calendarApi.saveDay)(date, body);
      });

      useLive.setState({ live: clock() });

      const finishing = finishLiveShift(template(), { endAt: at(22) });

      await flushed();
      void saveDay(DATE, { ...toSavePayload(useCalendar.getState().days.get(DATE)), version: 3, tips: 77 });

      api.saveDay.mockImplementationOnce(async (date, body) => {
        void saveDay(date, { ...body, tips: 88, version: body.version });

        return (answered as typeof calendarApi.saveDay)(date, body);
      });

      release();
      await finishing;
      await settle();

      expect(api.saveDay).toHaveBeenCalledTimes(3);
      expect(sent()).toMatchObject({ tips: 88, version: 5 });
    });
  });

  it('counts its own save landed, whatever becomes of one typed after it', async () => {
    let answer!: (value: CalendarDayData) => void;

    api.saveDay
      .mockImplementationOnce(() => new Promise((yes) => { answer = yes; }))
      .mockRejectedValueOnce(new HttpError(500, 'Broken.'));
    useLive.setState({ live: clock() });

    const finishing = finishLiveShift(template(), { endAt: at(23), byItself: true });

    await flushed();

    const { saveDay } = await import('@/lib/store/calendar');

    void saveDay(DATE, { ...toPayload(), tips: 75, version: 3 });
    answer({ ...day(entry({ worked: true, auto_closed: true })), version: 4 });

    expect(await finishing).toBe('written');
    expect(useLive.getState().live).toBeNull();
  });

  it('keeps the clock on a finish by hand that lost the day twice, with the choice put to the person', async () => {
    api.saveDay.mockRejectedValue(new HttpError(409, 'Changed elsewhere.'));
    useLive.setState({ live: clock() });

    expect(await finishLiveShift(template(), { endAt: at(22) })).toBe('wait');

    expect(useLive.getState().live).not.toBeNull();
    expect(done).not.toHaveBeenCalled();
    expect(useCalendar.getState().conflict?.date).toBe(DATE);
  });

  it('keeps the clock on a close that lost the day twice, with nothing put to anybody', async () => {
    api.saveDay.mockRejectedValue(new HttpError(409, 'Changed elsewhere.'));
    useLive.setState({ live: clock() });

    expect(await finishLiveShift(template(), { endAt: at(23), byItself: true })).toBe('wait');

    expect(useLive.getState().live).not.toBeNull();
    expect(useCalendar.getState().conflict).toBeNull();
  });

  it('lands the real times over a close the store has not seen, echoing it from the read', async () => {
    // The server closed it a moment ago; the store still reads planned.
    server.set(DATE, day(entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '23:00' })));
    useLive.setState({ live: clock({ startedAt: at(10, 40) }) });

    await finishLiveShift(template(), { endAt: at(23) });

    expect(shiftSent()).toMatchObject({ worked: true, actual_start: '10:40', actual_end: '23:00', auto_closed: true });
  });

  it('writes on what the server holds now, on the version it read, not on the tab’s old copy', async () => {
    // The phone saved tips, a note and sales since this tab last looked.
    server.set(DATE, {
      ...day(entry()),
      version: 7,
      tips: 500,
      note: 'from the phone',
      sales: [{ sales_id: 3, name: 'Tea', quantity: 2, unit_price: 10, percentage: 5, earned: 1 }],
    });
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(sent()).toMatchObject({
      version: 7,
      tips: 500,
      note: 'from the phone',
      sales: [{ sales_id: 3, quantity: 2 }],
    });
  });

  it('reads again and retries once when the day moves between the read and the write', async () => {
    const opened = vi.fn();

    useCalendar.subscribe((state) => {
      if (state.conflict !== null) opened();
    });

    api.saveDay.mockImplementationOnce(async () => {
      server.set(DATE, { ...day(entry()), version: 8, tips: 900 });

      throw new HttpError(409, 'Changed elsewhere.');
    });

    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(api.saveDay).toHaveBeenCalledTimes(2);
    expect(sent()).toMatchObject({ version: 8, tips: 900 });
    expect(shiftSent()?.worked).toBe(true);
    expect(useLive.getState().live).toBeNull();
    expect(opened).not.toHaveBeenCalled();
  });

  it('echoes a close it has seen, so the worked flag is taken as an answer', async () => {
    holding(day(entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '23:00' })));
    useLive.setState({ live: clock({ startedAt: at(10, 40) }) });

    await finishLiveShift(template(), { endAt: at(23) });

    expect(shiftSent()).toMatchObject({ actual_start: '10:40', auto_closed: true });
  });

  it('reads an unheld day in first, rather than wipe it with a blank one', async () => {
    useCalendar.setState({ days: new Map() });
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(sent()?.tips).toBe(40);
  });

  it.each([
    ['held', () => undefined],
    ['not held', () => useCalendar.setState({ days: new Map() })],
  ])('will not close by itself over a day it cannot read, %s or not, and tries again later', async (_, setUp) => {
    setUp();
    api.days.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).not.toBeNull();
  });

  it('carries tips still waiting in the offline queue, and only then forgets them', async () => {
    const waiting = queuedEdit({ tips: 1500 });

    queue.all.mockResolvedValueOnce([waiting]).mockResolvedValueOnce([waiting]).mockResolvedValueOnce([]);
    useCalendar.setState({ pendingOffline: 1 });
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(23), byItself: true });
    await settle();

    expect(sent()?.tips).toBe(1500);
    expect(queue.remove).toHaveBeenCalledWith(DATE);
    expect(useCalendar.getState().pendingOffline).toBe(0);
  });

  it('carries queued tips into a finish that has to wait for the network itself', async () => {
    const waiting = { ...toPayload(), tips: 1500, shifts: [{ shift_id: 1, worked: false, needs_cover: false }] };

    holding({ ...day(entry()), tips: 1500, queued_at: 7 });
    api.days.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    api.saveDay.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    queue.all.mockResolvedValue([{ date: DATE, body: waiting, queuedAt: 7 }]);
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(22) });

    expect(queue.put.mock.calls.at(-1)?.[0].body).toMatchObject({ tips: 1500 });
  });

  it('falls back on the held copy for a finish by hand, version and all, so a stale one is refused', async () => {
    holding({ ...day(entry()), version: 6 });
    api.days.mockRejectedValueOnce(new HttpError(500, 'Broken.'));
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(22) });

    expect(sent()).toMatchObject({ version: 6, tips: 40 });
    expect(shiftSent()?.worked).toBe(true);
  });

  it('does not open again on a finish that is waiting for the network', async () => {
    const offline = new TypeError('Failed to fetch');

    api.days.mockRejectedValueOnce(offline);
    api.saveDay.mockRejectedValueOnce(offline);
    useLive.setState({ live: clock() });

    expect(await finishLiveShift(template(), { endAt: at(20) })).toBe('written');

    const { days, templates } = useCalendar.getState();

    expect(useLive.getState().live).toBeNull();
    expect(days.get(DATE)?.shifts[0]).toMatchObject({ worked: true, actual_end: '20:00' });
    expect(clockStep({ now: at(20, 1), today: DATE, days, templates, live: null })).toBeNull();
  });

  it('keeps the clock rather than send a blank day when nothing is held and nothing can be read', async () => {
    useCalendar.setState({ days: new Map() });
    api.days.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(22) });

    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).not.toBeNull();
    expect(done).not.toHaveBeenCalled();
  });

  it('places the shift where the day did not have it', async () => {
    holding(day());
    useLive.setState({ live: clock() });

    await finishLiveShift(template(), { endAt: at(22) });

    expect(shiftSent()).toMatchObject({ shift_id: 1, worked: true, actual_end: '22:00' });
  });

  it('saves once when the button and the clock get there together', async () => {
    useLive.setState({ live: clock() });

    await Promise.all([
      finishLiveShift(template(), { endAt: at(23), byItself: true }),
      finishLiveShift(template()),
    ]);

    expect(api.saveDay).toHaveBeenCalledTimes(1);
  });

  it('waits for a save already on the wire rather than build on what it replaces', async () => {
    let release!: (value: CalendarDayData) => void;

    api.saveDay.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));

    const { saveDay } = await import('@/lib/store/calendar');

    void saveDay(DATE, { ...toPayload(), tips: 75 });
    await Promise.resolve();

    useLive.setState({ live: clock() });

    const finishing = finishLiveShift(template(), { endAt: at(23), byItself: true });

    await Promise.resolve();
    expect(api.saveDay).toHaveBeenCalledTimes(1);

    server.set(DATE, { ...day(entry()), tips: 75, version: 4 });
    release({ ...day(entry()), tips: 75, version: 4 });
    await finishing;

    expect(api.saveDay).toHaveBeenCalledTimes(2);
    expect(sent()).toMatchObject({ tips: 75, version: 4 });
  });

  it('reads again when a save opened while it was reading: its version would carry this straight over it', async () => {
    let answerRead!: () => void;

    api.days.mockReturnValueOnce(
      new Promise((resolve) => {
        answerRead = () => resolve({ ...EMPTY_SUMMARY, days: [day(entry())] });
      }),
    );

    useLive.setState({ live: clock() });

    const finishing = finishLiveShift(template(), { endAt: at(23), byItself: true });

    await flushed();

    const { saveDay } = await import('@/lib/store/calendar');
    const typed = saveDay(DATE, { ...toPayload(), tips: 75, version: 3 });

    answerRead();
    await typed;
    await finishing;

    expect(sent()).toMatchObject({ tips: 75, version: 4 });
    expect(shiftSent()?.worked).toBe(true);
  });
});

describe('a close by itself, on the day it just read', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: at(23, 1), toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops a clock whose shift left the day, and puts nothing back', async () => {
    server.set(DATE, day());
    useLive.setState({ live: clock({ placed: true }) });

    const outcome = await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(outcome).toBe('gone');
    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).toBeNull();
  });

  it('counts a day the server no longer has at all as the shift having left it', async () => {
    server.clear();
    useLive.setState({ live: clock({ placed: true }) });

    expect(await finishLiveShift(template(), { endAt: at(23), byItself: true })).toBe('gone');
    expect(api.saveDay).not.toHaveBeenCalled();
  });

  it('still lands a clock that never had a placement to lose', async () => {
    holding(day());
    useLive.setState({ live: clock({ placed: false }) });

    const outcome = await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(outcome).toBe('written');
    expect(shiftSent()).toMatchObject({ shift_id: 1, worked: true, auto_closed: true });
  });

  it('stops a clock that counted on the close when the read says it was discarded, with nothing written', async () => {
    server.set(DATE, day(entry({ auto_closed: true })));
    useLive.setState({ live: clock({ placed: true, autoClock: true }) });

    const outcome = await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(outcome).toBe('gone');
    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).toBeNull();
  });

  it('will not overrule a discard with a clock started by hand since, and keeps the clock', async () => {
    server.set(DATE, day(entry({ auto_closed: true })));
    useLive.setState({ live: clock({ placed: true, autoClock: false }) });

    const outcome = await finishLiveShift(template(), { endAt: at(23), byItself: true });

    expect(outcome).toBe('wait');
    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).not.toBeNull();
    // The store hears what stopped it, so it does not ask again every tick.
    expect(useCalendar.getState().days.get(DATE)?.shifts[0].auto_closed).toBe(true);
  });

  it('waits for an end typed later on another device, rather than close over it', async () => {
    server.set(DATE, day(entry({ actual_end: '23:40' })));
    useLive.setState({ live: clock({ placed: true }) });

    expect(await finishLiveShift(template(), { endAt: at(23), byItself: true })).toBe('wait');
    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).not.toBeNull();
  });

  it('takes no close from a plan over before the clock started, wrapped round to the next day', async () => {
    holding(day(entry({ start_time: '09:00', end_time: '17:00' })));
    vi.useFakeTimers({ now: at(18) + 23.6 * 3600_000, toFake: ['Date'] });
    useLive.setState({ live: clock({ placed: true, startedAt: at(18) }) });

    const outcome = await finishLiveShift(template(), { endAt: at(17) + 24 * 3600_000, byItself: true });

    expect(outcome).toBe('wait');
    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).not.toBeNull();
  });

  it('stops at the end the day says, not the one this tab held', async () => {
    server.set(DATE, day(entry({ actual_end: '22:30' })));
    useLive.setState({ live: clock({ placed: true, pausedAt: at(22) }) });

    await finishLiveShift(template(), { endAt: at(23), byItself: true });

    // The pause still open ran up to that end, and no further.
    expect(shiftSent()).toMatchObject({ actual_end: '22:30', break_minutes: 30 });
  });

  it('never closes a shift out for cover: the clock stops and the request stands', async () => {
    server.set(DATE, day(entry({ needs_cover: true })));
    useLive.setState({ live: clock({ placed: true }) });

    expect(await finishLiveShift(template(), { endAt: at(23), byItself: true })).toBe('gone');
    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).toBeNull();
  });

  it('writes nothing over times somebody settled, and stops the clock', async () => {
    server.set(DATE, day(entry({ worked: true, auto_closed: true, actual_start: '10:50', actual_end: '23:40' })));
    useLive.setState({ live: clock({ placed: true }) });

    expect(await finishLiveShift(template(), { endAt: at(23), byItself: true })).toBe('gone');
    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).toBeNull();
  });

  it('writes the clock’s real start over the plan a close from the server copied in', async () => {
    server.set(DATE, day(entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '23:00' })));
    useLive.setState({ live: clock({ startedAt: at(10, 40), placed: true }) });

    await finishLiveShift(template(), { byItself: true });

    expect(shiftSent()).toMatchObject({ actual_start: '10:40', actual_end: '23:00', auto_closed: true });
  });
});

function toPayload() {
  return { shifts: [], sales: [], tips: null, tips_cash: null, tip_pool: null, deductions: null, note: null, colour: null };
}

/** An edit made on version 3 of the day and held back, as the queue keeps it. */
function queuedEdit(edits: Partial<DaySave>, rows: DayShiftEntry[] = [entry()]) {
  const base = toSavePayload(day(...rows));

  return { date: DATE, body: { ...base, ...edits, version: 3 }, base, queuedAt: 7 };
}

describe('a clock writing over a day with a save still queued', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: at(23, 1), toFake: ['Date'] });
    useCalendar.setState({ pendingOffline: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const closes = () => finishLiveShift(template(), { endAt: at(23), byItself: true });

  it('takes what the phone said where the two disagree, and leaves the queued one to be asked about', async () => {
    const waiting = queuedEdit({ tips: 100 });

    server.set(DATE, { ...day(entry()), version: 4, tips: 1500, note: 'from the phone' });
    queue.all.mockResolvedValue([waiting]);
    useLive.setState({ live: clock({ placed: true }) });

    expect(await closes()).toBe('written');
    await settle();

    expect(sent()).toMatchObject({ version: 4, tips: 1500, note: 'from the phone' });
    expect(shiftSent()).toMatchObject({ worked: true, auto_closed: true });
    expect(queue.remove).not.toHaveBeenCalled();
  });

  it('carries over the fresh read only what the queued edit changed, and then forgets it', async () => {
    const waiting = queuedEdit({ note: 'typed offline' });

    server.set(DATE, { ...day(entry()), version: 4, tips: 1500 });
    queue.all.mockResolvedValueOnce([waiting]).mockResolvedValueOnce([waiting]).mockResolvedValue([]);
    useLive.setState({ live: clock({ placed: true }) });

    await closes();
    await settle();

    expect(sent()).toMatchObject({ version: 4, tips: 1500, note: 'typed offline' });
    expect(queue.remove).toHaveBeenCalledWith(DATE);
  });

  it('does not bring back a shift the server no longer has', async () => {
    server.set(DATE, { ...day(), version: 4 });
    queue.all.mockResolvedValue([queuedEdit({ tips: 100 })]);
    useLive.setState({ live: clock({ placed: true }) });

    expect(await closes()).toBe('gone');

    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).toBeNull();
  });

  it('decides on the read: a queued row cannot hide a request for cover', async () => {
    const asked = entry({ needs_cover: true });
    const edits = { shifts: [{ ...toSavePayload(day(asked)).shifts[0], needs_cover: false }] };

    server.set(DATE, { ...day(asked), version: 4 });
    queue.all.mockResolvedValue([queuedEdit(edits, [asked])]);
    useLive.setState({ live: clock({ placed: true }) });

    expect(await closes()).toBe('gone');
    expect(api.saveDay).not.toHaveBeenCalled();
  });

  it('decides on the read: a queued row cannot hide a discard', async () => {
    server.set(DATE, { ...day(entry({ auto_closed: true })), version: 4 });
    queue.all.mockResolvedValue([queuedEdit({ tips: 100 })]);
    useLive.setState({ live: clock({ placed: true }) });

    await closes();

    expect(api.saveDay).not.toHaveBeenCalled();
  });

  it('honours an end queued from this device: the shift is not over yet', async () => {
    const edits = { shifts: [{ ...toSavePayload(day(entry())).shifts[0], actual_end: '23:40' }] };

    queue.all.mockResolvedValue([queuedEdit(edits)]);
    useLive.setState({ live: clock({ placed: true }) });

    expect(await closes()).toBe('wait');
    expect(api.saveDay).not.toHaveBeenCalled();
  });

  it('keeps a break queued from this device', async () => {
    const waiting = queuedEdit({ shifts: [{ ...toSavePayload(day(entry())).shifts[0], break_minutes: 45 }] });

    queue.all.mockResolvedValueOnce([waiting]).mockResolvedValue([]);
    useLive.setState({ live: clock({ placed: true }) });

    await closes();
    await settle();

    expect(shiftSent()?.break_minutes).toBe(45);
  });

  it('does not write a shift twice over when its row was put on by the queued edit', async () => {
    const edits = { shifts: [{ shift_id: 1, worked: false, needs_cover: false }] };

    server.set(DATE, { ...day(), version: 3 });
    queue.all.mockResolvedValueOnce([{ ...queuedEdit(edits, []) }]).mockResolvedValue([]);
    useLive.setState({ live: clock({ placed: false }) });

    await finishLiveShift(template(), { endAt: at(22) });

    expect(sent()?.shifts).toHaveLength(1);
    expect(shiftSent()).toMatchObject({ worked: true, actual_end: '22:00' });
  });

  it('shows what stopped it to the store, with the queued edit still on top', async () => {
    server.set(DATE, { ...day(entry({ needs_cover: true })), version: 4, tips: 1500 });
    queue.all.mockResolvedValue([queuedEdit({ note: 'typed offline' })]);
    useLive.setState({ live: clock({ placed: true }) });

    await closes();

    expect(useCalendar.getState().days.get(DATE)).toMatchObject({ tips: 1500, note: 'typed offline', version: 4 });
    expect(useCalendar.getState().days.get(DATE)?.shifts[0].needs_cover).toBe(true);
  });
});

describe('cancelLiveShift', () => {
  it('stamps a shift that clocks itself, so it neither reopens nor gets closed as worked', async () => {
    holding(day(entry({ actual_start: '10:40' })));
    useLive.setState({ live: clock({ startedAt: at(10, 40) }) });

    cancelLiveShift();
    await settle();

    expect(useLive.getState().live).toBeNull();
    expect(shiftSent()).toMatchObject({ worked: false, actual_start: null, actual_end: null, auto_closed: true });
  });

  it('writes the discard on what the server holds now, on the version it read', async () => {
    server.set(DATE, { ...day(entry()), version: 7, tips: 500 });
    useLive.setState({ live: clock() });

    cancelLiveShift();
    await settle();

    expect(sent()).toMatchObject({ version: 7, tips: 500 });
  });

  it('stops the clock once the word is on the day, so the next look has nothing to reopen', async () => {
    useLive.setState({ live: clock() });

    const stopped = cancelLiveShift();

    expect(useLive.getState().live).not.toBeNull();

    await expect(stopped).resolves.toBe(true);

    expect(useLive.getState().live).toBeNull();
    expect(useCalendar.getState().days.get(DATE)?.shifts[0].auto_closed).toBe(true);
  });

  it('keeps the clock and queues nothing where the day cannot be read: the server may have closed it', async () => {
    api.days.mockRejectedValue(new TypeError('Failed to fetch'));
    useLive.setState({ live: clock() });

    await expect(cancelLiveShift()).resolves.toBe(false);

    expect(useLive.getState().live).not.toBeNull();
    expect(api.saveDay).not.toHaveBeenCalled();
    expect(queue.put).not.toHaveBeenCalled();
  });

  it('keeps the clock when the save itself is refused, for the same reason', async () => {
    api.saveDay.mockRejectedValue(new HttpError(500, 'Broken.'));
    useLive.setState({ live: clock() });

    await expect(cancelLiveShift()).resolves.toBe(false);

    expect(useLive.getState().live).not.toBeNull();
  });

  it('just stops a clock no close is coming to, read or no read', async () => {
    useCalendar.setState({ templates: [template({ auto_clock: false })] });
    api.days.mockRejectedValue(new TypeError('Failed to fetch'));
    useLive.setState({ live: clock() });

    await expect(cancelLiveShift()).resolves.toBe(true);

    expect(useLive.getState().live).toBeNull();
    expect(queue.put).not.toHaveBeenCalled();
  });

  it('leaves a close the server already made alone too: the clock stops, and the day can still be flipped', async () => {
    const closed = entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '23:00' });

    holding(day(closed));
    useLive.setState({ live: clock() });

    cancelLiveShift();
    await settle();

    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).toBeNull();
    expect(useCalendar.getState().days.get(DATE)?.shifts[0]).toMatchObject({ worked: true, actual_end: '23:00' });
  });

  it('leaves a shift finished by hand alone, however stale the screen it was pressed on', async () => {
    const finished = entry({ worked: true, actual_start: '10:40', actual_end: '20:00' });

    // The store still reads planned; the other device finished it since.
    server.set(DATE, { ...day(finished), version: 5, tips: 700 });
    useLive.setState({ live: clock() });

    cancelLiveShift();
    await settle();

    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).toBeNull();
    // The word that stopped it reaches the store too.
    expect(useCalendar.getState().days.get(DATE)?.shifts[0]).toMatchObject({ worked: true, auto_closed: false });
  });

  it('keeps its hands off a finished entry the store already holds, while the read is out', () => {
    const finished = entry({ worked: true, actual_start: '10:40', actual_end: '20:00' });

    holding(day(finished));
    useLive.setState({ live: clock() });

    cancelLiveShift();

    expect(useCalendar.getState().days.get(DATE)?.shifts[0]).toEqual(finished);
  });

  it('on a shift that does not clock itself, takes back only the edge it wrote', async () => {
    const manual = template({ auto_clock: false });

    useCalendar.setState({ templates: [manual] });
    holding(day(entry({ actual_start: '10:40' })));
    useLive.setState({ live: clock({ startedAt: at(10, 40) }) });

    cancelLiveShift();
    await settle();

    expect(shiftSent()).toMatchObject({ worked: false, actual_start: null });
    expect(shiftSent()?.auto_closed).toBe(false);
  });

  it('on a shift that does not clock itself, leaves a worked entry its start', async () => {
    const manual = template({ auto_clock: false });

    useCalendar.setState({ templates: [manual] });
    holding(day(entry({ worked: true, actual_start: '10:40', actual_end: '20:00' })));
    useLive.setState({ live: clock({ startedAt: at(10, 40) }) });

    cancelLiveShift();
    await settle();

    expect(api.saveDay).not.toHaveBeenCalled();
  });

  it('leaves alone a time somebody typed in', async () => {
    const manual = template({ auto_clock: false });

    useCalendar.setState({ templates: [manual] });
    holding(day(entry({ actual_start: '09:00' })));
    useLive.setState({ live: clock({ startedAt: at(10, 40) }) });

    cancelLiveShift();
    await settle();

    expect(api.saveDay).not.toHaveBeenCalled();
  });

  it('has nothing to save for a clock on a shift never placed', async () => {
    holding(day());
    useLive.setState({ live: clock() });

    cancelLiveShift();
    await settle();

    expect(api.saveDay).not.toHaveBeenCalled();
  });
});

describe('coverLiveShift', () => {
  it('ends the clock with nothing recorded, and asks for cover on what the server holds now', async () => {
    server.set(DATE, { ...day(entry()), version: 7, tips: 500 });
    useLive.setState({ live: clock() });

    coverLiveShift();
    await settle();

    expect(useLive.getState().live).toBeNull();
    expect(sent()).toMatchObject({ version: 7, tips: 500 });
    expect(shiftSent()).toMatchObject({ needs_cover: true, worked: false });
  });

  it('takes off the start its clock wrote, and leaves one somebody typed', async () => {
    holding(day(entry({ actual_start: '10:40' })));
    useLive.setState({ live: clock({ startedAt: at(10, 40) }) });

    coverLiveShift();
    await settle();

    expect(shiftSent()?.actual_start).toBeNull();

    holding(day(entry({ actual_start: '09:00' })));
    useLive.setState({ live: clock({ startedAt: at(10, 40) }) });

    coverLiveShift();
    await settle();

    expect(shiftSent()?.actual_start).toBe('09:00');
  });

  it('keeps the next look from reopening it before the save goes', () => {
    useLive.setState({ live: clock() });

    coverLiveShift();

    const { days, templates } = useCalendar.getState();

    expect(clockStep({ now: at(12), today: DATE, days, templates, live: null })).toBeNull();
  });

  it('keeps a start by hand off it too, meanwhile', () => {
    useLive.setState({ live: clock() });

    coverLiveShift();
    startLiveShift(template(), { date: DATE });

    expect(useLive.getState().live).toBeNull();
  });

  it('leaves the base of a queued save free of it, for the panel’s save behind the press as well', async () => {
    let failRead: (reason: Error) => void = () => undefined;

    // A network going slowly: the panel's own save gets out before the read fails.
    api.days.mockReturnValueOnce(new Promise((_, reject) => (failRead = reject)));
    api.saveDay.mockRejectedValue(new TypeError('Failed to fetch'));
    useLive.setState({ live: clock() });

    coverLiveShift();
    await flushed();

    const payload = toSavePayload(useCalendar.getState().days.get(DATE));

    await saveDay(DATE, { ...payload, shifts: [{ ...payload.shifts[0], needs_cover: true }], version: 3 });

    const queued = queue.put.mock.calls[0][0];

    expect(queued.body.shifts[0].needs_cover).toBe(true);
    expect(queued.base?.shifts[0].needs_cover).toBe(false);

    failRead(new TypeError('Failed to fetch'));
    await settle();
  });

  it('leaves a shift the read says is already over alone', async () => {
    server.set(DATE, day(entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '23:00' })));
    useLive.setState({ live: clock() });

    coverLiveShift();
    await settle();

    expect(api.saveDay).not.toHaveBeenCalled();
    expect(useLive.getState().live).toBeNull();
  });
});

describe('liveTick on a running shift', () => {
  it('meters a Friday against the entry’s own hours, not the template’s', () => {
    useLive.setState({ live: clock() });

    const daily = template({ salary_period: 'day', salary_amount: 1150 });

    // Half of the entry's 11.5 hours; on the template's 10.5 it would read 547.
    expect(liveTick(daily, clock(), at(11) + 5.75 * 3_600_000).earned).toBeCloseTo(575);
    expect(liveTick(template(), clock(), at(11) + 5.75 * 3_600_000).planned).toBe(11.5 * 3_600_000);
  });

  it('takes the weekday’s hours from the template when the entry is not held', () => {
    useCalendar.setState({ days: new Map() });

    expect(liveTick(template(), clock(), at(12)).planned).toBe(11.5 * 3_600_000);
  });
});
