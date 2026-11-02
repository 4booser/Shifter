import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ scheduled: 0 }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

vi.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  scheduleNotificationAsync: async () => {
    store.scheduled += 1;

    return 'alarm';
  },
  cancelScheduledNotificationAsync: async () => undefined,
}));

const { breakSeconds, followEntry, liveFrom, liveWindow, planEndsClock, useLive } = await import('@/store/live');

import { DayShiftEntry, ShiftTemplate } from '@/lib/types';
import { LiveShift } from '@/store/live';

const local = (time: string, date = '2026-11-02') => new Date(`${date}T${time}:00`);

const running = (over: Partial<LiveShift> = {}): LiveShift => ({
  date: '2026-11-02',
  shiftId: 4,
  name: 'Вечер',
  symbol: null,
  startedAt: local('11:00').toISOString(),
  hourlyRate: null,
  plannedStart: '11:00',
  plannedEnd: '22:00',
  actualEnd: null,
  autoClock: true,
  ...over,
});

const entry = (over: Partial<DayShiftEntry> = {}) => ({
  start_time: '11:00',
  end_time: '22:00',
  actual_start: null,
  actual_end: null,
  worked: false,
  ...over,
});

describe('a running clock and its day', () => {
  it('follows a start corrected past the plan to that evening, not the one before', () => {
    const shift = running({ startedAt: local('18:00').toISOString(), plannedStart: '09:00', plannedEnd: '17:00' });
    const next = followEntry(shift, entry({ start_time: '09:00', end_time: '17:00', actual_start: '22:00' }));

    expect(new Date(next.startedAt).getTime()).toBe(local('22:00').getTime());
  });

  it('moves to a new start set under Фактически', () => {
    const next = followEntry(running(), entry({ actual_start: '10:30' }));

    expect(new Date(next.startedAt).getTime()).toBe(local('10:30').getTime());
  });

  it('moves its close to a new end set under Фактически', () => {
    const shift = followEntry(running(), entry({ actual_end: '23:30' }));

    expect(liveWindow(shift).closes.getTime()).toBe(local('23:30').getTime());
  });

  it('takes a retimed plan from the entry', () => {
    const shift = followEntry(running(), entry({ start_time: '11:00', end_time: '23:00' }));

    expect(liveWindow(shift).closes.getTime()).toBe(local('23:00').getTime());
  });

  it('does not lose the seconds of its own start to the minute the day holds', () => {
    const started = running({ startedAt: new Date(local('10:40').getTime() + 17_000).toISOString() });

    expect(followEntry(started, entry({ actual_start: '10:40' }))).toBe(started);
  });

  it('keeps its start while the day has not heard of it yet', () => {
    const started = running({ startedAt: local('10:40').toISOString() });

    expect(followEntry(started, entry()).startedAt).toBe(started.startedAt);
  });

  it('hands back the same clock where nothing moved, so a tick writes nothing', () => {
    const shift = running();

    expect(followEntry(shift, entry())).toBe(shift);
  });

  it('keeps the real start over the plan a close copied in', () => {
    const started = running({ startedAt: local('10:40').toISOString() });

    expect(followEntry(started, entry({ actual_start: '11:00', worked: true }))).toBe(started);
  });

  it('stops where another device finished the shift', () => {
    const shift = followEntry(
      running({ startedAt: local('10:40').toISOString() }),
      entry({ worked: true, actual_start: '11:00', actual_end: '20:00' }),
    );

    expect(liveWindow(shift).closes.getTime()).toBe(local('20:00').getTime());
    expect(new Date(shift.startedAt).getTime()).toBe(local('10:40').getTime());
  });

  it('hears the template change its mind', () => {
    expect(followEntry(running(), entry(), false).autoClock).toBe(false);
  });
});

describe('the close of a running clock', () => {
  it('uses the plan, over midnight too', () => {
    const night = running({
      startedAt: local('22:00').toISOString(),
      plannedStart: '22:00',
      plannedEnd: '02:00',
    });

    expect(liveWindow(night).closes.getTime()).toBe(local('02:00', '2026-11-03').getTime());
  });

  it('does not move for a clock started early by hand', () => {
    const early = running({ startedAt: local('10:40').toISOString() });

    expect(liveWindow(early).closes.getTime()).toBe(local('22:00').getTime());
  });

  it('is not pushed a day on by a clock started after the plan ended', () => {
    const late = running({
      startedAt: local('18:00').toISOString(),
      plannedStart: '09:00',
      plannedEnd: '17:00',
    });

    expect(liveWindow(late).closes.getTime()).toBe(local('17:00').getTime());
  });

  it('counts a start on the very minute of the close as after it', () => {
    const late = running({
      startedAt: local('22:00').toISOString(),
    });

    expect(liveWindow(late).closes.getTime()).toBe(local('22:00').getTime());
  });

  it('still takes a Фактически end for the plan’s own', () => {
    // Started at 21:00 on a plan to 22:00, with the end said to be 20:30.
    const late = running({ startedAt: local('21:00').toISOString(), actualEnd: '20:30' });

    expect(liveWindow(late).closes.getTime()).toBe(local('20:30').getTime());
  });

  it('keeps the rule where the end only reads as next day from the plan’s own start', () => {
    // A tenth of a day before the plan began, and the clock started before it.
    const early = running({ startedAt: local('10:00').toISOString(), actualEnd: '10:30' });

    expect(liveWindow(early).closes.getTime()).toBe(local('10:30').getTime());
  });
});

