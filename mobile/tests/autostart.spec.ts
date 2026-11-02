import { describe, expect, it } from 'vitest';

import {
  dueAutoStart,
  dueAutoStop,
  noteFired,
  plannedClocks,
  readFired,
  stopHourFor,
} from '@/lib/autostart';
import { CalendarDayData, DayShiftEntry, ShiftTemplate } from '@/lib/types';

const at = (time: string) => new Date(`2026-08-29T${time}:00`).getTime();

const input = (over: Partial<Parameters<typeof dueAutoStart>[0]> = {}) => ({
  rules: [{ shiftId: 7, at: '18:00' }],
  planned: [{ shiftId: 7 }],
  liveRunning: false,
  firedToday: [],
  now: at('18:05'),
  today: '2026-08-29',
  ...over,
});

describe('when a shift starts itself', () => {
  it('fires once the chosen hour has come, on a day it is planned', () => {
    const due = dueAutoStart(input())!;

    expect(due.shiftId).toBe(7);
    expect(new Date(due.startedAt).getTime()).toBe(at('18:00'));
  });

  it('backdates the clock to the chosen hour, not to when the app opened', () => {
    // 18:00 is when work began. A live shift that says 20:47 because that is
    // when the phone came out of the locker is wrong by exactly the amount
    // the person cares about.
    const due = dueAutoStart(input({ now: at('20:47') }))!;

    expect(new Date(due.startedAt).getTime()).toBe(at('18:00'));
  });

  it('does not fire before its hour', () => {
    expect(dueAutoStart(input({ now: at('17:59') }))).toBeNull();
  });

  it('does not fire on a day the shift is not planned', () => {
    // A standing time on a template is not a rota; the calendar is.
    expect(dueAutoStart(input({ planned: [] }))).toBeNull();
    expect(dueAutoStart(input({ planned: [{ shiftId: 9 }] }))).toBeNull();
  });

  it('never starts over a shift already running', () => {
    expect(dueAutoStart(input({ liveRunning: true }))).toBeNull();
  });

  it('fires once a day, so a stop stays stopped', () => {
    // Clocking out is a statement. Starting again a minute later would be the
    // app overruling it.
    expect(dueAutoStart(input({ firedToday: [7] }))).toBeNull();
  });

  it('lets a manual start on another template block nothing tomorrow', () => {
    expect(dueAutoStart(input({ firedToday: [9] }))).not.toBeNull();
  });

  it('does not invent a workday out of a stale discovery', () => {
    // Ten hours late is most of a shift long gone.
    expect(dueAutoStart(input({ now: at('22:01') }))).toBeNull();
    expect(dueAutoStart(input({ now: at('21:59') }))).not.toBeNull();
  });

  it('survives a rule whose time does not parse', () => {
    expect(
      dueAutoStart(input({ rules: [{ shiftId: 7, at: 'вечером' }] })),
    ).toBeNull();
  });
});

