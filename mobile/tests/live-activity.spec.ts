import { describe, expect, it, vi } from 'vitest';

// The module reaches for a native one at import; there is none in a test.
vi.mock('shift-activity', () => ({
  startActivity: vi.fn(),
  updateActivity: vi.fn(),
  endActivity: vi.fn(),
}));

vi.mock('@/lib/lock', () => ({ lockStore: { enabled: async () => false } }));

const { activityState, earnedSoFar } = await import('@/lib/live-activity');

const at = (time: string) => new Date(`2026-08-29T${time}:00Z`).getTime();

const shift = (over: Partial<Parameters<typeof earnedSoFar>[0]> = {}) => ({
  date: '2026-08-29',
  shiftId: 4,
  name: 'Вечер',
  symbol: '🌙',
  startedAt: '2026-08-29T15:00:00.000Z',
  plannedEnd: '2026-08-29T23:00:00.000Z',
  hourlyRate: 300,
  breaks: [],
  ...over,
});

describe('what the shift has earned so far', () => {
  it('counts the hours actually worked', () => {
    expect(earnedSoFar(shift(), at('18:00'))).toBe(900);
  });

  it('does not pay for the break', () => {
    // A clock that ran through lunch would be counting time nobody is paid
    // for, on the most public screen this app has.
    const withBreak = shift({
      breaks: [{ from: '2026-08-29T16:00:00.000Z', to: '2026-08-29T16:30:00.000Z' }],
    });

    expect(earnedSoFar(withBreak, at('18:00'))).toBe(750);
  });

  it('stops rising while a break is open', () => {
    const open = shift({ breaks: [{ from: '2026-08-29T16:00:00.000Z', to: null }] });

    expect(earnedSoFar(open, at('17:00'))).toBe(300);
    expect(earnedSoFar(open, at('18:00'))).toBe(300);
  });

  it('says nothing about a shift that is not paid by the hour', () => {
    // A day rate does not accumulate through the evening and a monthly wage
    // belongs to the month. Both would be wrong all evening in a place
    // somebody cannot correct them.
    expect(earnedSoFar(shift({ hourlyRate: null }), at('18:00'))).toBeNull();
    expect(earnedSoFar(shift({ hourlyRate: 0 }), at('18:00'))).toBeNull();
  });

  it('is nothing rather than negative before the clock starts', () => {
    expect(earnedSoFar(shift(), at('14:00'))).toBe(0);
  });
});

describe('what the lock screen is told', () => {
  it('carries the shift and the break so the system can count for itself', () => {
    const withBreak = shift({
      breaks: [{ from: '2026-08-29T16:00:00.000Z', to: '2026-08-29T16:30:00.000Z' }],
    });

    const state = activityState(withBreak, at('18:00'), false);

    expect(state.name).toBe('Вечер');
    expect(state.startedAt).toBe('2026-08-29T15:00:00.000Z');
    expect(state.breakSeconds).toBe(1_800);
    expect(state.onBreak).toBe(false);
    expect(state.earned).toBe(750);
  });

  it('knows a break is running', () => {
    const open = shift({ breaks: [{ from: '2026-08-29T16:00:00.000Z', to: null }] });

    expect(activityState(open, at('18:00'), false).onBreak).toBe(true);
  });

  it('sends no money at all while the app is locked', () => {
    // A lock screen is visible to anybody who picks the phone up without
    // unlocking it. Somebody who locked the app has already said what they
    // think about that.
    const state = activityState(shift(), at('18:00'), true);

    expect(state.earned).toBeNull();
    expect(state.name).toBe('Вечер');
  });
});
