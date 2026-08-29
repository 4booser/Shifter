import { requireOptionalNativeModule } from 'expo';

/**
 * The running shift on the lock screen.
 *
 * A Live Activity is the one place this app appears without being opened, and
 * a shift is the one thing that is genuinely happening while it isn't. The
 * pair is the reason a hospitality app stays installed.
 *
 * Optional at every level. `requireOptionalNativeModule` returns null in Expo
 * Go, on Android, and on any build made before this shipped — and every
 * function below does nothing rather than throwing. A clock-in must never fail
 * because a lock screen decoration could not be drawn.
 */

interface Native {
  start(state: ActivityState): Promise<string | null>;
  update(state: ActivityState): Promise<void>;
  end(): Promise<void>;
  isRunning(): boolean;
  /** False on a phone where the person has switched Live Activities off. */
  isAvailable(): boolean;
}

export interface ActivityState {
  /** The shift's name, as the person calls it. */
  name: string;
  symbol: string | null;
  /** ISO instant the clock started. The lock screen counts from it by itself. */
  startedAt: string;
  /** ISO instant it is meant to end, for the bar that fills. */
  endsAt: string;
  /** Seconds of break so far, which the elapsed clock does not include. */
  breakSeconds: number;
  onBreak: boolean;
  /**
   * Earned so far, at the last update. Null where the shift is not paid by the
   * hour, or where the app is locked.
   *
   * Deliberately not ticking. A lock screen can count time by itself and
   * cannot count money, so a figure that appeared to rise second by second
   * would be a number the phone was making up between updates.
   */
  earned: number | null;
}

const native = requireOptionalNativeModule<Native>('ShiftActivityModule');

export const activitiesAvailable = (): boolean => {
  try {
    return native?.isAvailable() ?? false;
  } catch {
    return false;
  }
};

export const activityRunning = (): boolean => {
  try {
    return native?.isRunning() ?? false;
  } catch {
    return false;
  }
};

export async function startActivity(state: ActivityState): Promise<void> {
  try {
    await native?.start(state);
  } catch {
    // A shift that started is a fact; a lock screen that failed to say so is
    // not worth telling anybody about.
  }
}

export async function updateActivity(state: ActivityState): Promise<void> {
  try {
    await native?.update(state);
  } catch {
    // As above.
  }
}

export async function endActivity(): Promise<void> {
  try {
    await native?.end();
  } catch {
    // As above.
  }
}
