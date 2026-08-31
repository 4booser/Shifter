import { describe, expect, it } from 'vitest';

import { dueAutoStop } from '@/lib/autostart';

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
