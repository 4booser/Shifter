import { describe, expect, it } from 'vitest';

import { CalendarDayData, DayShiftEntry, ShiftTemplate } from '@/lib/calendar/models';
import { ClockInput, clockOf, clockStanding, clockStep, liveWindow, overdueSince, planCloses, planEndsClock, startSettled } from '@/lib/live/auto-clock';
import type { LiveShift } from '@/lib/live/live-shift';

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
  break_minutes: 0,
  hours: 11,
  archived: false,
  week_hours: [],
  auto_clock: true,
  ...over,
});

const entry = (over: Partial<DayShiftEntry> = {}): DayShiftEntry => ({
  shift_id: 1,
  name: 'Bar',
  symbol: null,
  colour: null,
  start_time: '11:00',
  end_time: '22:00',
  hours: 11,
  earned: 0,
  revenue: null,
  guests: null,
  zone: 'unset',
  revenue_percent: null,
  worked: false,
  needs_cover: false,
  actual_start: null,
  actual_end: null,
  break_minutes: 0,
  auto_closed: false,
  ...over,
});

const day = (date: string, ...shifts: DayShiftEntry[]) =>
  [date, { date, shifts } as unknown as CalendarDayData] as const;

/** Monday the 2nd, a wall-clock moment on this machine. */
const at = (date: number, hours: number, minutes = 0) => new Date(2026, 10, date, hours, minutes).getTime();

const live = (over: Partial<LiveShift> = {}): LiveShift => ({
  shiftId: 1,
  date: '2026-11-02',
  startedAt: at(2, 11),
  breakMs: 0,
  pausedAt: null,
  ...over,
});

const input = (over: Partial<ClockInput> = {}): ClockInput => ({
  now: at(2, 12),
  today: '2026-11-02',
  days: new Map([day('2026-11-02', entry())]),
  templates: [template()],
  live: null,
  ...over,
});

describe('opening by itself', () => {
  it('starts the clock at the opening, not at the moment anybody looked', () => {
    expect(clockStep(input())).toMatchObject({ kind: 'open', date: '2026-11-02', startedAt: at(2, 11) });
  });

  it('opens from Фактически when it was set in advance', () => {
    const days = new Map([day('2026-11-02', entry({ actual_start: '10:40' }))]);

    expect(clockStep(input({ days, now: at(2, 10, 45) }))).toMatchObject({ startedAt: at(2, 10, 40) });
  });

  it('waits for the opening', () => {
    expect(clockStep(input({ now: at(2, 10, 59) }))).toBeNull();
  });

  it('leaves a shift already over to the server', () => {
    expect(clockStep(input({ now: at(2, 22) }))).toBeNull();
  });

  it('finds a night shift on yesterday’s date, and opens it there', () => {
    const night = template({ start_time: '22:00', end_time: '02:00' });
    const days = new Map([day('2026-11-02', entry({ start_time: '22:00', end_time: '02:00' }))]);

    expect(
      clockStep(input({ today: '2026-11-03', now: at(3, 1), templates: [night], days })),
    ).toMatchObject({ kind: 'open', date: '2026-11-02', startedAt: at(2, 22) });
  });

  it('uses the entry’s own hours, not the template’s', () => {
    const days = new Map([day('2026-11-06', entry({ start_time: '13:00', end_time: '23:00' }))]);

    expect(
      clockStep(input({ today: '2026-11-06', now: at(6, 12), days })),
    ).toBeNull();
    expect(
      clockStep(input({ today: '2026-11-06', now: at(6, 13), days })),
    ).toMatchObject({ startedAt: at(6, 13) });
  });

  it.each([
    ['the template is off', { templates: [template({ auto_clock: false })] }],
    ['the template is archived', { templates: [template({ archived: true })] }],
    ['the template is unknown', { templates: [template({ id: 2 })] }],
    ['it is already worked', { days: new Map([day('2026-11-02', entry({ worked: true }))]) }],
    ['cover is wanted', { days: new Map([day('2026-11-02', entry({ needs_cover: true }))]) }],
    ['it was told to stay out', { days: new Map([day('2026-11-02', entry({ auto_closed: true }))]) }],
    ['the day is not held', { days: new Map() }],
  ])('stays shut when %s', (_, over) => {
    expect(clockStep(input(over))).toBeNull();
  });

  it('opens one clock at most, the earliest', () => {
    const second = template({ id: 2, start_time: '11:30', end_time: '21:00' });
    const days = new Map([
      day(
        '2026-11-02',
        entry({ shift_id: 2, start_time: '11:30', end_time: '21:00' }),
        entry({ shift_id: 1 }),
      ),
    ]);

    expect(clockStep(input({ days, templates: [template(), second] }))).toMatchObject({
      template: { id: 1 },
    });
  });

  it('never opens beside a clock already running', () => {
    expect(clockStep(input({ live: live() }))?.kind).not.toBe('open');
  });
});

