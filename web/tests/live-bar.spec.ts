import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveBar } from '@/components/live/live-bar';
import { ShiftTemplate } from '@/lib/calendar/models';
import { LiveShift, finishLiveShift } from '@/lib/live/live-shift';
import { pushToast } from '@/lib/toast';

/**
 * The real bar with its real effects, on a few lines of hooks: nothing here
 * renders a DOM, and a mock of the check would have passed all along. It was
 * the effect that was wrong, restarted by a `t` that is new on every render.
 */

const hooks = vi.hoisted(() => {
  interface Effect {
    deps: unknown[] | undefined;
    cleanup?: void | (() => void);
  }

  let slots: unknown[] = [];
  let at = 0;
  let queued: (() => void)[] = [];
  let render: () => void = () => undefined;

  const slot = <T,>(start: () => T): { index: number; value: T } => {
    const index = at;

    at += 1;

    if (index >= slots.length) slots.push(start());

    return { index, value: slots[index] as T };
  };

  return {
    mount(component: () => unknown) {
      slots = [];

      render = () => {
        at = 0;
        queued = [];
        component();

        for (const run of queued) run();
      };

      render();
    },

    unmount() {
      for (const held of slots) (held as Effect | null)?.cleanup?.();

      render = () => undefined;
    },

    useState<T>(initial: T) {
      const { index, value } = slot(() => initial);

      const change = (next: T | ((held: T) => T)) => {
        slots[index] = typeof next === 'function' ? (next as (held: T) => T)(slots[index] as T) : next;
        render();
      };

      return [value, change] as const;
    },

    useRef<T>(initial: T) {
      return slot(() => ({ current: initial })).value;
    },

    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const { index, value } = slot((): Effect | null => null);
      const same = value !== null && deps?.every((dep, place) => Object.is(dep, value.deps?.[place])) === true;

      if (same) return;

      queued.push(() => {
        value?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    },
  };
});

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
  useEffect: hooks.useEffect,
}));

const state = vi.hoisted(() => ({
  live: null as LiveShift | null,
  templates: [] as ShiftTemplate[],
}));

vi.mock('@/lib/live/live-shift', async (original) => ({
  ...(await original<typeof import('@/lib/live/live-shift')>()),
  useLive: (pick: (held: { live: LiveShift | null }) => unknown) => pick({ live: state.live }),
  finishLiveShift: vi.fn(async () => 'written'),
  liveEntry: () => undefined,
}));

vi.mock('@/lib/store/calendar', async (original) => ({
  ...(await original<typeof import('@/lib/store/calendar')>()),
  useCalendar: Object.assign(
    (pick: (held: { templates: ShiftTemplate[] }) => unknown) => pick({ templates: state.templates }),
    { getState: () => ({ days: new Map() }) },
  ),
}));

// As the real one does it: a new function every time it is asked.
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

vi.mock('@/lib/toast', () => ({ pushToast: vi.fn() }));

const NOW = new Date(2026, 10, 6, 12).getTime();
const HOUR = 3_600_000;

const template = (over: Partial<ShiftTemplate> = {}) =>
  ({
    id: 1,
    name: 'Bar',
    start_time: '11:00',
    end_time: '22:00',
    salary_period: 'hour',
    salary_amount: 200,
    hours: 11,
    week_hours: [],
    auto_clock: false,
    archived: false,
    ...over,
  }) as ShiftTemplate;

const clock = (startedAt: number): LiveShift => ({
  shiftId: 1,
  date: '2026-11-05',
  startedAt,
  breakMs: 0,
  pausedAt: null,
  breakUntil: null,
  placed: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  state.templates = [template()];
});

afterEach(() => {
  hooks.unmount();
  vi.useRealTimers();
});

const open = (startedAt: number) => {
  state.live = clock(startedAt);
  hooks.mount(LiveBar);
};

