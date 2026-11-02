/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  clockDue,
  clockWindow,
  closesItself,
  flipNeedsAnswer,
  placedWorked,
  shiftWindow,
  startedAfterPlan,
  thrownAway,
  toldNo,
} from '@/lib/shift-window';
import { hoursOn, isoWeekday, templateHoursOn } from '@/lib/types';

const shown = (at: Date) =>
  `${`${at.getMonth() + 1}`.padStart(2, '0')}-${`${at.getDate()}`.padStart(2, '0')} `
  + `${`${at.getHours()}`.padStart(2, '0')}:${`${at.getMinutes()}`.padStart(2, '0')}`;

/** The same vectors the server and the web are held to: a phone and a server closing one shift have to agree. */
describe('around a change of the clocks', () => {
  const zone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Europe/Kyiv';
  });

  afterAll(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });

  it('lands a time the clocks skip past the jump, without throwing', () => {
    expect(shiftWindow('2026-03-28', '22:00', '03:30').closes.getTime()).toBe(
      Date.UTC(2026, 2, 29, 1, 30),
    );
  });

  it('takes the later of a time the clocks repeat, as the server and the web do', () => {
    // 22:00–03:30 closing an hour early on the phone is a clock stopped while
    // the server still calls the shift open.
    expect(shiftWindow('2026-10-24', '22:00', '03:30').closes.getTime()).toBe(
      Date.UTC(2026, 9, 25, 1, 30),
    );
  });

  it('leaves the hours either side of the repeat alone', () => {
    expect(shiftWindow('2026-10-24', '22:00', '02:30').closes.getTime()).toBe(
      Date.UTC(2026, 9, 24, 23, 30),
    );
    expect(shiftWindow('2026-10-24', '22:00', '04:30').closes.getTime()).toBe(
      Date.UTC(2026, 9, 25, 2, 30),
    );
  });

  it('holds the repeat to an opening as well', () => {
    expect(shiftWindow('2026-10-25', '03:30', '11:00').opens.getTime()).toBe(
      Date.UTC(2026, 9, 25, 1, 30),
    );
  });
});

// As ShiftWindowTests.cs and the web's suite draw it.
describe('a start past the plan', () => {
  const monday = '2026-11-02';
  const started = (start: string, end: string, actualStart: string | null, actualEnd: string | null = null) => {
    const late = startedAfterPlan(monday, start, end, actualStart, actualEnd);

    return late === null ? null : shown(late);
  };

  it('sits on its own day', () => {
    expect(started('09:00', '17:00', '18:00')).toBe('11-02 18:00');
    expect(started('09:00', '17:00', '22:00')).toBe('11-02 22:00');
    expect(started('09:00', '17:00', '17:00')).toBe('11-02 17:00');
    expect(started('22:00', '02:00', '05:00')).toBe('11-03 05:00');
  });

  it('has nothing to do with a start early or inside the plan', () => {
    expect(started('09:00', '17:00', '08:30')).toBeNull();
    expect(started('09:00', '17:00', '12:00')).toBeNull();
    expect(started('11:00', '22:00', '10:40')).toBeNull();
    expect(started('22:00', '02:00', '00:30')).toBeNull();
    expect(started('22:00', '02:00', '21:30')).toBeNull();
  });

  it('leaves an end said beside it to the shared rule', () => {
    expect(started('09:00', '17:00', '22:00', '23:30')).toBeNull();
  });

  it('has nothing to go on with no start', () => {
    expect(started('09:00', '17:00', null)).toBeNull();
  });

  it('runs a clock from there to the limit, where the server stops it', () => {
    const { opens, closes } = clockWindow(monday, {
      start_time: '09:00',
      end_time: '17:00',
      actual_start: '22:00',
      actual_end: null,
    });

    expect(shown(opens)).toBe('11-02 22:00');
    expect(shown(closes)).toBe('11-03 14:00');
  });

  it('leaves any other window to the shared rule', () => {
    const { opens, closes } = clockWindow(monday, {
      start_time: '11:00',
      end_time: '22:00',
      actual_start: '10:40',
      actual_end: null,
    });

    expect(shown(opens)).toBe('11-02 10:40');
    expect(shown(closes)).toBe('11-02 22:00');
  });
});