describe('closing by itself', () => {
  const running = (over: Partial<ClockInput> = {}) => input({ live: live(), ...over });

  it('lands on the close, however late anybody looked', () => {
    expect(clockStep(running({ now: at(3, 9) }))).toMatchObject({ kind: 'close', endAt: at(2, 22) });
  });

  it('leaves a clock inside its window alone', () => {
    expect(clockStep(running({ now: at(2, 21, 59) }))).toBeNull();
  });

  it('honours a later edit of the finish', () => {
    const days = new Map([day('2026-11-02', entry({ actual_end: '23:10' }))]);

    expect(clockStep(running({ days, now: at(2, 22, 30) }))).toBeNull();
    expect(clockStep(running({ days, now: at(2, 23, 10) }))).toMatchObject({ endAt: at(2, 23, 10) });
  });

  it('closes a clock started by hand, on a shift with no placement at all', () => {
    expect(
      clockStep(running({ days: new Map(), live: live({ startedAt: at(2, 12, 7) }), now: at(2, 22, 1) })),
    ).toMatchObject({ kind: 'close', endAt: at(2, 22) });
  });

  it('closes a night shift past midnight, on its own date', () => {
    const night = template({ start_time: '22:00', end_time: '02:00' });

    expect(
      clockStep({
        ...running({ templates: [night], days: new Map(), today: '2026-11-03', now: at(3, 2) }),
        live: live({ startedAt: at(2, 22) }),
      }),
    ).toMatchObject({ endAt: at(3, 2) });
  });

  it('takes a Friday’s hours from the template when the entry is not held', () => {
    const weekly = template({ week_hours: [{ weekday: 5, start_time: '11:00', end_time: '23:00' }] });
    const friday = live({ date: '2026-11-06', startedAt: at(6, 11) });

    expect(
      clockStep({ ...running({ templates: [weekly], days: new Map(), now: at(6, 22, 30) }), live: friday }),
    ).toBeNull();
    expect(
      clockStep({ ...running({ templates: [weekly], days: new Map(), now: at(6, 23) }), live: friday }),
    ).toMatchObject({ endAt: at(6, 23) });
  });

  it('does nothing on a template that does not clock itself', () => {
    expect(clockStep(running({ templates: [template({ auto_clock: false })], now: at(3, 9) }))).toBeNull();
  });

  it('will not land a close from before the clock even started', () => {
    expect(
      clockStep(running({ live: live({ startedAt: at(2, 23, 30) }), days: new Map(), now: at(2, 23, 40) })),
    ).toBeNull();
  });

  it.each([
    ['nothing on the day', new Map()],
    ['its own start written there', new Map([day('2026-11-02', entry({ actual_start: '22:30' }))])],
  ])('will not take a plan over before the clock started for tomorrow’s close either: %s', (_, days) => {
    const late = live({ startedAt: at(2, 22, 30), placed: true });

    expect(clockStep(running({ live: late, days, now: at(3, 22, 1) }))).toBeNull();
  });
});

describe('a close nobody should make', () => {
  const late = (live: LiveShift, ...shifts: DayShiftEntry[]) =>
    input({ now: at(2, 23), live, days: new Map([day('2026-11-02', ...shifts)]) });

  const placed = live({ placed: true });

  it('drops a clock whose shift has left the day', () => {
    expect(clockStep(late(placed))).toEqual({ kind: 'drop' });
  });

  it('still closes a clock that never had a placement to lose', () => {
    expect(clockStep(late(live({ placed: false })))).toMatchObject({ kind: 'close' });
  });

  it('takes a day nobody has read for nothing, and leaves that to the read', () => {
    expect(clockStep({ ...late(placed), days: new Map() })).toMatchObject({ kind: 'close' });
  });

  it('leaves a shift back on Planned with the close told to keep out, and the clock with it', () => {
    expect(clockStep(late(placed, entry({ auto_closed: true })))).toBeNull();
  });

  describe('a discard seen from another device', () => {
    const counting = live({ placed: true, autoClock: true });
    const discarded = entry({ auto_closed: true });

    it('stops a clock that counted on the close, with no close coming to end it', () => {
      expect(clockStep(late(counting, discarded))).toEqual({ kind: 'drop' });
    });

    it('stops it the moment the word arrives, not at the hour it would have closed', () => {
      const midShift = input({ now: at(2, 15), live: counting, days: new Map([day('2026-11-02', discarded)]) });

      expect(clockStep(midShift)).toEqual({ kind: 'drop' });
    });

    it('leaves a clock started by hand since, which never counted on the close', () => {
      expect(clockStep(late(live({ placed: true, autoClock: false }), discarded))).toBeNull();
    });

    it('takes a shift put back on Planned with its times still on it for an answer, not a discard', () => {
      expect(clockStep(late(counting, entry({ auto_closed: true, actual_end: '22:30' })))).toBeNull();
    });

    it('takes nothing but the discard for one: a close stamps the entry too, and a worked one is no discard', () => {
      const closed = entry({ auto_closed: true, worked: true });

      expect(clockStep(late(counting, closed))).toMatchObject({ kind: 'close' });
    });
  });

  it('drops a clock over times somebody settled, and leaves a close it only copied the plan into', () => {
    const closed = { worked: true, auto_closed: true, actual_start: '11:00' };

    expect(clockStep(late(placed, entry({ ...closed, actual_end: '20:30' })))).toEqual({ kind: 'drop' });
    expect(clockStep(late(placed, entry({ ...closed, actual_end: '22:00' })))).toMatchObject({ kind: 'close' });
  });
});

