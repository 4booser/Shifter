import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ShiftTemplate } from '@/lib/calendar/models';
import {
  atLocal,
  flatOf,
  hasEmptyRow,
  hoursLabel,
  hoursOn,
  isoWeekday,
  rowsOf,
  shiftWindow,
  startedAfterPlan,
  toggleWeekday,
  workedByDefault,
} from '@/lib/calendar/shift-hours';

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
  week_hours: [],
  auto_clock: true,
  ...over,
});

const MONDAY = '2026-11-02';

// As ShiftWindowTests.cs and the phone's suite draw it.
describe('startedAfterPlan', () => {
  const started = (start_time: string, end_time: string, actual_start: string | null, actual_end: string | null = null) =>
    startedAfterPlan(MONDAY, { start_time, end_time, actual_start, actual_end });

  it('places a start past the close on its own day', () => {
    expect(started('09:00', '17:00', '18:00')).toBe('2026-11-02T18:00');
    expect(started('09:00', '17:00', '22:00')).toBe('2026-11-02T22:00');
    expect(started('09:00', '17:00', '17:00')).toBe('2026-11-02T17:00');
    expect(started('22:00', '02:00', '05:00')).toBe('2026-11-03T05:00');
  });

  it('has nothing to say about a start early or inside the plan', () => {
    expect(started('09:00', '17:00', '08:30')).toBeNull();
    expect(started('09:00', '17:00', '12:00')).toBeNull();
    expect(started('11:00', '22:00', '10:40')).toBeNull();
    expect(started('22:00', '02:00', '00:30')).toBeNull();
    expect(started('22:00', '02:00', '21:30')).toBeNull();
  });

  it('leaves an end said beside the start to the shared rule', () => {
    expect(started('09:00', '17:00', '22:00', '23:30')).toBeNull();
  });

  it('has nothing to go on with no start', () => {
    expect(started('09:00', '17:00', null)).toBeNull();
  });
});

// The same vectors as ShiftWindowTests.cs and the phone's suite. The server
// closing a shift and a client watching it close have to agree to the minute.
describe('shiftWindow', () => {
  it('a) reads a plain day shift off the plan', () => {
    expect(shiftWindow(MONDAY, { start_time: '11:00', end_time: '22:00' })).toEqual({
      opens: '2026-11-02T11:00',
      closes: '2026-11-02T22:00',
    });
  });

  it('b) closes a night shift on the next date', () => {
    expect(shiftWindow(MONDAY, { start_time: '22:00', end_time: '02:00' }).closes).toBe('2026-11-03T02:00');
  });

  it('c) reads an edge past midnight as inside that night', () => {
    expect(
      shiftWindow(MONDAY, { start_time: '22:00', end_time: '02:00', actual_start: '00:30' }),
    ).toEqual({ opens: '2026-11-03T00:30', closes: '2026-11-03T02:00' });
  });

  it('d) reads an early finish as before midnight', () => {
    expect(
      shiftWindow(MONDAY, { start_time: '18:00', end_time: '02:00', actual_end: '23:30' }).closes,
    ).toBe('2026-11-02T23:30');
  });

  it('e) honours both edges where they sit close to the plan', () => {
    expect(
      shiftWindow(MONDAY, {
        start_time: '11:00',
        end_time: '22:00',
        actual_start: '10:40',
        actual_end: '23:10',
      }),
    ).toEqual({ opens: '2026-11-02T10:40', closes: '2026-11-02T23:10' });
  });

  it('f) carries a late finish past midnight', () => {
    expect(
      shiftWindow(MONDAY, { start_time: '13:00', end_time: '23:00', actual_end: '00:20' }).closes,
    ).toBe('2026-11-03T00:20');
  });

  it('gives a tie at exactly twelve hours to the later occurrence', () => {
    expect(
      shiftWindow(MONDAY, { start_time: '12:00', end_time: '20:00', actual_start: '00:00' }).opens,
    ).toBe('2026-11-03T00:00');
    expect(
      shiftWindow(MONDAY, { start_time: '06:00', end_time: '20:00', actual_start: '18:00' }).opens,
    ).toBe('2026-11-02T18:00');
  });

  it('moves the close a day on when it would fall at or before the open', () => {
    expect(
      shiftWindow(MONDAY, { start_time: '11:00', end_time: '22:00', actual_start: '22:30' }).closes,
    ).toBe('2026-11-03T22:00');
  });

  it('crosses a month and a year', () => {
    expect(shiftWindow('2026-12-31', { start_time: '22:00', end_time: '02:00' }).closes).toBe('2027-01-01T02:00');
  });
});

describe('atLocal', () => {
  it('reads wall-clock text on this device', () => {
    expect(atLocal('2026-11-02T22:00')).toBe(new Date(2026, 10, 2, 22, 0).getTime());
  });

  describe('around a change of the clocks', () => {
    const zone = process.env.TZ;

    beforeAll(() => {
      process.env.TZ = 'Europe/Kyiv';
    });

    afterAll(() => {
      process.env.TZ = zone;
    });

    it('lands a time the clocks skip past the jump, without throwing', () => {
      expect(atLocal('2026-03-29T03:30')).toBe(Date.UTC(2026, 2, 29, 1, 30));
    });

    it('takes the later of a time the clocks repeat, as the server does', () => {
      expect(atLocal('2026-10-25T03:30')).toBe(Date.UTC(2026, 9, 25, 1, 30));
    });
  });
});

