import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calendarApi } from '@/lib/api/calendar';
import { shiftDays } from '@/lib/calendar/calendar-date';
import { DaySave, DayShiftEntry, EMPTY_SUMMARY, ShiftTemplate, toSavePayload } from '@/lib/calendar/models';
import { LiveShift, cancelLiveShift, coverLiveShift, finishLiveShift, startLiveShift, useLive } from '@/lib/live/live-shift';
import { catalogueActions, flushOffline, loadClockDays, saveDay, useCalendar } from '@/lib/store/calendar';
import { PendingDay, offlineQueue } from '@/lib/store/offline';

/**
 * The real worker in front of the real api() and store, which a mock of
 * calendarApi cannot stand in for: what failed here was the two together,
 * a one-day read cached earlier answering for a network that had gone.
 */

vi.mock('@/lib/store/offline', () => ({
  offlineQueue: { all: vi.fn(async () => []), put: vi.fn(async () => true), remove: vi.fn(async () => undefined) },
}));

const queue = vi.mocked(offlineQueue);

const ORIGIN = 'http://localhost';
const DATE = '2026-11-06';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface FetchEventLike {
  request: Request;
  respondWith: (answer: Promise<Response>) => void;
}

/** sw.js as a browser would run it, with its cache kept in a map. Answers the way a page's fetch is answered. */
function pageFetch(network: (request: Request) => Promise<Response>): FetchLike {
  const listeners = new Map<string, (event: FetchEventLike) => void>();
  const kept = new Map<string, Response>();
  const key = (request: Request | string) => (typeof request === 'string' ? new URL(request, ORIGIN).href : request.url);

  const cache = { put: async (request: Request, response: Response) => void kept.set(key(request), response) };
  const caches = {
    open: async () => cache,
    keys: async () => [],
    match: async (request: Request | string) => kept.get(key(request))?.clone(),
  };
  const scope = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: FetchEventLike) => void) => listeners.set(type, listener),
  };

  const source = readFileSync(join(__dirname, '../public/sw.js'), 'utf8');

  new Function('self', 'caches', 'fetch', source)(scope, caches, network);

  return async (input, init) => {
    const request = new Request(new URL(input as string, ORIGIN), init);
    let answer: Promise<Response> | undefined;

    listeners.get('fetch')?.({ request, respondWith: (promise) => (answer = promise) });

    return answer ?? network(request);
  };
}

const template = {
  id: 1,
  name: 'Bar',
  start_time: '11:00',
  end_time: '22:00',
  salary_period: 'hour',
  salary_amount: 200,
  break_minutes: 0,
  hours: 11,
  archived: false,
  week_hours: [],
  auto_clock: true,
} as unknown as ShiftTemplate;

const entry = (over: Partial<DayShiftEntry> = {}) =>
  ({
    shift_id: 1,
    name: 'Bar',
    start_time: '11:00',
    end_time: '22:00',
    hours: 11,
    earned: 0,
    worked: false,
    needs_cover: false,
    actual_start: null,
    actual_end: null,
    break_minutes: 0,
    auto_closed: false,
    ...over,
  }) as DayShiftEntry;

const at = (hours: number, minutes = 0) => new Date(2026, 10, 6, hours, minutes).getTime();

const clock = (): LiveShift => ({
  shiftId: 1,
  date: DATE,
  startedAt: at(11),
  breakMs: 0,
  pausedAt: null,
  breakUntil: null,
  placed: true,
});

let up: boolean;
let readable: boolean;
let server: { version: number; tips: number | null; note: string | null; shifts: DayShiftEntry[] };
let waiting: PendingDay[];

const day = () => ({ date: DATE, sales: [], colour: null, deductions: 0, ...server });

