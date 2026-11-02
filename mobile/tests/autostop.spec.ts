import { describe, expect, it } from 'vitest';

import { dueAutoStop, FORGOTTEN_AFTER } from '@/lib/autostart';

/**
 * The hour a shift closes itself, against the plan's own end.
 *
 * The case that drove it: a сутки shift planned 11:00 → 11:00, clocked in at
 * 10:30 and set to stop «at 10:45». That is a quarter to eleven the following
 * morning; reading it as the clock's next occurrence would end the shift
 * fifteen minutes after it began.
 */
const at = (iso: string) => new Date(iso).getTime();

describe('the hour a shift stops itself', () => {
  it('reads the hour against the plan, not against the start', () => {
    const decision = dueAutoStop({
      stopAt: '10:45',
      startedMs: at('2026-09-01T10:30:00'),
      plannedEndMs: at('2026-09-02T11:00:00'),
      now: at('2026-09-02T10:46:00'),
    });

    expect(decision).not.toBeNull();
    expect(new Date(decision!.endsAt).getHours()).toBe(10);
    expect(new Date(decision!.endsAt).getDate()).toBe(2);
  });

  it('says nothing before the hour comes round', () => {
    expect(
      dueAutoStop({
        stopAt: '10:45',
        startedMs: at('2026-09-01T10:30:00'),
        plannedEndMs: at('2026-09-02T11:00:00'),
        now: at('2026-09-01T23:00:00'),
      }),
    ).toBeNull();
  });

  it('backdates a stop the phone slept through', () => {
    // Locker until the afternoon: the shift still ended when it ended.
    const decision = dueAutoStop({
      stopAt: '23:30',
      startedMs: at('2026-09-01T16:00:00'),
      plannedEndMs: at('2026-09-01T23:00:00'),
      now: at('2026-09-02T13:00:00'),
    });

    expect(decision).not.toBeNull();
    expect(new Date(decision!.endsAt).getHours()).toBe(23);
    expect(new Date(decision!.endsAt).getDate()).toBe(1);
  });

  it('never stops a shift before it began', () => {
    const decision = dueAutoStop({
      stopAt: '09:00',
      startedMs: at('2026-09-01T10:00:00'),
      plannedEndMs: at('2026-09-01T09:30:00'),
      now: at('2026-09-02T12:00:00'),
    });

    expect(decision).not.toBeNull();
    expect(new Date(decision!.endsAt).getTime()).toBeGreaterThan(at('2026-09-01T10:00:00'));
  });

  it('stays silent without an hour', () => {
    expect(
      dueAutoStop({ stopAt: null, startedMs: 0, plannedEndMs: 1, now: 2 }),
    ).toBeNull();
  });
});

