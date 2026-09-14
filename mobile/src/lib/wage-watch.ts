import { eyeShut } from '@/lib/eye';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

import { statement } from '@/lib/mono-api';
import { wakingWords, worthWaking } from '@/lib/mono-watch';
import { MONO_TOKEN_KEY, loadSetup, saveWatching } from '@/store/mono';

/** The phone noticing, by itself, that the wage arrived. */

export const WAGE_TASK = 'shifter.wage-watch';

/** A week: long enough to catch a wage paid early, short enough to be one call. */
const LOOK_BACK_DAYS = 7;

TaskManager.defineTask(WAGE_TASK, async () => {
  try {
    const setup = await loadSetup();
    const watching = setup.watching;

    if (setup.accountId === null || watching?.expected == null) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const token = await SecureStore.getItemAsync(MONO_TOKEN_KEY);

    if (token === null) return BackgroundTask.BackgroundTaskResult.Success;

    const now = Math.floor(Date.now() / 1000);
    const items = await statement(
      token,
      setup.accountId,
      now - LOOK_BACK_DAYS * 24 * 60 * 60,
      now,
    );

    const waking = worthWaking(items, {
      expected: watching.expected,
      payers: watching.payers,
      told: watching.told,
    });

    if (waking === null) return BackgroundTask.BackgroundTaskResult.Success;

    // Written down before the notification, not after.
    await saveWatching({ ...watching, told: [...watching.told, waking.period] });

    const words = wakingWords(
      waking,
      watching.expected.locationName,
      // The lock screen is the one place the eye matters most: with it shut
      // the push still says the wage arrived, just not how big it is.
      (value) => (eyeShut() ? '₴•••' : `${Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ')} ₴`),
    );

    await Notifications.scheduleNotificationAsync({
      content: { title: words.title, body: words.body, data: { url: '/bank' } },
      // Now, not on a schedule: the wake-up is already the delay.
      trigger: null,
    });

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // The bank refusing, the network being absent, the token having been revoked — none of it is worth a failed…
    return BackgroundTask.BackgroundTaskResult.Success;
  }
});

/** Asks the system to wake us occasionally. */
export async function watchForWage(on: boolean): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(WAGE_TASK);

    if (on && !registered) {
      await BackgroundTask.registerTaskAsync(WAGE_TASK, { minimumInterval: 15 });
    }

    if (!on && registered) await BackgroundTask.unregisterTaskAsync(WAGE_TASK);
  } catch {
    // Background execution is unavailable in Expo Go and can be switched off by the person at the system level.
  }
}