describe('when a shift opens and closes', () => {
  const monday = '2026-11-02';

  it('a) runs by the plan with nothing else said', () => {
    const { opens, closes } = shiftWindow(monday, '11:00', '22:00');

    expect(shown(opens)).toBe('11-02 11:00');
    expect(shown(closes)).toBe('11-02 22:00');
  });

  it('b) carries a night shift over midnight', () => {
    expect(shown(shiftWindow(monday, '22:00', '02:00').closes)).toBe('11-03 02:00');
  });

  it('c) reads a start after midnight as inside that night', () => {
    const { opens, closes } = shiftWindow(monday, '22:00', '02:00', '00:30');

    expect(shown(opens)).toBe('11-03 00:30');
    expect(shown(closes)).toBe('11-03 02:00');
  });

  it('d) brings an early finish back before midnight', () => {
    expect(shown(shiftWindow(monday, '18:00', '02:00', null, '23:30').closes)).toBe('11-02 23:30');
  });

  it('e) takes both edges a little off the plan', () => {
    const { opens, closes } = shiftWindow(monday, '11:00', '22:00', '10:40', '23:10');

    expect(shown(opens)).toBe('11-02 10:40');
    expect(shown(closes)).toBe('11-02 23:10');
  });

  it('f) lets a late finish run past midnight', () => {
    expect(shown(shiftWindow(monday, '13:00', '23:00', null, '00:20').closes)).toBe('11-03 00:20');
  });

  it('gives a tie at exactly twelve hours to the later occurrence', () => {
    expect(shown(shiftWindow(monday, '12:00', '13:00', '00:00').opens)).toBe('11-03 00:00');
    expect(shown(shiftWindow(monday, '00:00', '01:00', '12:00').opens)).toBe('11-02 12:00');
  });

  it('pushes a close that lands before the open to the next day', () => {
    const { opens, closes } = shiftWindow(monday, '11:00', '22:00', '21:00', '20:00');

    expect(shown(opens)).toBe('11-02 21:00');
    expect(shown(closes)).toBe('11-03 20:00');
  });

  it('treats a day-long shift as ending at the same time tomorrow', () => {
    expect(shown(shiftWindow(monday, '11:00', '11:00').closes)).toBe('11-03 11:00');
  });

  it('ignores an edge that is not a time', () => {
    expect(shown(shiftWindow(monday, '11:00', '22:00', 'вечером', '2').closes)).toBe('11-02 22:00');
  });

  it('survives the night the clocks skip', () => {
    expect(() => shiftWindow('2026-03-29', '03:30', '04:30').opens.getTime()).not.toThrow();
    expect(Number.isNaN(shiftWindow('2026-03-29', '03:30', '04:30').opens.getTime())).toBe(false);
  });
});

describe('weekday hours', () => {
  const template = {
    start_time: '11:00',
    end_time: '22:00',
    break_minutes: 30,
    week_hours: [
      { weekday: 5, start_time: '11:00', end_time: '23:00' },
      { weekday: 6, start_time: '13:00', end_time: '23:00' },
      { weekday: 7, start_time: '13:00', end_time: '23:00' },
    ],
  };

  it('numbers the days the ISO way', () => {
    expect(isoWeekday('2026-11-02')).toBe(1);
    expect(isoWeekday('2026-11-06')).toBe(5);
    expect(isoWeekday('2026-11-07')).toBe(6);
    expect(isoWeekday('2026-11-08')).toBe(7);
  });

  it('keeps the usual hours on a day with no entry of its own', () => {
    expect(hoursOn(template, '2026-11-02')).toEqual({ start_time: '11:00', end_time: '22:00' });
  });

  it('runs a weekday with its own entry on those hours', () => {
    expect(hoursOn(template, '2026-11-06')).toEqual({ start_time: '11:00', end_time: '23:00' });
    expect(hoursOn(template, '2026-11-07')).toEqual({ start_time: '13:00', end_time: '23:00' });
    expect(hoursOn(template, '2026-11-08')).toEqual({ start_time: '13:00', end_time: '23:00' });
  });

  it('copes with a template the server has not told about weekdays', () => {
    const { week_hours: _none, ...plain } = template;

    expect(hoursOn(plain, '2026-11-06')).toEqual({ start_time: '11:00', end_time: '22:00' });
  });

  it('prices the day on the hours it actually runs', () => {
    expect(templateHoursOn(template, '2026-11-02')).toBe(10.5);
    expect(templateHoursOn(template, '2026-11-06')).toBe(11.5);
    expect(templateHoursOn(template, '2026-11-08')).toBe(9.5);
  });
});