describe('the close of a shift that closes itself', () => {
  const closesMs = at('2026-11-02T22:00:00');
  const stop = (over: Partial<Parameters<typeof dueAutoStop>[0]> = {}) =>
    dueAutoStop({
      stopAt: null,
      startedMs: at('2026-11-02T11:00:00'),
      plannedEndMs: closesMs,
      closesMs,
      now: at('2026-11-02T22:01:00'),
      ...over,
    });

  it('stops at the close, marked as the close', () => {
    const decision = stop()!;

    expect(new Date(decision.endsAt).getTime()).toBe(closesMs);
    expect(decision.closing).toBe(true);
  });

  it('waits for it', () => {
    expect(stop({ now: at('2026-11-02T21:59:00') })).toBeNull();
  });

  it('backdates a close the phone slept through', () => {
    expect(new Date(stop({ now: at('2026-11-03T09:00:00') })!.endsAt).getTime()).toBe(closesMs);
  });

  it('applies to a clock started by hand too', () => {
    expect(stop({ startedMs: at('2026-11-02T10:40:00') })).not.toBeNull();
  });

  it('leaves a clock started after its close alone', () => {
    expect(stop({ startedMs: at('2026-11-02T22:30:00'), now: at('2026-11-02T23:00:00') })).toBeNull();
  });

  it('holds sixteen hours as the limit, the same line the web draws', () => {
    expect(FORGOTTEN_AFTER).toBe(16 * 3600_000);
  });

  it('stops one started after its close at the limit, marked as the limit', () => {
    const startedMs = at('2026-11-02T22:30:00');
    const decision = stop({ startedMs, now: startedMs + FORGOTTEN_AFTER });

    expect(new Date(decision!.endsAt).getTime()).toBe(startedMs + FORGOTTEN_AFTER);
    expect(decision!.closing).toBe(true);
    expect(decision!.atLimit).toBe(true);
  });

  it('holds one started on the very minute of its close to the limit as well', () => {
    // Closed there, it would go down as a shift of no length at all.
    expect(stop({ startedMs: closesMs, now: closesMs + FORGOTTEN_AFTER - 1 })).toBeNull();
  });

  it('dates that stop at the limit however late it was noticed', () => {
    const startedMs = at('2026-11-02T22:30:00');
    const decision = stop({ startedMs, now: startedMs + 3 * FORGOTTEN_AFTER });

    expect(new Date(decision!.endsAt).getTime()).toBe(startedMs + FORGOTTEN_AFTER);
  });

  it('does not say anything about the limit on an ordinary close', () => {
    expect(stop()!.atLimit).toBeUndefined();
  });

  it('gives way to an hour somebody chose', () => {
    const decision = stop({ stopAt: '21:30' })!;

    expect(new Date(decision.endsAt).getMinutes()).toBe(30);
    expect(decision.closing).toBe(false);
  });

  it('has nothing to do with the clock off', () => {
    expect(stop({ closesMs: null })).toBeNull();
  });
});

describe('an hour chosen against a plan the clock missed', () => {
  const NEXT = '2026-11-03';
  const startedMs = at('2026-11-02T18:00:00');
  const plannedEndMs = at('2026-11-02T17:00:00');
  const stop = (over: Partial<Parameters<typeof dueAutoStop>[0]> = {}) =>
    dueAutoStop({
      stopAt: '17:30',
      startedMs,
      plannedEndMs,
      closesMs: plannedEndMs,
      now: at(`${NEXT}T09:59:00`),
      ...over,
    });

  it('runs on up to the limit', () => {
    expect(stop()).toBeNull();
  });

  it('stops at the limit, marked as the limit', () => {
    const decision = stop({ now: at(`${NEXT}T10:00:00`) })!;

    expect(new Date(decision.endsAt).getTime()).toBe(startedMs + FORGOTTEN_AFTER);
    expect(decision.closing).toBe(true);
    expect(decision.atLimit).toBe(true);
  });

  it('never waits for the hour, however it falls', () => {
    for (const stopAt of ['17:30', '16:00', '10:45']) {
      const decision = stop({ stopAt, now: at(`${NEXT}T17:45:00`) })!;

      expect(new Date(decision.endsAt).getTime()).toBe(startedMs + FORGOTTEN_AFTER);
    }
  });

  it('holds a shift that does not close by itself to the limit too', () => {
    expect(stop({ closesMs: null })).toBeNull();
    expect(stop({ closesMs: null, now: at(`${NEXT}T10:00:00`) })!.atLimit).toBe(true);
  });

  it('takes an end said on the day since, which is a close again', () => {
    const closesMs = at('2026-11-02T23:00:00');
    const decision = stop({ closesMs, now: at('2026-11-02T23:01:00') })!;

    expect(new Date(decision.endsAt).getTime()).toBe(closesMs);
    expect(decision.atLimit).toBeUndefined();
  });

  it('leaves the next-day stop of a clock started inside its plan as it was', () => {
    const decision = stop({
      stopAt: '09:30',
      startedMs: at('2026-11-02T10:00:00'),
      closesMs: null,
      now: at(`${NEXT}T09:31:00`),
    })!;

    expect(new Date(decision.endsAt).getTime()).toBe(at(`${NEXT}T09:30:00`));
    expect(decision.closing).toBe(false);
  });
});
