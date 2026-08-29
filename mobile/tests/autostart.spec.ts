import { describe, expect, it } from 'vitest';

import { dueAutoStart } from '@/lib/autostart';

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
