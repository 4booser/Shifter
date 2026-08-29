import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

import { statement } from '@/lib/mono-api';
import { wakingWords, worthWaking } from '@/lib/mono-watch';
import { MONO_TOKEN_KEY, loadSetup, saveWatching } from '@/store/mono';

/**
 * The phone noticing, by itself, that the wage arrived.
 *
 * A webhook would want a public URL and the bank token living somewhere other
 * than this phone, and that was ruled out deliberately. So the phone wakes up
 * now and then and looks.
 *
 * When it wakes is the operating system's decision, not ours. It may be twenty
 * minutes and it may be tomorrow; on a phone in low-power mode it may be after
 * the person has already opened the app and seen for themselves. Every word
 * this feature says is "вскоре", because promising the moment the money lands
 * would be promising something nobody here controls.
 *
 * It does one request and nothing else. A few seconds granted by the system is
 * the wrong place to be authenticating against two services, so everything the
 * task needs — the account, the wage expected, who has already been told — was
 * written down by the app while it was open.
 */

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

    // Written down before the notification, not after. A task killed between
    // the two would otherwise announce the same wage again on the next wake,
    // and a second message about the same money reads as a second payment.
    await saveWatching({ ...watching, told: [...watching.told, waking.period] });

    const words = wakingWords(
      waking,
      watching.expected.locationName,
      (value) => `${Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ')} ₴`,
    );

    await Notifications.scheduleNotificationAsync({
      content: { title: words.title, body: words.body, data: { url: '/bank' } },
      // Now, not on a schedule: the wake-up is already the delay.
      trigger: null,
    });

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // The bank refusing, the network being absent, the token having been
    // revoked — none of it is worth a failed task. The app will look again
    // the next time it is opened, which is the path that always works.
    return BackgroundTask.BackgroundTaskResult.Success;
  }
});

/**
 * Asks the system to wake us occasionally. Fifteen minutes is a request and
 * not a promise — iOS in particular treats it as a hint and decides for itself.
 */
export async function watchForWage(on: boolean): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(WAGE_TASK);

    if (on && !registered) {
      await BackgroundTask.registerTaskAsync(WAGE_TASK, { minimumInterval: 15 });
    }

    if (!on && registered) await BackgroundTask.unregisterTaskAsync(WAGE_TASK);
  } catch {
    // Background execution is unavailable in Expo Go and can be switched off
    // by the person at the system level. Neither is an error worth showing:
    // the feature simply does not happen and everything else works.
  }
}