describe('when a shift opens by its own hours', () => {
  const today = '2026-11-02';
  const on = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();
  const window = { opens: on(today, '11:00'), closes: on(today, '22:00') };
  const planned = [{ shiftId: 7, date: today, window }];
  const open = (over: Partial<Parameters<typeof dueAutoStart>[0]> = {}) =>
    dueAutoStart(input({ rules: [], planned, today, now: on(today, '11:05'), ...over }));

  it('starts at the opening, on the date the shift sits on', () => {
    const due = open()!;

    expect(due.shiftId).toBe(7);
    expect(due.date).toBe(today);
    expect(due.ruled).toBe(false);
    expect(new Date(due.startedAt).getTime()).toBe(window.opens);
  });

  it('runs the whole shift rather than four hours of it', () => {
    // The phone was in a locker until nine in the evening. The shift has been
    // running since eleven and still has an hour to go.
    const due = open({ now: on(today, '21:30') })!;

    expect(new Date(due.startedAt).getTime()).toBe(window.opens);
  });

  it('stays shut before the opening and from the close on', () => {
    expect(open({ now: on(today, '10:59') })).toBeNull();
    expect(open({ now: on(today, '22:00') })).toBeNull();
    expect(open({ now: on(today, '23:00') })).toBeNull();
  });

  it('never starts over a shift already running', () => {
    expect(open({ liveRunning: true })).toBeNull();
  });

  it('leaves a stopped shift stopped', () => {
    expect(open({ firedToday: [7] })).toBeNull();
  });

  it('opens last night’s shift on last night’s date', () => {
    const yesterday = '2026-11-01';
    const night = { opens: on(yesterday, '22:00'), closes: on(today, '02:00') };
    const due = open({
      planned: [{ shiftId: 7, date: yesterday, window: night }],
      now: on(today, '00:30'),
    })!;

    expect(due.date).toBe(yesterday);
    expect(new Date(due.startedAt).getTime()).toBe(night.opens);
  });

  it('keeps a night shift stopped past midnight, on the date it fired for', () => {
    const yesterday = '2026-11-01';
    const night = { opens: on(yesterday, '22:00'), closes: on(today, '02:00') };

    expect(
      open({
        planned: [{ shiftId: 7, date: yesterday, window: night }],
        firedYesterday: [7],
        now: on(today, '00:30'),
      }),
    ).toBeNull();
  });

  it('gives way to an hour somebody chose, due or not', () => {
    expect(open({ rules: [{ shiftId: 7, at: '12:00' }] })).toBeNull();

    const ruled = open({ rules: [{ shiftId: 7, at: '11:03' }] })!;

    expect(ruled.ruled).toBe(true);
    expect(new Date(ruled.startedAt).getTime()).toBe(on(today, '11:03'));
  });

  it('still opens where the rule only sets a stop', () => {
    expect(open({ rules: [{ shiftId: 7, at: null, stopAt: '21:00' }] })?.ruled).toBe(false);
  });

  it('never starts a chosen hour for last night’s entry', () => {
    expect(
      open({
        rules: [{ shiftId: 7, at: '11:03' }],
        planned: [{ shiftId: 7, date: '2026-11-01' }],
      }),
    ).toBeNull();
  });

  it('stays out of a template that does not open by itself', () => {
    expect(open({ planned: [{ shiftId: 7, date: today }] })).toBeNull();
  });
});

describe('which planned shifts can start', () => {
  const entry = (over: Partial<DayShiftEntry> = {}) =>
    ({
      shift_id: 7,
      start_time: '11:00',
      end_time: '22:00',
      worked: false,
      needs_cover: false,
      actual_start: null,
      actual_end: null,
      auto_closed: false,
      ...over,
    }) as DayShiftEntry;
  const day = (...shifts: DayShiftEntry[]) =>
    ({ date: '2026-11-02', shifts }) as CalendarDayData;
  const template = (over: Partial<ShiftTemplate> = {}) =>
    ({ id: 7, auto_clock: true, archived: false, ...over }) as ShiftTemplate;
  const hour = (time: string) => new Date(`2026-11-02T${time}:00`).getTime();

  it('reads the window off the entry, not the template', () => {
    // A rota can sit a shift on other hours than its template's.
    const [plan] = plannedClocks(
      [day(entry({ start_time: '13:00', end_time: '23:00' }))],
      [template({ start_time: '09:00', end_time: '17:00' })],
    );

    expect(plan.window).toEqual({ opens: hour('13:00'), closes: hour('23:00') });
    expect(plan.date).toBe('2026-11-02');
  });

  it('opens at Фактически where it was set in advance', () => {
    const [plan] = plannedClocks([day(entry({ actual_start: '10:40' }))], [template()]);

    expect(plan.window?.opens).toBe(hour('10:40'));
  });

  it('leaves out what is worked, handed over or told to stay shut', () => {
    const days = [
      day(entry({ worked: true }), entry({ needs_cover: true }), entry({ auto_closed: true })),
    ];

    expect(plannedClocks(days, [template()])).toEqual([]);
  });

  it('offers no window with the clock off, on an archived shift or an unknown one', () => {
    expect(plannedClocks([day(entry())], [template({ auto_clock: false })])[0].window).toBeUndefined();
    expect(plannedClocks([day(entry())], [template({ archived: true })])[0].window).toBeUndefined();
    expect(plannedClocks([day(entry())], [])[0].window).toBeUndefined();
  });

  it('skips a day not loaded yet', () => {
    expect(plannedClocks([undefined], [template()])).toEqual([]);
  });
});