describe('whether the plan stops the clock', () => {
  it('does for one running inside it', () => {
    expect(planEndsClock(running())).toBe(true);
  });

  it('does not for one started after it ended, so nothing promises a close', () => {
    expect(
      planEndsClock(
        running({ startedAt: local('18:00').toISOString(), plannedStart: '09:00', plannedEnd: '17:00' }),
      ),
    ).toBe(false);
  });

  it('does not for a clock the close leaves alone', () => {
    expect(planEndsClock(running({ autoClock: false }))).toBe(false);
  });
});

describe('a clock for an entry', () => {
  const planned = {
    shift_id: 4,
    name: 'Вечер',
    symbol: '🌙',
    start_time: '13:00',
    end_time: '23:00',
    actual_end: '23:30',
    worked: false,
    auto_closed: false,
  };
  const template = {
    salary_period: 'hour',
    salary_amount: 300,
    auto_clock: true,
    archived: false,
    // Mondays on the template run shorter. The entry is what counts.
    start_time: '11:00',
    end_time: '22:00',
  } as ShiftTemplate;

  it('takes the plan from the entry, not the template', () => {
    const shift = liveFrom('2026-11-02', planned, template, local('13:00').toISOString());

    expect(shift.plannedStart).toBe('13:00');
    expect(shift.plannedEnd).toBe('23:00');
    expect(shift.actualEnd).toBe('23:30');
  });

  it('ticks money only for an hourly rate', () => {
    expect(liveFrom('2026-11-02', planned, template, '').hourlyRate).toBe(300);
    expect(
      liveFrom('2026-11-02', planned, { ...template, salary_period: 'month' }, '').hourlyRate,
    ).toBeNull();
  });

  it('does not close itself on an archived template', () => {
    expect(
      liveFrom('2026-11-02', planned, { ...template, archived: true }, '').autoClock,
    ).toBe(false);
  });

  it('promises no close on a shift already told to keep it out', () => {
    // Started by hand after a discard: nothing would ever close it, so the
    // label must not say so and the alarm has to stay.
    expect(liveFrom('2026-11-02', { ...planned, auto_closed: true }, template, '').autoClock).toBe(
      false,
    );
  });
});

describe('breaks at the end of a shift', () => {
  it('runs an open one up to the end', () => {
    const shift = running({ breaks: [{ from: local('21:30').toISOString(), to: null }] });

    expect(breakSeconds(shift, local('22:00').getTime())).toBe(1_800);
  });

  it('stops counting at the end', () => {
    const shift = running({
      breaks: [{ from: local('21:30').toISOString(), to: local('22:30').toISOString() }],
    });

    expect(breakSeconds(shift, local('22:00').getTime())).toBe(1_800);
  });
});

describe('the forgotten-shift alarm', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: local('12:00'), toFake: ['Date'] });
    store.scheduled = 0;
    useLive.setState({ live: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not armed for a shift that closes itself', async () => {
    useLive.getState().start(running({ autoClock: true }));
    await Promise.resolve();

    expect(store.scheduled).toBe(0);
  });

  it('is armed for one that does not', async () => {
    useLive.getState().start(running({ autoClock: false }));
    await Promise.resolve();

    expect(store.scheduled).toBe(1);
  });

  it('is armed once a running shift stops closing itself', async () => {
    useLive.getState().start(running({ autoClock: true }));
    useLive.getState().follow(entry(), false);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.scheduled).toBe(1);
    expect(useLive.getState().live?.alarmId).toBe('alarm');
  });

  it('is not armed twice if the template changes its mind and back', async () => {
    useLive.getState().start(running({ autoClock: true }));
    useLive.getState().follow(entry(), false);
    await Promise.resolve();
    await Promise.resolve();
    useLive.getState().follow(entry(), true);
    useLive.getState().follow(entry(), false);
    await Promise.resolve();

    expect(store.scheduled).toBe(1);
  });

  it('is not set for a moment already gone, which the banner is saying anyway', async () => {
    vi.setSystemTime(local('10:00', '2026-11-03'));

    useLive.getState().start(running({ autoClock: true }));
    useLive.getState().follow(entry(), false);
    await Promise.resolve();

    expect(store.scheduled).toBe(0);
  });
});

describe('the store', () => {
  it('starts out not knowing, so nothing fires before storage has answered', async () => {
    useLive.setState({ ready: false });
    expect(useLive.getState().ready).toBe(false);

    await useLive.getState().hydrate();

    expect(useLive.getState().ready).toBe(true);
  });

  it('follows the day through the store and leaves no clock alone', () => {
    useLive.setState({ live: running() });
    useLive.getState().follow(entry({ actual_end: '23:30' }));

    expect(useLive.getState().live?.actualEnd).toBe('23:30');

    useLive.setState({ live: null });
    useLive.getState().follow(entry({ actual_end: '23:30' }));

    expect(useLive.getState().live).toBeNull();
  });
});