describe('a start recorded on a worked entry no close touched', () => {
  const recorded = entry({ worked: true, actual_start: '11:00', actual_end: '22:00' });

  it('drops a stale clock instead of writing over it, the plan’s own hour or not', () => {
    const stale = live({ placed: true, startedAt: at(2, 11, 20) });

    expect(clockStanding(stale, [recorded])).toBe('gone');
    expect(clockStep(input({ now: at(2, 22, 1), live: stale, days: new Map([day('2026-11-02', recorded)]) }))).toEqual({
      kind: 'drop',
    });
  });

  it('is not followed either: it says the shift is over, not that the clock began elsewhere', () => {
    const stale = live({ placed: true, startedAt: at(2, 11, 20) });

    expect(clockStep(input({ now: at(2, 15), live: stale, days: new Map([day('2026-11-02', recorded)]) }))).toBeNull();
  });

  it('still takes the plan off a stamped entry for what it is: a close copied it there', () => {
    const closed = entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '22:00' });

    expect(startSettled(closed, live({ startedAt: at(2, 11, 20) }))).toBe(false);
    expect(startSettled({ ...closed, auto_closed: false }, live({ startedAt: at(2, 11, 20) }))).toBe(true);
  });
});

describe('following Фактически', () => {
  it('moves the clock to a start typed in while it runs', () => {
    const days = new Map([day('2026-11-02', entry({ actual_start: '10:30' }))]);

    expect(clockStep(input({ days, live: live() }))).toEqual({ kind: 'follow', startedAt: at(2, 10, 30) });
  });

  it('agrees with its own start, seconds and all', () => {
    const days = new Map([day('2026-11-02', entry({ actual_start: '11:00' }))]);

    expect(clockStep(input({ days, live: live({ startedAt: at(2, 11) + 37_000 }) }))).toBeNull();
  });

  it('takes no edge from a close the server made: that is the plan copied in', () => {
    const days = new Map([
      day('2026-11-02', entry({ worked: true, auto_closed: true, actual_start: '11:00', actual_end: '22:00' })),
    ]);

    expect(
      clockStep(input({ days, live: live({ startedAt: at(2, 10, 40) }), now: at(2, 22, 1) })),
    ).toEqual(expect.objectContaining({ kind: 'close', endAt: at(2, 22) }));
  });

  it('takes no empty edge for a word from the person: the manual start may still be on its way', () => {
    expect(clockStep(input({ live: live({ startedAt: at(2, 11, 20) }) }))).toBeNull();
  });
});

describe('overdueSince', () => {
  it('names the close the server should have acted on', () => {
    expect(overdueSince(input({ now: at(2, 22, 5) }))).toBe(at(2, 22));
  });

  it('is quiet before the close and while a clock runs', () => {
    expect(overdueSince(input({ now: at(2, 21) }))).toBeNull();
    expect(overdueSince(input({ now: at(2, 23), live: live() }))).toBeNull();
  });

  it('is quiet about a shift told to stay out', () => {
    const days = new Map([day('2026-11-02', entry({ auto_closed: true }))]);

    expect(overdueSince(input({ now: at(2, 23), days }))).toBeNull();
  });
});