describe('an hour chosen on a template that varies by day', () => {
  // Monday to Thursday by the default, Friday to 23:00, the weekend from 13:00.
  const varied = (over: Partial<ShiftTemplate> = {}) =>
    ({
      id: 7,
      auto_clock: true,
      archived: false,
      start_time: '11:00',
      end_time: '22:00',
      week_hours: [
        { weekday: 5, start_time: '11:00', end_time: '23:00' },
        { weekday: 6, start_time: '13:00', end_time: '23:00' },
        { weekday: 7, start_time: '13:00', end_time: '23:00' },
      ],
      ...over,
    }) as ShiftTemplate;
  const placed = (date: string, start_time: string, end_time: string) =>
    ({
      date,
      shifts: [
        {
          shift_id: 7,
          start_time,
          end_time,
          worked: false,
          needs_cover: false,
          actual_start: null,
          actual_end: null,
          auto_closed: false,
        },
      ],
    }) as unknown as CalendarDayData;
  const on = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();
  const saturday = '2026-11-07';
  const monday = '2026-11-02';
  const friday = '2026-11-06';
  const start = (
    date: string,
    time: string,
    plan: CalendarDayData,
    template: ShiftTemplate,
    at_ = '11:00',
  ) =>
    dueAutoStart({
      rules: [{ shiftId: 7, at: at_ }],
      planned: plannedClocks([plan], [template]),
      liveRunning: false,
      firedToday: [],
      now: on(date, time),
      today: date,
    });

  it('does not start a Saturday two hours early', () => {
    expect(start(saturday, '11:01', placed(saturday, '13:00', '23:00'), varied())).toBeNull();
  });

  it('leaves that Saturday to its own opening', () => {
    const due = start(saturday, '13:05', placed(saturday, '13:00', '23:00'), varied())!;

    expect(new Date(due.startedAt).getTime()).toBe(on(saturday, '13:00'));
    expect(due.ruled).toBe(false);
  });

  it('still fires on the days it was set for', () => {
    const due = start(monday, '10:46', placed(monday, '11:00', '22:00'), varied(), '10:45')!;

    expect(new Date(due.startedAt).getTime()).toBe(on(monday, '10:45'));
    expect(due.ruled).toBe(true);
  });

  it('still fires on a day that only ends differently', () => {
    const due = start(friday, '10:46', placed(friday, '11:00', '23:00'), varied(), '10:45')!;

    expect(due.ruled).toBe(true);
  });

  it('starts nothing on such a day with the clock off', () => {
    const quiet = varied({ auto_clock: false });

    expect(start(saturday, '11:01', placed(saturday, '13:00', '23:00'), quiet)).toBeNull();
    expect(start(saturday, '13:05', placed(saturday, '13:00', '23:00'), quiet)).toBeNull();
  });

  it('stands on any hours where the template has no weekday rows', () => {
    // A rota can place it off its hours, and the rule was all this template had to say.
    const plain = varied({ week_hours: [] });
    const due = start(monday, '11:01', placed(monday, '14:00', '22:00'), plain)!;

    expect(due.ruled).toBe(true);
  });

  it('waits to hear what the template is', () => {
    const due = dueAutoStart({
      rules: [{ shiftId: 7, at: '11:00' }],
      planned: plannedClocks([placed(saturday, '13:00', '23:00')], []),
      liveRunning: false,
      firedToday: [],
      now: on(saturday, '11:01'),
      today: saturday,
    });

    expect(due).toBeNull();
  });

  describe('for the stop', () => {
    const rule = { shiftId: 7, at: null, stopAt: '22:00' };
    const stop = (date: string, time: string, end: string) =>
      dueAutoStop({
        stopAt: stopHourFor(rule, varied(), end),
        startedMs: on(date, '11:00'),
        plannedEndMs: on(date, end),
        closesMs: on(date, end),
        now: on(date, time),
      });

    it('does not cut a Friday an hour short', () => {
      expect(stop(friday, '22:01', '23:00')).toBeNull();
    });

    it('lets that Friday close at its own end', () => {
      const decision = stop(friday, '23:01', '23:00')!;

      expect(new Date(decision.endsAt).getTime()).toBe(on(friday, '23:00'));
      expect(decision.closing).toBe(true);
    });

    it('still stops the days it was set for', () => {
      const decision = stop(monday, '22:01', '22:00')!;

      expect(new Date(decision.endsAt).getTime()).toBe(on(monday, '22:00'));
      expect(decision.closing).toBe(false);
    });

    it('stands on any hours where the template has no weekday rows', () => {
      expect(stopHourFor(rule, varied({ week_hours: [] }), '23:00')).toBe('22:00');
    });

    it('says nothing where there is no stop, or no template to judge it by', () => {
      expect(stopHourFor(undefined, varied(), '22:00')).toBeNull();
      expect(stopHourFor({ shiftId: 7, at: '11:00' }, varied(), '22:00')).toBeNull();
      expect(stopHourFor(rule, undefined, '22:00')).toBeNull();
    });
  });
});