describe('the live bar’s minute check', () => {
  it('reaches the end of its minute, with the bar rendering every second under it', async () => {
    open(NOW - 17 * HOUR);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(finishLiveShift).toHaveBeenCalledTimes(1);
  });

  it('sends the limit down the path a close takes, not the one a press of Finish takes', async () => {
    open(NOW - 17 * HOUR);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(finishLiveShift).toHaveBeenCalledWith(state.templates[0], { byItself: true, atLimit: true });
  });

  it('says so quietly once it has written', async () => {
    open(NOW - 17 * HOUR);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(pushToast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pushToast).mock.calls[0][0].title).toBe('Shift closed after sixteen hours');
  });

  it('says nothing where the day said the shift was gone', async () => {
    vi.mocked(finishLiveShift).mockResolvedValueOnce('gone');
    open(NOW - 17 * HOUR);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(pushToast).not.toHaveBeenCalled();
  });

  describe('over a manual shift planned longer than the limit', () => {
    const long = () => {
      state.templates = [template({ start_time: '08:00', end_time: '02:00', hours: 18 })];
      state.live = clock(new Date(2026, 10, 5, 8).getTime());
    };

    it('leaves it running while the plan still has it', async () => {
      vi.setSystemTime(new Date(2026, 10, 6, 0, 30));
      long();
      hooks.mount(LiveBar);

      await vi.advanceTimersByTimeAsync(180_000);

      expect(finishLiveShift).not.toHaveBeenCalled();
    });

    it('closes it once the plan and the half hour after it have gone', async () => {
      vi.setSystemTime(new Date(2026, 10, 6, 2, 31));
      long();
      hooks.mount(LiveBar);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(finishLiveShift).toHaveBeenCalledTimes(1);
    });
  });

  describe.each([
    ['manual', false],
    ['closing by itself', true],
  ])('over a clock started after its plan ended, %s', (_, auto_clock) => {
    const late = () => {
      state.templates = [template({ start_time: '09:00', end_time: '17:00', auto_clock })];
    };

    it('stops it at the limit, with the plan’s end not wrapped round to the next day', async () => {
      late();
      open(NOW - 17 * HOUR);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(finishLiveShift).toHaveBeenCalledTimes(1);
    });

    it('leaves it running until then', async () => {
      late();
      open(NOW - 15 * HOUR);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(finishLiveShift).not.toHaveBeenCalled();
      expect(pushToast).not.toHaveBeenCalled();
    });
  });

  it('nudges where the limit passed and the day would not let the clock close, and only once', async () => {
    vi.mocked(finishLiveShift).mockResolvedValue('wait');
    open(NOW - 17 * HOUR);

    await vi.advanceTimersByTimeAsync(180_000);

    expect(pushToast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pushToast).mock.calls[0][0].title).toBe('Shift over?');
    vi.mocked(finishLiveShift).mockResolvedValue('written');
  });

  it('gives one nudge when a shift nobody closes runs half an hour past its end, and no more', async () => {
    state.templates = [template({ start_time: '02:00', end_time: '11:00' })];
    state.live = { ...clock(new Date(2026, 10, 6, 2).getTime()), date: '2026-11-06' };
    hooks.mount(LiveBar);

    await vi.advanceTimersByTimeAsync(180_000);

    expect(pushToast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pushToast).mock.calls[0][0].title).toBe('Shift over?');
    expect(finishLiveShift).not.toHaveBeenCalled();
  });

  it('leaves a clock alone while the plan is going to stop it', async () => {
    state.templates = [template({ auto_clock: true, start_time: '11:00', end_time: '23:00' })];
    state.live = { ...clock(new Date(2026, 10, 6, 11).getTime()), date: '2026-11-06' };
    hooks.mount(LiveBar);

    await vi.advanceTimersByTimeAsync(180_000);

    expect(finishLiveShift).not.toHaveBeenCalled();
    expect(pushToast).not.toHaveBeenCalled();
  });
});
