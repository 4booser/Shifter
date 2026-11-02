import { beforeEach, describe, expect, it, vi } from 'vitest';


const server = vi.hoisted(() => ({ calls: [] as { path: string; body?: unknown }[] }));
const answers = vi.hoisted(() => ({ reply: (() => undefined) as (path: string, options?: { method?: string; body?: unknown }) => unknown }));

vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {
    constructor(public status: number) {
      super(`HTTP ${status}`);
    }
  },
  api: async (path: string, options?: { method?: string; body?: unknown }) => {
    server.calls.push({ path, body: options?.body });

    return answers.reply(path, options);
  },
}));

const { ApiError } = await import('@/lib/api');
const { writeDiscardedShift, writeFinishedShift, writeStartedShift } = await import('@/lib/live-finish');
const { hearDay, inTurn } = await import('@/lib/day-writes');
const { dueAutoStop, FORGOTTEN_AFTER } = await import('@/lib/autostart');
const { liveWindow, plannedEndInstant } = await import('@/store/live');

import { CalendarDayData, DaySave, DayShiftEntry } from '@/lib/types';
import { LiveShift } from '@/store/live';

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
    break_minutes: null,
    earned: 0,
    revenue: null,
    guests: null,
    zone: 'unset',
    revenue_percent: null,
    auto_closed: false,
    ...over,
  }) as DayShiftEntry;

const day = (shifts: DayShiftEntry[], version = 3): CalendarDayData =>
  ({
    date: '2026-11-02',
    shifts,
    sales: [],
    tips: 250,
    tips_cash: null,
    tip_pool: null,
    deductions: 0,
    note: null,
    colour: null,
    hours: 0,
    earned: 0,
    planned: 0,
    version,
  }) as CalendarDayData;

const local = (time: string, date = '2026-11-02') => new Date(`${date}T${time}:00`);

const live = (over: Partial<LiveShift> = {}): LiveShift => ({
  date: '2026-11-02',
  shiftId: 4,
  name: 'Вечер',
  symbol: null,
  startedAt: local('11:00').toISOString(),
  hourlyRate: null,
  plannedStart: '11:00',
  plannedEnd: '22:00',
  autoClock: true,
  ...over,
});

/** The day the server holds, and how a PUT is answered. */
function stands(...days: CalendarDayData[]) {
  let reads = 0;
  const refusals: unknown[] = [];

  answers.reply = (path, options) => {
    if (options?.method === 'PUT') {
      const refused = refusals.shift();

      if (refused !== undefined) throw refused;

      return days[days.length - 1];
    }

    const read = days[Math.min(reads, days.length - 1)];

    reads += 1;

    return { days: [read] };
  };

  return { refuseNext: (why: unknown) => refusals.push(why) };
}

const puts = () => server.calls.filter((call) => call.body !== undefined).map((call) => call.body as DaySave);

beforeEach(() => {
  server.calls.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(local('22:01'));
});