/** A PUT as the server takes one: refused on an old version, the whole day replaced otherwise. */
async function answerPut(request: Request): Promise<Response> {
  const body = (await request.json()) as DaySave;

  if (body.version !== server.version) {
    return new Response(JSON.stringify({ status: 409, message: 'Changed elsewhere.' }), { status: 409 });
  }

  server = {
    version: server.version + 1,
    tips: body.tips,
    note: body.note,
    shifts: body.shifts.map((row) => entry(row as Partial<DayShiftEntry>)),
  };

  return new Response(JSON.stringify(day()), { status: 200 });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('location', { origin: ORIGIN, pathname: '/dashboard' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal('dispatchEvent', vi.fn());
  vi.useFakeTimers({ now: at(22, 1), toFake: ['Date'] });

  up = true;
  readable = true;
  server = { version: 3, tips: null, note: null, shifts: [entry()] };
  waiting = [];

  queue.all.mockImplementation(async () => waiting);
  queue.put.mockImplementation(async (item) => {
    waiting = [...waiting.filter((held) => held.date !== item.date), item];

    return true;
  });
  queue.remove.mockImplementation(async (date) => {
    waiting = waiting.filter((held) => held.date !== date);
  });

  vi.stubGlobal(
    'fetch',
    pageFetch(async (request) => {
      if (!up) throw new TypeError('Failed to fetch');

      if (request.method === 'PUT') return answerPut(request);
      if (!readable) throw new TypeError('Failed to fetch');

      return new Response(JSON.stringify({ ...EMPTY_SUMMARY, days: [day()] }), { status: 200 });
    }),
  );

  useLive.setState({ live: clock() });
  useCalendar.setState({ days: new Map(), templates: [template], dayStatus: new Map(), conflict: null, pendingOffline: 0 });
});

/** Types something here with the network gone, and has the phone save something else meanwhile. */
const offlineThenPhone = async (typed: Partial<DaySave>, phone: Partial<typeof server>) => {
  await calendarApi.days(DATE, DATE);
  useCalendar.setState({ days: new Map([[DATE, day() as never]]) });
  up = false;

  await saveDay(DATE, { ...toSavePayload(day() as never), version: 3, ...typed });

  server = { ...server, ...phone, version: 4 };
  up = true;
};

/** The read that used to end up answering for the server later on. */
const cacheTheDay = () => calendarApi.days(DATE, DATE);

describe('a read a clock write is decided on', () => {
  it('still leaves the offline shell its cached copy, for what is only being shown', async () => {
    await cacheTheDay();
    up = false;

    await expect(calendarApi.days(DATE, DATE)).resolves.toMatchObject({ days: [{ version: 3 }] });
  });

  it('does not answer from that copy once the network has gone', async () => {
    await cacheTheDay();
    up = false;

    await expect(calendarApi.days(DATE, DATE, { fresh: true })).rejects.toBeInstanceOf(TypeError);
  });

  it('leaves no copy behind to answer for it either', async () => {
    await calendarApi.days(DATE, DATE, { fresh: true });
    up = false;

    await expect(calendarApi.days(DATE, DATE)).rejects.toThrow();
  });

  it('makes a close by itself wait for the next look, with the clock and the queue untouched', async () => {
    await cacheTheDay();
    server = { ...server, version: 5, tips: 1500 };
    up = false;

    await expect(finishLiveShift(template, { endAt: at(22), byItself: true })).resolves.toBe('wait');

    expect(useLive.getState().live).not.toBeNull();
    expect(queue.put).not.toHaveBeenCalled();
  });

  it('does not let a cached copy say a removed shift is still there', async () => {
    await cacheTheDay();
    server = { ...server, version: 4, shifts: [] };
    up = false;

    await expect(finishLiveShift(template, { endAt: at(22), byItself: true })).resolves.toBe('wait');

    expect(queue.put).not.toHaveBeenCalled();
  });

  it('builds a finish by hand on what the store holds, not on the older cached copy', async () => {
    await cacheTheDay();
    server = { ...server, version: 4 };
    useCalendar.setState({ days: new Map([[DATE, { ...day(), version: 4 } as never]]) });
    up = false;

    await expect(finishLiveShift(template, { endAt: at(20) })).resolves.toBe('written');

    expect(queue.put.mock.calls[0][0].body).toMatchObject({ version: 4 });
  });

  it('says the server could not be asked, however recently the same days were cached', async () => {
    await calendarApi.days(shiftDays(DATE, -1), DATE);
    up = false;

    await expect(loadClockDays()).resolves.toBe(false);
  });
});

describe('a discard pressed with the network gone', () => {
  it('cannot wipe a shift the server closed under a screen that still reads it as planned', async () => {
    useCalendar.setState({ days: new Map([[DATE, day() as never]]) });

    // The job moves no version, so a queued discard would land on this one.
    const closed = entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '22:00' });

    server = { ...server, shifts: [closed] };
    up = false;

    await expect(cancelLiveShift()).resolves.toBe(false);

    expect(useLive.getState().live).not.toBeNull();
    expect(waiting).toEqual([]);

    up = true;

    await flushOffline();

    expect(server.shifts[0]).toMatchObject({ worked: true, actual_start: '11:00', actual_end: '22:00' });
  });
});

