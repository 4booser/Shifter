import { eyeShut } from '@/lib/eye';
import { ActivityState, endActivity, startActivity, updateActivity } from 'shift-activity';

import { lockStore } from '@/lib/lock';
import { LiveShift, breakSeconds, onBreak, useLive } from '@/store/live';

/** The running shift, as the lock screen needs to hear about it. */

/** What the shift has earned so far. */
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
    // A lock screen is the most public surface this app has: it is visible to anybody who picks the phone up…
    earned: locked || eyeShut() ? null : earnedSoFar(shift, now),
  };
}

/** Tells the lock screen where the shift has got to. */
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

/** Keeps the lock screen in step with the store, for the app's whole life. */
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

  // A minute is fine: at any rate in this trade the figure moves by a few units a minute, and a lock screen…
  const tick = setInterval(() => {
    const shift = useLive.getState().live;

    if (shift !== null) void refreshShift(shift);
  }, 60_000);

  return () => {
    stop();
    clearInterval(tick);
  };
}
