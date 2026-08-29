import { describe, expect, it } from 'vitest';

import { buildSnapshot, nextShift } from '@/lib/widget';

const at = new Date('2026-08-29T19:30:00Z');

const input = (hidden: boolean, bankHidden = false) => ({
  now: at,
  hidden,
  currency: '₴',
  bankHidden,
  today: {
    shift: 'Вечер',
    start: '18:00',
    end: '02:00',
    worked: false,
    earned: 1_200,
    next: null,
  },
  month: { label: 'август', earned: 42_000, goal: 50_000, days: 17 },
  money: { balance: 8_400, untilPayday: 6, perDay: 1_400 },
});

describe('what the widget is told', () => {
  it('carries the moment it was written', () => {
    // A widget is a photograph of a moment that has passed, and a figure from
    // three days ago presented as today's is the one lie it is uniquely good
    // at telling.
    expect(buildSnapshot(input(false)).at).toBe('2026-08-29T19:30:00.000Z');
  });

  it('passes the figures through when nothing is hidden', () => {
    const snapshot = buildSnapshot(input(false));

    expect(snapshot.today.earned).toBe(1_200);
    expect(snapshot.month.earned).toBe(42_000);
    expect(snapshot.money!.balance).toBe(8_400);
  });

  it('sends no figure at all when amounts are hidden', () => {
    // A wage on a lock screen is visible to whoever is standing next to them,
    // which is a different audience from the one that unlocked the phone. The
    // widget cannot be trusted to hide what it was given, so it is not given
    // it.
    const snapshot = buildSnapshot(input(true));

    expect(snapshot.today.earned).toBeNull();
    expect(snapshot.month.earned).toBeNull();
    expect(snapshot.month.goal).toBeNull();
    expect(snapshot.money!.balance).toBeNull();
    expect(snapshot.money!.perDay).toBeNull();
  });

  it('keeps the shape when the figures go', () => {
    // Which shift, how many days, how long until payday — none of it is a
    // number anybody minds a stranger seeing, and losing it would leave an
    // empty rectangle where a useful one was.
    const snapshot = buildSnapshot(input(true));

    expect(snapshot.today.shift).toBe('Вечер');
    expect(snapshot.today.start).toBe('18:00');
    expect(snapshot.month.days).toBe(17);
    expect(snapshot.money!.untilPayday).toBe(6);
  });

  it('drops the money card outright when the bank lock is on', () => {
    // Emptied rather than removed, it would be an invitation to wonder what
    // is behind it. The bank lock is its own decision: what the calendar holds
    // is how much somebody earns, what the bank holds is where they were.
    expect(buildSnapshot(input(false, true)).money).toBeNull();
  });

  it('carries the sign, so the widget does not have to guess it', () => {
    // Somebody paid in zlotys looking at an unmarked 1 840 on a home screen
    // has to guess. The app knows and can simply say.
    expect(buildSnapshot(input(false)).currency).toBe('₴');
    expect(buildSnapshot(input(true)).currency).toBe('₴');
  });

  it('says nothing about money where no bank is connected', () => {
    // Null, not a zero balance. One of those is a fact about somebody's
    // finances and the other is a fact about this app.
    const snapshot = buildSnapshot({ ...input(false), money: null });

    expect(snapshot.money).toBeNull();
  });

  it('reports an empty day as an empty day', () => {
    const snapshot = buildSnapshot({
      ...input(false),
      today: { shift: null, start: null, end: null, worked: false, earned: null, next: null },
    });

    expect(snapshot.today.shift).toBeNull();
    expect(snapshot.today.earned).toBeNull();
  });
});

describe('what comes next on a day off', () => {
  const day = (date: string, shifts: { name: string; start_time: string }[]) =>
    ({ date, shifts, earned: 0, hours: 0 }) as never;

  it('finds the next day with something on it', () => {
    // "What am I on next" is exactly what somebody looks at a calendar for on
    // their day off, and it is what the app's own tile already answers.
    const next = nextShift(
      [
        day('2026-08-29', []),
        day('2026-08-31', [{ name: 'Вечер', start_time: '18:00:00' }]),
        day('2026-09-02', [{ name: 'День', start_time: '10:00:00' }]),
      ],
      '2026-08-29',
    );

    expect(next).toEqual({ inDays: 2, name: 'Вечер', start: '18:00' });
  });

  it('says nothing about a rota that does not exist yet', () => {
    expect(nextShift([day('2026-08-29', [])], '2026-08-29')).toBeNull();
  });

  it('does not look further than a fortnight', () => {
    // Beyond that a rota is a guess, and "через 40 дней" is not an answer
    // anybody wanted.
    const far = [day('2026-10-10', [{ name: 'Вечер', start_time: '18:00:00' }])];

    expect(nextShift(far, '2026-08-29')).toBeNull();
  });

  it('ignores today itself', () => {
    const today = [day('2026-08-29', [{ name: 'Вечер', start_time: '18:00:00' }])];

    expect(nextShift(today, '2026-08-29')).toBeNull();
  });
});