describe('a panel’s own question left open while the phone finished the shift', () => {
  const finished = { worked: true, actual_start: '11:00', actual_end: '20:00' };

  /** The tip refused on 3 and asked about on 4; a finish landing on 5, which a focus tick then reads in. */
  const askedThenFinished = async () => {
    useCalendar.setState({ days: new Map([[DATE, day() as never]]) });

    const typed = { ...toSavePayload(day() as never), version: 3, tips: 100 };

    server = { ...server, tips: 1500, version: 4 };

    await saveDay(DATE, typed);

    expect(useCalendar.getState().conflict).toMatchObject({ date: DATE, mine: { tips: 100 }, askedOn: 4 });

    server = { ...server, version: 5, shifts: [entry(finished)] };

    await loadClockDays();

    expect(useCalendar.getState().days.get(DATE)?.version).toBe(5);
  };

  it('is refused and asked again rather than pairing the old body with the newest version', async () => {
    await askedThenFinished();

    await catalogueActions.overwriteConflict();

    expect(server).toMatchObject({ tips: 1500, version: 5 });
    expect(server.shifts[0]).toMatchObject(finished);
    expect(useCalendar.getState().conflict).toMatchObject({ date: DATE, mine: { tips: 100 }, askedOn: 5 });
  });

  it('still lands where nothing moved since the question', async () => {
    useCalendar.setState({ days: new Map([[DATE, day() as never]]) });

    const typed = { ...toSavePayload(day() as never), version: 3, tips: 100 };

    server = { ...server, tips: 1500, version: 4 };

    await saveDay(DATE, typed);
    await catalogueActions.overwriteConflict();

    expect(server).toMatchObject({ tips: 100, version: 5 });
    expect(useCalendar.getState().conflict).toBeNull();
  });
});

describe('cover pressed with the network gone', () => {
  const pressed = async () => {
    server = { ...server, shifts: [entry({ actual_start: '11:00' })] };
    useCalendar.setState({ days: new Map([[DATE, day() as never]]) });
    up = false;

    coverLiveShift();

    await vi.waitFor(() => expect(waiting).toHaveLength(1));
  };

  it('still hands the shift over when the phone moved the day first', async () => {
    await pressed();

    server = { ...server, note: 'from the phone', version: 4 };
    up = true;

    await flushOffline();

    expect(server).toMatchObject({ note: 'from the phone', version: 5 });
    expect(server.shifts[0]).toMatchObject({ needs_cover: true, actual_start: null, worked: false });
    expect(useCalendar.getState().conflict).toBeNull();
    expect(waiting).toEqual([]);
  });

  it('stays handed over on this screen while it waits to go', async () => {
    await pressed();

    expect(useCalendar.getState().days.get(DATE)?.shifts[0].needs_cover).toBe(true);
  });

  it('can be taken back while it waits, and the shift started again', async () => {
    await pressed();

    const payload = toSavePayload(useCalendar.getState().days.get(DATE));

    await saveDay(DATE, { ...payload, shifts: [{ ...payload.shifts[0], needs_cover: false }], version: 3 });
    startLiveShift(template, { date: DATE, startedAt: at(11) });

    expect(useLive.getState().live).not.toBeNull();
  });
});