describe('whether a shift counts as worked the moment it is put on a day', () => {
  const clocked = {
    start_time: '11:00',
    end_time: '22:00',
    auto_clock: true,
    week_hours: [{ weekday: 5, start_time: '11:00', end_time: '23:00' }],
  };

  it('keeps a shift painted on today planned until it is over', () => {
    expect(placedWorked(clocked, '2026-11-02', new Date(2026, 10, 2, 12, 0))).toBe(false);
    expect(placedWorked(clocked, '2026-11-02', new Date(2026, 10, 2, 22, 0))).toBe(true);
  });

  it('reads the close off that weekday’s hours', () => {
    expect(placedWorked(clocked, '2026-11-06', new Date(2026, 10, 6, 22, 30))).toBe(false);
  });

  it('marks an earlier day worked and a later one planned', () => {
    expect(placedWorked(clocked, '2026-11-01', new Date(2026, 10, 2, 12, 0))).toBe(true);
    expect(placedWorked(clocked, '2026-11-03', new Date(2026, 10, 2, 12, 0))).toBe(false);
  });

  it('keeps the old line by the date with the clock off', () => {
    const off = { ...clocked, auto_clock: false };

    expect(placedWorked(off, '2026-11-02', new Date(2026, 10, 2, 12, 0))).toBe(true);
    expect(placedWorked(off, '2026-11-03', new Date(2026, 10, 2, 12, 0))).toBe(false);
  });
});

describe('where the phone has to act on a planned shift', () => {
  const entry = { start_time: '22:00', end_time: '02:00', actual_start: null, actual_end: null };

  it('offers Фактически on a shift due today', () => {
    expect(clockDue('2026-11-02', entry, new Date(2026, 10, 2, 9, 0))).toBe(true);
  });

  it('offers it past midnight while last night is still running', () => {
    expect(clockDue('2026-11-02', entry, new Date(2026, 10, 3, 1, 0))).toBe(true);
    expect(clockDue('2026-11-02', entry, new Date(2026, 10, 3, 3, 0))).toBe(false);
  });

  it('keeps it off a day ahead', () => {
    expect(clockDue('2026-11-03', entry, new Date(2026, 10, 2, 9, 0))).toBe(false);
  });

  const template = { auto_clock: true, archived: false };

  it('tells the close to keep out of a flip made after the shift was over', () => {
    expect(flipNeedsAnswer(template, '2026-11-02', entry, new Date(2026, 10, 3, 3, 0))).toBe(true);
  });

  it('says nothing for a flip while the shift still runs', () => {
    expect(flipNeedsAnswer(template, '2026-11-02', entry, new Date(2026, 10, 3, 1, 0))).toBe(false);
  });

  it('says nothing where the server would not close it anyway', () => {
    const now = new Date(2026, 10, 3, 3, 0);

    expect(flipNeedsAnswer({ auto_clock: false, archived: false }, '2026-11-02', entry, now)).toBe(false);
    expect(flipNeedsAnswer({ auto_clock: true, archived: true }, '2026-11-02', entry, now)).toBe(false);
    expect(flipNeedsAnswer(undefined, '2026-11-02', entry, now)).toBe(false);
  });
});

describe('a shift told to keep the close out', () => {
  const planned = { worked: false, auto_closed: true, actual_start: null, actual_end: null };
  const clockOn = { auto_clock: true, archived: false };

  it('is a stamp on a shift still planned', () => {
    expect(toldNo(planned)).toBe(true);
    expect(toldNo({ ...planned, worked: true })).toBe(false);
    expect(toldNo({ ...planned, auto_closed: false })).toBe(false);
    expect(toldNo(undefined)).toBe(false);
  });

  it('does not close itself, whatever its template says', () => {
    expect(closesItself(clockOn, planned)).toBe(false);
    expect(closesItself(clockOn, { ...planned, auto_closed: false })).toBe(true);
  });

  it('closes itself on nothing the template rules out', () => {
    const open = { ...planned, auto_closed: false };

    expect(closesItself({ auto_clock: false, archived: false }, open)).toBe(false);
    expect(closesItself({ auto_clock: true, archived: true }, open)).toBe(false);
    expect(closesItself(undefined, open)).toBe(false);
  });

  it('reads as thrown away when a closing clock finds nothing written on it', () => {
    expect(thrownAway(planned, true)).toBe(true);
  });

  it('does not read so with a start written, or a clock somebody started since', () => {
    expect(thrownAway({ ...planned, actual_start: '11:00' }, true)).toBe(false);
    expect(thrownAway({ ...planned, actual_end: '22:00' }, true)).toBe(false);
    expect(thrownAway(planned, false)).toBe(false);
  });

  it('does not read so on a shift nobody answered', () => {
    expect(thrownAway({ ...planned, auto_closed: false }, true)).toBe(false);
    expect(thrownAway({ ...planned, worked: true }, true)).toBe(false);
    expect(thrownAway(undefined, true)).toBe(false);
  });
});