describe('the sixteen-hour limit', () => {
  it('stands aside for a clock the plan is going to stop', () => {
    const long = template({ start_time: '08:00', end_time: '02:00' });

    expect(planEndsClock(long, live({ startedAt: at(2, 8) }), undefined)).toBe(true);
  });

  it('still catches a clock started after its shift was over', () => {
    expect(planEndsClock(template(), live({ startedAt: at(2, 22, 30) }), undefined)).toBe(false);
  });

  it('still catches a template that does not clock itself', () => {
    expect(planEndsClock(template({ auto_clock: false }), live(), undefined)).toBe(false);
  });

  it('takes the limit back for a shift the close was told to keep out of', () => {
    expect(planEndsClock(template(), live(), entry({ auto_closed: true }))).toBe(false);
  });

  it('counts a finish moved later', () => {
    const later = entry({ actual_end: '23:30' });

    expect(planEndsClock(template(), live({ startedAt: at(2, 22, 30) }), later)).toBe(true);
  });
});

describe('planCloses', () => {
  it('is the plan’s own end, however late the clock started', () => {
    expect(planCloses(template(), live({ startedAt: at(2, 23, 30) }), undefined)).toBe(at(2, 22));
  });

  it('is not moved by the clock’s start written on the day', () => {
    expect(planCloses(template(), live({ startedAt: at(2, 23, 30) }), entry({ actual_start: '23:30' }))).toBe(at(2, 22));
  });

  it('runs a night shift into the next morning', () => {
    const night = template({ start_time: '22:00', end_time: '02:00' });

    expect(planCloses(night, live({ startedAt: at(2, 22) }), undefined)).toBe(at(3, 2));
  });

  it('takes a finish moved on the day', () => {
    expect(planCloses(template(), live(), entry({ actual_end: '23:30' }))).toBe(at(2, 23, 30));
  });
});

describe('liveWindow', () => {
  it('stands the clock’s own start in for an edge the day has not heard about', () => {
    const { opens } = liveWindow(template(), live({ startedAt: at(2, 11, 20) }), entry());

    expect(opens).toBe(at(2, 11, 20));
  });
});

describe('clockOf', () => {
  it('prints the wall clock', () => {
    expect(clockOf(at(2, 7, 5))).toBe('07:05');
  });
});

// The same line ShiftCloser draws: a lone start past the plan is its own day's,
// and the close is the limit, never the plan's end pushed round to wrap.
describe('a start moved past the plan', () => {
  const plan = template({ start_time: '09:00', end_time: '17:00', hours: 8 });
  const moved = (actual_start: string) => entry({ start_time: '09:00', end_time: '17:00', actual_start });
  const onDay = (placed: DayShiftEntry) => new Map([day('2026-11-02', placed)]);
  const asked = (over: Partial<ClockInput>) => input({ templates: [plan], ...over });

  it('does not open the evening before, which the shared rule would call the start', () => {
    expect(clockStep(asked({ now: at(2, 10), days: onDay(moved('22:00')) }))).toBeNull();
  });

  it('opens on the evening the row names', () => {
    expect(clockStep(asked({ now: at(2, 22, 1), days: onDay(moved('22:00')) }))).toMatchObject({
      kind: 'open',
      startedAt: at(2, 22),
    });
  });

  it('never closes a clock on the plan it missed', () => {
    const running = live({ startedAt: at(2, 22) });

    for (const now of [at(2, 23), at(3, 13, 59), at(3, 17, 1)]) {
      expect(clockStep(asked({ now, live: running, days: onDay(moved('22:00')) }))).toBeNull();
    }
  });

  it('moves a running clock to that evening when the start is corrected to it', () => {
    const running = live({ startedAt: at(2, 18) });

    expect(clockStep(asked({ now: at(2, 23), live: running, days: onDay(moved('22:00')) }))).toEqual({
      kind: 'follow',
      startedAt: at(2, 22),
    });
  });

  it('reads as overdue only once the limit has passed, when the server is about to stop it', () => {
    expect(overdueSince(asked({ now: at(2, 18), days: onDay(moved('18:00')) }))).toBeNull();
    expect(overdueSince(asked({ now: at(3, 9, 59), days: onDay(moved('18:00')) }))).toBeNull();
    expect(overdueSince(asked({ now: at(3, 10), today: '2026-11-03', days: onDay(moved('18:00')) }))).toBe(at(3, 10));
  });

  it('leaves a start early or inside the plan to the shared rule', () => {
    expect(clockStep(asked({ now: at(2, 8, 45), days: onDay(moved('08:30')) }))).toMatchObject({
      kind: 'open',
      startedAt: at(2, 8, 30),
    });
    expect(liveWindow(plan, live({ startedAt: at(2, 8, 30) }), moved('08:30')).closes).toBe(at(2, 17));
  });
});