describe('a save queued offline, a day that moved, and a clock closing over both', () => {
  const closes = () => finishLiveShift(template, { endAt: at(22), byItself: true });

  it('keeps all three when they say different things', async () => {
    await offlineThenPhone({ note: 'typed offline' }, { tips: 1500 });

    await expect(closes()).resolves.toBe('written');

    expect(server).toMatchObject({ version: 5, tips: 1500, note: 'typed offline' });
    expect(server.shifts[0]).toMatchObject({ worked: true, auto_closed: true });
    expect(waiting).toEqual([]);
  });

  it('never carries a stale tip over the phone’s, and asks about it once the queue goes', async () => {
    await offlineThenPhone({ tips: 100 }, { tips: 1500, note: 'from the phone' });

    await closes();

    expect(server).toMatchObject({ tips: 1500, note: 'from the phone' });
    expect(server.shifts[0].worked).toBe(true);

    await flushOffline();

    expect(useCalendar.getState().conflict).toMatchObject({ date: DATE, mine: { tips: 100, note: 'from the phone' } });
    expect(server.tips).toBe(1500);

    await catalogueActions.dropConflict();

    expect(waiting).toEqual([]);
    expect(server).toMatchObject({ tips: 1500, note: 'from the phone' });
    expect(server.shifts[0].worked).toBe(true);
  });

  it('writes the person’s tip over the day as it stands when they choose theirs, the close surviving it', async () => {
    await offlineThenPhone({ tips: 100 }, { tips: 1500, note: 'from the phone' });

    await closes();
    await flushOffline();
    await catalogueActions.overwriteConflict();

    expect(waiting).toEqual([]);
    expect(server).toMatchObject({ tips: 100, note: 'from the phone' });
    expect(server.shifts[0]).toMatchObject({ worked: true, auto_closed: true });
  });

  describe('with the question left open while the phone finished the shift', () => {
    const finished = { worked: true, actual_start: '11:00', actual_end: '20:00' };

    /** The tip contested and asked about on version 4; a finish landing on 5, which this tab then reads. */
    const askedThenFinished = async () => {
      await offlineThenPhone({ tips: 100 }, { tips: 1500 });
      await flushOffline();

      expect(useCalendar.getState().conflict).toMatchObject({ date: DATE, mine: { tips: 100 } });

      server = { ...server, version: 5, shifts: [entry(finished)] };
      useCalendar.setState({ days: new Map([[DATE, day() as never]]) });
    };

    it('writes the tip over the day as it stands, and the finish stays', async () => {
      await askedThenFinished();

      await catalogueActions.overwriteConflict();

      expect(server).toMatchObject({ tips: 100, version: 6 });
      expect(server.shifts[0]).toMatchObject(finished);
      expect(waiting).toEqual([]);
      expect(useCalendar.getState().conflict).toBeNull();
    });

    it('is refused and asked again where the day cannot be read: the version is the one asked at', async () => {
      await askedThenFinished();
      readable = false;

      await catalogueActions.overwriteConflict();

      expect(server).toMatchObject({ tips: 1500, version: 5 });
      expect(server.shifts[0]).toMatchObject(finished);
      expect(useCalendar.getState().conflict).toMatchObject({ date: DATE, mine: { tips: 100 } });
      expect(waiting).toHaveLength(1);
    });

    it('lands the same way where nothing moved since the question and the read fails', async () => {
      await offlineThenPhone({ tips: 100 }, { tips: 1500 });
      await flushOffline();
      readable = false;

      await catalogueActions.overwriteConflict();

      expect(server).toMatchObject({ tips: 100, version: 5 });
      expect(waiting).toEqual([]);
    });
  });

  it('keeps a finish nobody contested when the person keeps the other side of the tip', async () => {
    useCalendar.setState({ days: new Map([[DATE, day() as never]]) });
    up = false;

    await saveDay(DATE, { ...toSavePayload(day() as never), version: 3, tips: 100 });
    await expect(finishLiveShift(template, { endAt: at(19, 30) })).resolves.toBe('written');

    expect(useLive.getState().live).toBeNull();

    server = { ...server, tips: 1500, version: 4 };
    up = true;

    await flushOffline();

    expect(useCalendar.getState().conflict).toMatchObject({ date: DATE, mine: { tips: 100 } });

    await catalogueActions.dropConflict();

    expect(waiting).toEqual([]);
    expect(server).toMatchObject({ tips: 1500, version: 5 });
    expect(server.shifts[0]).toMatchObject({ worked: true, actual_start: '11:00', actual_end: '19:30' });
  });

  it('lands a finish queued offline over a day the phone moved, instead of wedging the queue', async () => {
    useCalendar.setState({ days: new Map([[DATE, day() as never]]) });
    up = false;

    await expect(finishLiveShift(template, { endAt: at(20) })).resolves.toBe('written');

    server = { ...server, tips: 1500, version: 4 };
    up = true;

    await flushOffline();

    expect(waiting).toEqual([]);
    expect(useCalendar.getState().pendingOffline).toBe(0);
    expect(server).toMatchObject({ tips: 1500, version: 5 });
    expect(server.shifts[0]).toMatchObject({ worked: true, actual_end: '20:00' });
  });
});
