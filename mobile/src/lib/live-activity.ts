import { ActivityState, endActivity, startActivity, updateActivity } from 'shift-activity';

import { lockStore } from '@/lib/lock';
import { LiveShift, breakSeconds, onBreak, useLive } from '@/store/live';

/**
 * The running shift, as the lock screen needs to hear about it.
 *
 * Kept apart from the store so the store stays what it is — a record of a
 * shift — and so this can be tested without a phone.
 */

/**
 * What the shift has earned so far.
 *
 * Only hourly shifts, and only from hours actually worked. A day rate does not
 * accumulate through the evening and a monthly wage belongs to the month, so
 * both come back as nothing rather than as a number that would be wrong all
 * evening in a place somebody cannot correct it.
 */
export function earnedSoFar(shift: LiveShift, now: number): number | null {
  if (shift.hourlyRate === null || shift.hourlyRate <= 0) return null;

  const elapsed = (now - new Date(shift.startedAt).getTime()) / 1000;
  const paid = Math.max(0, elapsed - breakSeconds(shift, now));

  return Math.round((paid / 3600) * shift.hourlyRate);
}

/** The shift as the activity's state. Pure, so what the lock screen will say is checkable. */
export function activityState(
  shift: LiveShift,
  now: number,
  locked: boolean,
): ActivityState {
  return {
    name: shift.name,
    symbol: shift.symbol,
    currency: '₴',
    startedAt: shift.startedAt,
    endsAt: shift.plannedEnd,
    breakSeconds: breakSeconds(shift, now),
    onBreak: onBreak(shift),
    // A lock screen is the most public surface this app has: it is visible to
    // anybody who picks the phone up, without unlocking it. Somebody who put a
    // lock on the app has already said what they think about that.
    earned: locked ? null : earnedSoFar(shift, now),
  };
}

/**
 * Tells the lock screen where the shift has got to.
 *
 * Every failure is swallowed inside the module. A clock-in is a fact about
 * somebody's working day and must never fail because a decoration could not be
 * drawn.
 */
export async function showShift(shift: LiveShift, now = Date.now()): Promise<void> {
  const locked = await lockStore.enabled();

  await startActivity(activityState(shift, now, locked));
}

export async function refreshShift(shift: LiveShift, now = Date.now()): Promise<void> {
  const locked = await lockStore.enabled();

  await updateActivity(activityState(shift, now, locked));
}

/** The shift is over. The card goes at once rather than lingering. */
export const hideShift = (): Promise<void> => endActivity();

/**
 * Keeps the lock screen in step with the store, for the app's whole life.
 *
 * Subscribed rather than called from the four places a shift changes — start,
 * break on, break off, finish. Those four are easy to add a fifth to and hard
 * to remember, and a lock screen that disagrees with the app about whether
 * somebody is on a break is worse than one that was never there.
 *
 * Also refreshes on a slow tick while the app is open, because the money is a
 * figure the system cannot recompute for itself.
 */
export function watchLiveShift(): () => void {
  let last: string | null = null;

  const reflect = (shift: LiveShift | null) => {
    if (shift === null) {
      if (last !== null) {
        last = null;
        void hideShift();
      }

      return;
    }

    const first = last !== shift.startedAt;

    last = shift.startedAt;

    void (first ? showShift(shift) : refreshShift(shift));
  };

  const stop = useLive.subscribe((state) => reflect(state.live));

  reflect(useLive.getState().live);

  // A minute is fine: at any rate in this trade the figure moves by a few
  // units a minute, and a lock screen redrawn every second would cost more
  // battery than the number is worth.
  const tick = setInterval(() => {
    const shift = useLive.getState().live;

    if (shift !== null) void refreshShift(shift);
  }, 60_000);

  return () => {
    stop();
    clearInterval(tick);
  };
}