describe('a shift closing itself', () => {
  it('writes the start, the close and worked', async () => {
    stands(day([entry()]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('written');
    expect(puts()[0].shifts[0]).toMatchObject({
      worked: true,
      actual_start: '11:00',
      actual_end: '22:00',
      break_minutes: null,
    });
  });

  it('says on the entry that it closed by itself', async () => {
    // Without the stamp the hint to check the times never shows, and a panel
    // holding the old day can write the close away.
    stands(day([entry()]));

    await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(puts()[0].shifts[0].auto_closed).toBe(true);
  });

  it('stamps a close at a chosen hour too, wherever the plan ends', async () => {
    vi.setSystemTime(local('21:31'));
    stands(day([entry()]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('21:30').toISOString(),
      closing: true,
      atHour: true,
    });

    expect(outcome).toBe('written');
    expect(puts()[0].shifts[0]).toMatchObject({ actual_end: '21:30', auto_closed: true });
  });

  it('rolls a pause still open into the break', async () => {
    stands(day([entry()]));

    await writeFinishedShift({
      live: live({ breaks: [{ from: local('21:30').toISOString(), to: null }] }),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(puts()[0].shifts[0].break_minutes).toBe(30);
  });

  it('honours a later end typed since the phone last looked', async () => {
    stands(day([entry({ actual_end: '23:30' })]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('wait');
    expect(puts()).toEqual([]);
  });

  it('closes at an earlier end typed since the phone last looked', async () => {
    stands(day([entry({ actual_end: '21:15' })]));

    await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(puts()[0].shifts[0].actual_end).toBe('21:15');
  });

  it('keeps every other thing on the day', async () => {
    stands(day([entry({ revenue: 5400 })]));

    await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(puts()[0].tips).toBe(250);
    expect(puts()[0].shifts[0].revenue).toBe(5400);
    expect(puts()[0].version).toBe(3);
  });

  it('survives the server having closed it first, with the real times', async () => {
    // A clock started by hand at 10:40 knows better than the plan the close
    // copied in, and echoing the stamp is what lets the times through.
    stands(day([entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '22:00' })]));

    const outcome = await writeFinishedShift({
      live: live({ startedAt: local('10:40').toISOString() }),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('written');
    expect(puts()[0].shifts[0]).toMatchObject({
      worked: true,
      auto_closed: true,
      actual_start: '10:40',
      actual_end: '22:00',
    });
  });

  it('writes nothing over times somebody settled after a close', async () => {
    // Plan 11:00-22:00, closed by the server, corrected on the laptop the next
    // morning. The phone clock, foregrounded after that, only remembers 11:00.
    vi.setSystemTime(local('09:00', '2026-11-03'));
    stands(day([entry({ worked: true, auto_closed: true, actual_start: '10:50', actual_end: '23:40' })]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('gone');
    expect(puts()).toEqual([]);
  });

  it('writes nothing over an end somebody settled, even with the start on plan', async () => {
    vi.setSystemTime(local('23:50'));
    stands(day([entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '23:40' })]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('gone');
    expect(puts()).toEqual([]);
  });

  it('writes nothing over a start somebody settled, even with the end on plan', async () => {
    vi.setSystemTime(local('23:50'));
    stands(day([entry({ worked: true, auto_closed: true, actual_start: '10:50', actual_end: '22:00' })]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('gone');
    expect(puts()).toEqual([]);
  });

  it('does not take the start it wrote itself for somebody’s correction', async () => {
    // Started by hand at 10:40, closed by the server keeping that edge: the
    // pause this clock holds is still the only record of the break.
    stands(day([entry({ worked: true, auto_closed: true, actual_start: '10:40', actual_end: '22:00' })]));

    const outcome = await writeFinishedShift({
      live: live({
        startedAt: local('10:40').toISOString(),
        breaks: [{ from: local('15:00').toISOString(), to: local('15:20').toISOString() }],
      }),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('written');
    expect(puts()[0].shifts[0]).toMatchObject({ actual_start: '10:40', break_minutes: 20 });
  });

  it('stops a clock whose shift was discarded elsewhere, with nothing written', async () => {
    // Left to wait it would run for good: the server skips the stamped entry
    // and the running clock keeps the next day's shift from opening.
    stands(day([entry({ auto_closed: true })]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('gone');
    expect(puts()).toEqual([]);
  });

  it('leaves alone a shift somebody flipped back', async () => {
    stands(day([entry({ auto_closed: true, actual_start: '11:00', actual_end: '22:00' })]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('wait');
    expect(puts()).toEqual([]);
  });

  it('leaves a clock started by hand since the answer to whoever started it', async () => {
    stands(day([entry({ auto_closed: true })]));

    const outcome = await writeFinishedShift({
      live: live({ autoClock: false }),
      endAt: local('22:00').toISOString(),
      closing: true,
      atHour: true,
    });

    expect(outcome).toBe('wait');
    expect(puts()).toEqual([]);
  });

  it('never closes a shift out for cover, and stops the clock', async () => {
    // The server's NeedsCover is !Worked && asked: a closing write would pay
    // an unworked shift and make the request vanish.
    stands(day([entry({ needs_cover: true })]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('gone');
    expect(puts()).toEqual([]);
  });

  it('holds a chosen hour to the same rule', async () => {
    vi.setSystemTime(local('21:31'));
    stands(day([entry({ needs_cover: true })]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('21:30').toISOString(),
      closing: true,
      atHour: true,
    });

    expect(outcome).toBe('gone');
    expect(puts()).toEqual([]);
  });

  it('does not bring back a shift taken off the day', async () => {
    stands(day([]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('gone');
    expect(puts()).toEqual([]);
  });
});

describe('a start recorded while the shift was still planned', () => {
  // Saved on another device under a clock this phone has not re-read: ten
  // minutes of pay the clock's own 11:00 would silently write away.
  it('goes down under a shift closing itself', async () => {
    stands(day([entry({ actual_start: '10:50' })]));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('written');
    expect(puts()[0].shifts[0]).toMatchObject({
      worked: true,
      actual_start: '10:50',
      actual_end: '22:00',
    });
  });

  it.each([
    ['late', '11:20'],
    ['early', '10:40'],
  ])('writes nothing over a start on the plan’s own hour that no close put there: a clock started %s', async (_, started) => {
    vi.setSystemTime(local('22:01'));
    stands(day([entry({ worked: true, actual_start: '11:00', actual_end: '22:00' })]));

    const outcome = await writeFinishedShift({
      live: live({ startedAt: local(started).toISOString() }),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('gone');
    expect(puts()).toEqual([]);
  });

  it('goes by that start on a finish by hand too', async () => {
    vi.setSystemTime(local('22:00'));
    stands(day([entry({ worked: true, actual_start: '11:00', actual_end: '22:00' })]));

    await writeFinishedShift({ live: live({ startedAt: local('11:20').toISOString() }) });

    expect(puts()[0].shifts[0].actual_start).toBe('11:00');
  });

  it('still takes the plan off a stamped entry for what it is: a close copied it there', async () => {
    vi.setSystemTime(local('22:00'));
    stands(day([entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '22:00' })]));

    await writeFinishedShift({ live: live({ startedAt: local('11:20').toISOString() }) });

    expect(puts()[0].shifts[0].actual_start).toBe('11:20');
  });

  it('goes down under a finish by hand', async () => {
    vi.setSystemTime(local('20:00'));
    stands(day([entry({ actual_start: '10:50' })]));

    await writeFinishedShift({ live: live() });

    expect(puts()[0].shifts[0]).toMatchObject({ actual_start: '10:50', actual_end: '20:00' });
  });

  it('wins on the plan’s own hour too, since no close wrote it on a planned entry', async () => {
    stands(day([entry({ actual_start: '11:00' })]));

    await writeFinishedShift({
      live: live({ startedAt: local('11:05').toISOString() }),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(puts()[0].shifts[0].actual_start).toBe('11:00');
  });

  it('is the start the close is judged from, as the server judges it', async () => {
    // From 23:50 an end of 23:30 is the next night's. From the clock's 18:00
    // it would be seven minutes ago, and the phone would close what the
    // server still holds open.
    vi.setSystemTime(local('23:37'));
    stands(day([entry({ start_time: '18:00', end_time: '02:00', actual_start: '23:50', actual_end: '23:30' })]));

    const outcome = await writeFinishedShift({
      live: live({ startedAt: local('18:00').toISOString() }),
      endAt: local('23:30').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('wait');
    expect(puts()).toEqual([]);
  });
});

describe('a clock started after its plan ended', () => {
  // From a start of 18:00 the time rule pushes a 17:00 end to the next day, so
  // this clock used to read as having 23 hours left, and to write them down.
  const NEXT = '2026-11-03';
  const late = (over: Partial<LiveShift> = {}) =>
    live({ startedAt: local('18:00').toISOString(), plannedStart: '09:00', plannedEnd: '17:00', ...over });
  const placed = (over: Partial<DayShiftEntry> = {}) =>
    entry({ start_time: '09:00', end_time: '17:00', actual_start: '18:00', ...over });

  /** What the calendar's tick decides for a template that closes by itself. */
  const tick = (shift: LiveShift) =>
    dueAutoStop({
      stopAt: null,
      startedMs: new Date(shift.startedAt).getTime(),
      plannedEndMs: plannedEndInstant(shift).getTime(),
      closesMs: liveWindow(shift).closes.getTime(),
      now: Date.now(),
    });

  /** And what it does about it. */
  const stop = (shift: LiveShift) => {
    const due = tick(shift)!;

    return writeFinishedShift({
      live: shift,
      endAt: due.endsAt,
      closing: true,
      atHour: !due.closing,
      atLimit: due.atLimit,
    });
  };

  it('is left running up to the limit', () => {
    vi.setSystemTime(local('09:59', NEXT));

    expect(tick(late())).toBeNull();
  });

  it('stops at the limit and records its start plus the limit', async () => {
    vi.setSystemTime(local('11:00', NEXT));
    stands(day([placed()]));

    expect(await stop(late())).toBe('written');
    expect(puts()[0].shifts[0]).toMatchObject({
      worked: true,
      actual_start: '18:00',
      actual_end: '10:00',
      auto_closed: true,
    });
  });

  it('records the limit however late it was noticed, never the wrapped close', async () => {
    vi.setSystemTime(local('17:36', NEXT));
    stands(day([placed()]));

    await stop(late());

    expect(puts()[0].shifts[0].actual_end).toBe('10:00');
  });

  it('stops at the limit a clock from over twelve hours past the plan, never the wrapped close', async () => {
    // The window built from this start lands on the evening before, where the
    // plan looks still to come. Judged there it wrote 22:00 to 17:00.
    const evening = late({ startedAt: local('22:00').toISOString() });

    vi.setSystemTime(local('14:30', NEXT));
    stands(day([placed({ actual_start: '22:00' })]));

    expect(tick(evening)?.atLimit).toBe(true);
    expect(await stop(evening)).toBe('written');
    expect(puts()[0].shifts[0]).toMatchObject({
      worked: true,
      actual_start: '22:00',
      actual_end: '14:00',
      auto_closed: true,
    });
  });

  it('does the same with the start not on the day yet', async () => {
    const evening = late({ startedAt: local('21:30').toISOString() });

    vi.setSystemTime(local('14:30', NEXT));
    stands(day([placed({ actual_start: null })]));

    expect(await stop(evening)).toBe('written');
    expect(puts()[0].shifts[0]).toMatchObject({ actual_start: '21:30', actual_end: '13:30' });
  });

  it('skips an hour chosen against the plan it missed, and records the limit', async () => {
    const shift = late();
    const due = dueAutoStop({
      stopAt: '17:30',
      startedMs: new Date(shift.startedAt).getTime(),
      plannedEndMs: plannedEndInstant(shift).getTime(),
      closesMs: null,
      now: local('17:45', NEXT).getTime(),
    })!;

    vi.setSystemTime(local('17:45', NEXT));
    stands(day([placed()]));

    expect(
      await writeFinishedShift({
        live: { ...shift, autoClock: false },
        endAt: due.endsAt,
        closing: true,
        atHour: !due.closing,
        atLimit: due.atLimit,
      }),
    ).toBe('written');
    expect(puts()[0].shifts[0]).toMatchObject({ actual_start: '18:00', actual_end: '10:00' });
  });

  it('goes by the plan for a night shift too', () => {
    // 03:00 is past a 02:00 end, and the rule would make that the next night's.
    const night = late({
      startedAt: local('03:00', NEXT).toISOString(),
      plannedStart: '22:00',
      plannedEnd: '02:00',
    });

    vi.setSystemTime(new Date(new Date(night.startedAt).getTime() + FORGOTTEN_AFTER - 1));
    expect(tick(night)).toBeNull();

    vi.setSystemTime(new Date(new Date(night.startedAt).getTime() + FORGOTTEN_AFTER));
    expect(tick(night)?.atLimit).toBe(true);
  });

  it('counts a worked entry as finished at the limit: the clock stops and nothing is written', async () => {
    // The limit's end is a guess. Even a close's own copy of the plan outranks it.
    vi.setSystemTime(local('11:00', NEXT));
    stands(day([placed({ worked: true, auto_closed: true, actual_start: '09:00', actual_end: '17:00' })]));

    expect(await stop(late())).toBe('gone');
    expect(puts()).toEqual([]);
  });

  it('leaves a person’s no standing at the limit', async () => {
    vi.setSystemTime(local('11:00', NEXT));
    stands(day([placed({ auto_closed: true, actual_start: '09:00', actual_end: '17:00' })]));

    expect(await stop(late())).toBe('wait');
    expect(puts()).toEqual([]);
  });

  it('stops with nothing written where the shift was thrown away', async () => {
    vi.setSystemTime(local('11:00', NEXT));
    stands(day([placed({ auto_closed: true, actual_start: null })]));

    expect(await stop(late())).toBe('gone');
    expect(puts()).toEqual([]);
  });

  it('does not take the wrapped close from a day that moved the plan behind the clock', async () => {
    // The clock still thinks 23:00 and is told by the read that the plan ended
    // at 17:00, a day after which the wrapped close has come round as well.
    vi.setSystemTime(local('17:30', NEXT));
    stands(day([placed()]));

    const outcome = await writeFinishedShift({
      live: late({ plannedEnd: '23:00' }),
      endAt: local('23:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('wait');
    expect(puts()).toEqual([]);
  });

  it('takes an end said on the day since over the limit’s guess', async () => {
    // The phone woke at the limit with the day it held last night. The read
    // says the shift ended at 23:00, and sixteen hours would overwrite that.
    vi.setSystemTime(local('11:00', NEXT));
    stands(day([placed({ actual_end: '23:00' })]));

    expect(await stop(late())).toBe('written');
    expect(puts()[0].shifts[0]).toMatchObject({ actual_start: '18:00', actual_end: '23:00' });
  });

  it('waits on a close the day has since given it that has not come yet', async () => {
    // Retimed on the laptop to a long night, which the clock has yet to hear.
    vi.setSystemTime(local('11:00', NEXT));
    stands(day([placed({ start_time: '18:00', end_time: '12:00' })]));

    expect(await stop(late())).toBe('wait');
    expect(puts()).toEqual([]);
  });

  it('leaves a clock started before the plan ended to the plan', async () => {
    const shift = late({ startedAt: local('16:00').toISOString() });

    vi.setSystemTime(local('17:01'));
    stands(day([placed({ actual_start: null })]));

    expect(tick(shift)).toMatchObject({ closing: true });
    expect(await stop(shift)).toBe('written');
    expect(puts()[0].shifts[0]).toMatchObject({ actual_start: '16:00', actual_end: '17:00' });
  });
});

describe('the break on a finish', () => {
  const closes = { endAt: local('22:00').toISOString(), closing: true };

  it('leaves the placement’s own break where the clock saw no pause', async () => {
    // The 45 was saved elsewhere. A null here would reset it to the template's.
    stands(day([entry({ break_minutes: 45 })]));

    await writeFinishedShift({ live: live(), ...closes });

    expect(puts()[0].shifts[0].break_minutes).toBe(45);
  });

  it('does the same for a finish by hand', async () => {
    stands(day([entry({ break_minutes: 45 })]));

    await writeFinishedShift({ live: live() });

    expect(puts()[0].shifts[0].break_minutes).toBe(45);
  });

  it('does not read a stray tap on the pause as a break', async () => {
    stands(day([entry({ break_minutes: 45 })]));

    await writeFinishedShift({
      live: live({
        breaks: [
          { from: local('15:00').toISOString(), to: new Date(local('15:00').getTime() + 20_000).toISOString() },
        ],
      }),
      ...closes,
    });

    expect(puts()[0].shifts[0].break_minutes).toBe(45);
  });

  it('writes a real pause, rounded to minutes', async () => {
    stands(day([entry({ break_minutes: 45 })]));

    await writeFinishedShift({
      live: live({
        breaks: [{ from: local('15:00').toISOString(), to: local('15:30').toISOString() }],
      }),
      ...closes,
    });

    expect(puts()[0].shifts[0].break_minutes).toBe(30);
  });

  it('leaves the break to the server on a shift put back by hand', async () => {
    stands(day([]));

    await writeFinishedShift({ live: live() });

    expect(puts()[0].shifts[0].break_minutes).toBeNull();
  });
});

describe('a day that moved under the write', () => {
  it('reads it again once and writes over the new version', async () => {
    const { refuseNext } = stands(day([entry()], 3), day([entry({ worked: true, auto_closed: true })], 4));

    refuseNext(new ApiError(409, 'stale'));

    const outcome = await writeFinishedShift({
      live: live(),
      endAt: local('22:00').toISOString(),
      closing: true,
    });

    expect(outcome).toBe('written');
    expect(puts()).toHaveLength(2);
    expect(puts()[0].version).toBe(3);
    expect(puts()[1].version).toBe(4);
    expect(puts()[1].shifts[0].auto_closed).toBe(true);
  });

  it('gives up after the second refusal rather than going round for ever', async () => {
    const { refuseNext } = stands(day([entry()], 3));

    refuseNext(new ApiError(409, 'stale'));
    refuseNext(new ApiError(409, 'stale'));

    await expect(writeFinishedShift({ live: live() })).rejects.toBeInstanceOf(ApiError);
    expect(puts()).toHaveLength(2);
  });

  it('does not read a network failure as a conflict', async () => {
    const { refuseNext } = stands(day([entry()], 3));

    refuseNext(new Error('нет сети'));

    await expect(writeFinishedShift({ live: live() })).rejects.toThrow('нет сети');
    expect(puts()).toHaveLength(1);
  });
});

describe('finishing by hand', () => {
  it('stamps now where no end is given', async () => {
    vi.setSystemTime(local('20:15'));
    stands(day([entry()]));

    await writeFinishedShift({ live: live() });

    expect(puts()[0].shifts[0].actual_end).toBe('20:15');
  });

  it('puts the shift back if the day lost it, because somebody just said it happened', async () => {
    stands(day([]));

    expect(await writeFinishedShift({ live: live() })).toBe('written');
    expect(puts()[0].shifts).toHaveLength(1);
  });

  it('counts only the break taken before the end', async () => {
    stands(day([entry({ break_minutes: 45 })]));

    await writeFinishedShift({
      live: live({
        breaks: [{ from: local('22:30').toISOString(), to: local('23:00').toISOString() }],
      }),
      endAt: local('22:00').toISOString(),
    });

    expect(puts()[0].shifts[0].break_minutes).toBe(45);
  });

  it('does not stamp the entry as closed by itself', async () => {
    stands(day([entry()]));

    await writeFinishedShift({ live: live() });

    expect(puts()[0].shifts[0].auto_closed).toBe(false);
  });

  it('keeps a start somebody settled, and takes the end from the press', async () => {
    vi.setSystemTime(local('23:10'));
    stands(day([entry({ worked: true, actual_start: '10:50', actual_end: '22:00' })]));

    await writeFinishedShift({ live: live() });

    expect(puts()[0].shifts[0]).toMatchObject({ actual_start: '10:50', actual_end: '23:10' });
  });
});

describe('the day screen, open over a clock write', () => {
  it('hears exactly what the write came back with', async () => {
    const written = day([entry({ actual_start: '10:40' })], 4);
    const heard: (number | undefined)[] = [];
    const stop = hearDay('2026-11-02', (answer) => heard.push(answer.version));

    stands(day([entry()], 3), written);

    await writeStartedShift(live({ startedAt: local('10:40').toISOString() }));
    stop();

    expect(heard).toEqual([4]);
  });

  it('hears nothing of a write that never went out', async () => {
    const heard: unknown[] = [];
    const stop = hearDay('2026-11-02', (answer) => heard.push(answer));

    stands(day([]));

    await writeStartedShift(live());
    stop();

    expect(heard).toEqual([]);
  });

  it('waits for a save that is out, and reads the day after it', async () => {
    let landed = () => undefined as void;
    const out = new Promise<void>((resolve) => {
      landed = resolve;
    });

    stands(day([entry()], 3));

    void inTurn('2026-11-02', () => out);

    const writing = writeStartedShift(live());

    await vi.advanceTimersByTimeAsync(0);
    expect(server.calls).toEqual([]);

    landed();
    await writing;

    expect(puts()).toHaveLength(1);
  });
});

describe('a clock started by hand', () => {
  it('writes its start to the day straight away, as a lone edge', async () => {
    stands(day([entry()]));

    await writeStartedShift(live({ startedAt: local('10:40').toISOString() }));

    expect(puts()[0].shifts[0]).toMatchObject({
      worked: false,
      actual_start: '10:40',
      actual_end: null,
    });
  });

  it('writes nothing for a shift no longer on the day', async () => {
    stands(day([]));

    await writeStartedShift(live());

    expect(puts()).toEqual([]);
  });
});

describe('a running clock thrown away', () => {
  it('tells the close to keep out and takes its edges off', async () => {
    stands(day([entry({ actual_start: '10:40' })]));

    await writeDiscardedShift(live({ startedAt: local('10:40').toISOString() }));

    expect(puts()[0].shifts[0]).toMatchObject({
      worked: false,
      actual_start: null,
      actual_end: null,
      auto_closed: true,
    });
  });

  it('only takes its own start off a shift that does not close itself', async () => {
    stands(day([entry({ actual_start: '10:40' })]));

    await writeDiscardedShift(live({ autoClock: false, startedAt: local('10:40').toISOString() }));

    expect(puts()[0].shifts[0]).toMatchObject({ actual_start: null, auto_closed: false });
  });

  it('leaves a start somebody else set', async () => {
    stands(day([entry({ actual_start: '10:15' })]));

    await writeDiscardedShift(live({ autoClock: false, startedAt: local('10:40').toISOString() }));

    expect(puts()).toEqual([]);
  });

  it('never touches a shift finished by hand', async () => {
    // The stamp would stop anything restoring it: the shift would earn nothing
    // and stay that way, for a press that only meant to drop a stale clock.
    stands(day([entry({ worked: true, actual_start: '10:40', actual_end: '21:30' })]));

    await writeDiscardedShift(live());

    expect(puts()).toEqual([]);
  });

  it('never touches a shift the close has recorded either', async () => {
    stands(day([entry({ worked: true, actual_start: '11:00', actual_end: '22:00', auto_closed: true })]));

    await writeDiscardedShift(live());

    expect(puts()).toEqual([]);
  });

  it('holds to that on a shift that does not close itself', async () => {
    stands(day([entry({ worked: true, actual_start: '11:00', actual_end: '21:30' })]));

    await writeDiscardedShift(live({ autoClock: false }));

    expect(puts()).toEqual([]);
  });
});