describe('isoWeekday', () => {
  it('counts Monday as 1 and Sunday as 7', () => {
    expect(isoWeekday('2026-11-02')).toBe(1);
    expect(isoWeekday('2026-11-06')).toBe(5);
    expect(isoWeekday('2026-11-07')).toBe(6);
    expect(isoWeekday('2026-11-08')).toBe(7);
  });
});

describe('hoursOn', () => {
  const weekly = template({
    week_hours: [
      { weekday: 5, start_time: '11:00', end_time: '23:00' },
      { weekday: 6, start_time: '13:00', end_time: '23:00' },
      { weekday: 7, start_time: '13:00', end_time: '23:00' },
    ],
  });

  it('falls back to the usual hours on a weekday with no entry', () => {
    expect(hoursOn(weekly, '2026-11-02')).toEqual({ start_time: '11:00', end_time: '22:00', hours: 10.5 });
  });

  it('takes the weekday’s own hours, with the break out', () => {
    expect(hoursOn(weekly, '2026-11-06')).toEqual({ start_time: '11:00', end_time: '23:00', hours: 11.5 });
    expect(hoursOn(weekly, '2026-11-07')).toEqual({ start_time: '13:00', end_time: '23:00', hours: 9.5 });
    expect(hoursOn(weekly, '2026-11-08').start_time).toBe('13:00');
  });

  it('prices an overnight weekday across midnight', () => {
    const night = template({ week_hours: [{ weekday: 5, start_time: '22:00', end_time: '02:00' }] });

    expect(hoursOn(night, '2026-11-06').hours).toBe(3.5);
  });

  it('never goes under nothing when the break outlasts the day', () => {
    const short = template({
      break_minutes: 120,
      week_hours: [{ weekday: 1, start_time: '11:00', end_time: '12:00' }],
    });

    expect(hoursOn(short, MONDAY).hours).toBe(0);
  });
});

describe('hoursLabel', () => {
  const t = (key: string) => key;

  it('is the plain time for a template that runs one set of hours', () => {
    expect(hoursLabel(template(), t)).toBe('11:00–22:00');
  });

  it('marks one that varies, keeping the default time', () => {
    const label = hoursLabel(
      template({ week_hours: [{ weekday: 5, start_time: '11:00', end_time: '23:00' }] }),
      t,
    );

    expect(label).toContain('11:00–22:00');
    expect(label).toContain('varies by day');
  });
});

describe('the weekday rows', () => {
  const stored = [
    { weekday: 7, start_time: '13:00', end_time: '23:00' },
    { weekday: 5, start_time: '11:00', end_time: '23:00' },
    { weekday: 6, start_time: '13:00', end_time: '23:00' },
  ];

  it('groups identical times into one row, earliest weekday first', () => {
    expect(rowsOf(stored)).toEqual([
      { weekdays: [5], start: '11:00', end: '23:00' },
      { weekdays: [6, 7], start: '13:00', end: '23:00' },
    ]);
  });

  it('flattens back to what the server stores', () => {
    expect(flatOf(rowsOf(stored))).toEqual([
      { weekday: 5, start_time: '11:00', end_time: '23:00' },
      { weekday: 6, start_time: '13:00', end_time: '23:00' },
      { weekday: 7, start_time: '13:00', end_time: '23:00' },
    ]);
  });

  it('sends nothing for no rows and nothing for a row with no days', () => {
    expect(flatOf([])).toEqual([]);
    expect(flatOf([{ weekdays: [], start: '11:00', end: '23:00' }])).toEqual([]);
  });

  it('takes a weekday from another row when it is picked here', () => {
    const rows = toggleWeekday(rowsOf(stored), 0, 6);

    expect(rows[0].weekdays).toEqual([5, 6]);
    expect(rows[1].weekdays).toEqual([7]);
  });

  it('lets a weekday go when it is pressed again', () => {
    expect(toggleWeekday(rowsOf(stored), 1, 7)[1].weekdays).toEqual([6]);
  });
});

describe('hasEmptyRow', () => {
  const row = (...weekdays: number[]) => ({ weekdays, start: '13:00', end: '23:00' });

  it('catches a row saved with no days, which would otherwise vanish', () => {
    expect(hasEmptyRow([row(5), row()])).toBe(true);
  });

  it('catches a row whose last day was picked up by another', () => {
    const rows = toggleWeekday([row(6), row(7)], 1, 6);

    expect(hasEmptyRow(rows)).toBe(true);
  });

  it('passes rows that all say something, and no rows at all', () => {
    expect(hasEmptyRow([row(5), row(6, 7)])).toBe(false);
    expect(hasEmptyRow([])).toBe(false);
  });
});

describe('workedByDefault', () => {
  it('leaves a shift that closes itself planned until it is over', () => {
    const today = '2026-11-02';

    expect(workedByDefault(template(), today, new Date(2026, 10, 2, 12).getTime())).toBe(false);
    expect(workedByDefault(template(), today, new Date(2026, 10, 2, 22).getTime())).toBe(true);
  });

  it('takes the date’s own hours', () => {
    const friday = template({ week_hours: [{ weekday: 5, start_time: '11:00', end_time: '23:00' }] });

    expect(workedByDefault(friday, '2026-11-06', new Date(2026, 10, 6, 22, 30).getTime())).toBe(false);
  });

  it('keeps the old rule for one that does not: worked from its date on', () => {
    const manual = template({ auto_clock: false });

    expect(workedByDefault(manual, '2000-01-03', 0)).toBe(true);
    expect(workedByDefault(manual, '2099-01-03', 0)).toBe(false);
  });
});