describe('the record of what fired', () => {
  it('keeps each date apart', () => {
    const fired = noteFired(noteFired({}, 7, '2026-11-01'), 7, '2026-11-02');

    expect(fired).toEqual({ '2026-11-01': [7], '2026-11-02': [7] });
  });

  it('does not repeat itself', () => {
    expect(noteFired({ '2026-11-02': [7] }, 7, '2026-11-02')['2026-11-02']).toEqual([7]);
  });

  it('forgets days too old for any shift to still be running', () => {
    const fired = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].reduce(
      (all, day) => noteFired(all, 7, day),
      {},
    );

    expect(Object.keys(fired).sort()).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('reads the record an older install left', () => {
    expect(readFired(JSON.stringify({ day: '2026-11-02', shiftIds: [7] }))).toEqual({
      '2026-11-02': [7],
    });
    expect(readFired(null)).toEqual({});
  });
});

describe('a start moved past the plan', () => {
  const MONDAY = '2026-11-02';
  const moment = (time: string, date = MONDAY) => new Date(`${date}T${time}:00`).getTime();
  const template = { id: 7, start_time: '09:00', end_time: '17:00', auto_clock: true, archived: false, week_hours: [] } as unknown as ShiftTemplate;
  const placed = (actual_start: string) =>
    ({
      date: MONDAY,
      shifts: [
        {
          shift_id: 7,
          start_time: '09:00',
          end_time: '17:00',
          actual_start,
          actual_end: null,
          worked: false,
          needs_cover: false,
          auto_closed: false,
        } as DayShiftEntry,
      ],
    }) as CalendarDayData;
  const due = (actual_start: string, now: number, today = MONDAY) =>
    dueAutoStart({
      rules: [],
      planned: plannedClocks([placed(actual_start)], [template]),
      liveRunning: false,
      firedToday: [],
      now,
      today,
    });

  it('does not open the evening before, which the shared rule would call the start', () => {
    expect(due('22:00', moment('10:00'))).toBeNull();
  });

  it('opens on the evening the row names', () => {
    expect(new Date(due('22:00', moment('22:01'))!.startedAt).getTime()).toBe(moment('22:00'));
  });

  it('does not open past the limit, where the server has stopped it', () => {
    expect(due('18:00', moment('10:00', '2026-11-03'), '2026-11-03')).toBeNull();
  });
});
