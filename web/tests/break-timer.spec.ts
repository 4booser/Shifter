import { describe, expect, it } from 'vitest';

import {
  BreakRun,
  clock,
  foldBreak,
  readRun,
  readTimed,
  remaining,
  runaway,
  taken,
} from '@/lib/calendar/break-timer';

const run: BreakRun = {
  dayKey: '2026-03-14',
  shiftId: 7,
  startedAt: Date.parse('2026-03-14T15:00:00Z'),
  planned: 30,
};

const at = (time: string) => Date.parse(`2026-03-14T${time}Z`);

describe('the countdown', () => {
  it('counts down to the planned end', () => {
    expect(remaining(run, at('15:00:00'))).toBe(1_800);
    expect(remaining(run, at('15:20:00'))).toBe(600);
  });

  it('keeps counting past it rather than stopping at zero', () => {
    // The overrun is the interesting part. A timer that parked on 0:00 would
    // hide exactly the minutes somebody needs to see.
    expect(remaining(run, at('15:41:00'))).toBe(-660);
    expect(clock(-660)).toBe('−11:00');
  });

  it('spells a countdown the way a clock does', () => {
    expect(clock(1_800)).toBe('30:00');
    expect(clock(65)).toBe('1:05');
    expect(clock(9)).toBe('0:09');
  });
});

describe('what gets written down', () => {
  it('records the time that passed, not the time that was planned', () => {
    // Forty-seven minutes of a thirty-minute break is forty-seven minutes.
    // Writing the plan would be the app keeping somebody's timesheet.
    expect(taken(run, at('15:47:00'))).toBe(47);
  });

  it('rounds a part-minute up so a real break is never nothing', () => {
    expect(taken(run, at('15:00:20'))).toBe(1);
    expect(taken(run, at('15:10:01'))).toBe(11);
  });

  it('knows a break nobody ever came back from', () => {
    // A laptop shut at the end of a shift. Six hours arriving by itself in
    // somebody's paid hours is the worst kind of wrong number.
    expect(runaway(run, at('17:00:00'))).toBe(false);
    expect(runaway(run, at('21:00:00'))).toBe(true);
  });
});

describe('the break that survives a refresh', () => {
  it('comes back on the day it belongs to', () => {
    expect(readRun(JSON.stringify(run), '2026-03-14')).toEqual(run);
  });

  it('is dropped on any other day', () => {
    // Opening the app tomorrow to yesterday's running break would write
    // yesterday's hours wrong, quietly.
    expect(readRun(JSON.stringify(run), '2026-03-15')).toBeNull();
  });

  it('survives junk in the store without taking the page with it', () => {
    expect(readRun('not json', '2026-03-14')).toBeNull();
    expect(readRun('{"dayKey":"2026-03-14"}', '2026-03-14')).toBeNull();
    expect(readRun(null, '2026-03-14')).toBeNull();
  });
});

describe('what a timed break does to the minutes already there', () => {
  it('replaces the break a template assumed', () => {
    // A template can apply half an hour automatically — an assumption about
    // what this shift usually does. The timed one is a fact, and adding it to
    // the assumption costs somebody a full hour of paid time instead of half.
    expect(foldBreak(30, 30, false)).toBe(30);
    expect(foldBreak(30, 47, false)).toBe(47);
  });

  it('adds a second break to the first', () => {
    expect(foldBreak(30, 15, true)).toBe(45);
  });

  it('remembers which placements it has already spoken for today', () => {
    const raw = JSON.stringify({ dayKey: '2026-03-14', shiftIds: [7, 9] });

    expect(readTimed(raw, '2026-03-14')).toEqual([7, 9]);
  });

  it('forgets them on any other day', () => {
    // Otherwise tomorrow's first break adds to tomorrow's assumption instead
    // of replacing it.
    const raw = JSON.stringify({ dayKey: '2026-03-14', shiftIds: [7] });

    expect(readTimed(raw, '2026-03-15')).toEqual([]);
  });

  it('survives junk in the store', () => {
    expect(readTimed('not json', '2026-03-14')).toEqual([]);
    expect(readTimed('{"dayKey":"2026-03-14"}', '2026-03-14')).toEqual([]);
    expect(readTimed(null, '2026-03-14')).toEqual([]);
  });
});
