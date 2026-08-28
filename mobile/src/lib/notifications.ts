import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { api } from './api';
import { todayKey } from './calendar';
import { t } from './i18n';
import { CalendarDayData, DaysResponse, ShiftTemplate } from './types';
import { useLive } from '../store/live';

/**
 * Phone notifications, end to end: ask once, hand the address to the server,
 * and open the screen a tap was about. Nothing here nags — a refused
 * permission is simply a phone that will not be notified, which is a choice
 * the person is allowed to make.
 */
/**
 * The token this phone registered with, for the screen that lets somebody
 * change what it is notified about. Null on a simulator, which has no push
 * service to register with — so the screen hides rather than offering
 * switches that would do nothing.
 */
let registered: string | null = null;

export const deviceToken = (): string | null => registered;

/** What a phone is set to be notified about. */
export interface DeviceSettings {
  time_zone: string;
  notify_at: string;
  notify_tomorrow: boolean;
  notify_payday: boolean;
}

/**
 * Changes what this phone is notified about, and reads back what it is now.
 *
 * Everything is optional and null means "leave it alone", so a screen sends
 * only the switch that was touched — and the same call with nothing in it is
 * how that screen learns the current state without a second endpoint.
 */
export async function deviceSettings(
  token: string,
  change: Partial<Omit<DeviceSettings, 'time_zone'>> = {},
): Promise<DeviceSettings | null> {
  try {
    return await api<DeviceSettings>('/shifter/v1/push/device', {
      method: 'POST',
      body: { token, ...change },
    });
  } catch {
    return null;
  }
}

export async function registerForPush(language: string): Promise<string | null> {
  // A simulator has no push service to register with; on iOS it cannot even
  // ask, so trying only produces a confusing error in the log.
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted;

  if (!granted) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Shifter',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;

    registered = token;

    await api('/shifter/v1/push/device', {
      method: 'POST',
      body: {
        token,
        platform: Platform.OS,
        language,
        // Where the phone is, so the evening nudge arrives in the evening.
        // Sent every time it registers, because people move and phones
        // follow them.
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });

    return token;
  } catch {
    // A phone that cannot be registered is not a phone that should crash.
    return null;
  }
}

/**
 * The buttons a notification carries.
 *
 * A shift notification arrives an evening before and a payday one on the
 * morning. Both are moments when somebody is holding the phone and not
 * unlocking it, so the useful thing is a button on the lock screen rather
 * than a trip into the app to press the same button one screen deeper.
 *
 * Registered once, at startup. The server names the category on the push; a
 * notification whose category was never registered simply arrives without
 * buttons, which is the old behaviour and no worse than it was.
 */
async function registerActions(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync('shift', [
      {
        identifier: 'start',
        buttonTitle: t('Начать смену'),
        // Foreground on purpose: starting a shift writes a running clock the
        // person then wants to see, and a button that silently does something
        // to their money is not a button anybody trusts.
        options: { opensAppToForeground: true },
      },
    ]);

    await Notifications.setNotificationCategoryAsync('payday', [
      { identifier: 'record', buttonTitle: t('Записать выплату'), options: { opensAppToForeground: true } },
    ]);
  } catch {
    // Categories are a nicety; a phone that refuses them still gets the
    // notification and the tap.
  }
}

/**
 * Starts today's planned shift, the way the calendar's own button does.
 *
 * Asked for from the lock screen, so it has to fetch: the app may not have
 * been open since the rota changed, and starting yesterday's shift because
 * that is what was in memory would be worse than doing nothing.
 */
async function startTodaysShift(): Promise<boolean> {
  const today = todayKey();

  try {
    const [days, templates] = await Promise.all([
      api<DaysResponse>(`/shifter/v1/days?from=${today}&to=${today}`),
      api<ShiftTemplate[]>('/shifter/v1/shifts').catch(() => [] as ShiftTemplate[]),
    ]);

    const day: CalendarDayData | undefined = days.days[0];
    const plan = day?.shifts.find((entry) => !entry.worked);

    if (plan === undefined) return false;

    const template = templates.find((entry) => entry.id === plan.shift_id);

    useLive.getState().start({
      date: today,
      shiftId: plan.shift_id,
      name: plan.name,
      symbol: plan.symbol,
      startedAt: new Date().toISOString(),
      // Only an hourly rate ticks by the second; anything else would be a
      // number nobody agreed to.
      hourlyRate:
        template !== undefined && template.salary_period === 'hour'
          ? template.salary_amount
          : null,
      plannedStart: plan.start_time,
      plannedEnd: plan.end_time,
      breaks: [],
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Wires the three things a notification can do: arrive while the app is open,
 * be tapped from outside it, and have one of its buttons pressed. The payload
 * carries the web path, which maps one-to-one onto the app's own routes.
 */
export function wireNotificationTaps(): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  const open = (path: unknown) => {
    if (typeof path !== 'string') return;

    // The server speaks in web paths; the tabs answer to the same names.
    const route = path.startsWith('/dashboard') ? '/' : path;

    try {
      router.push(route as never);
    } catch {
      // An unknown path simply opens the app, which is what a tap already did.
    }
  };

  void registerActions();

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { path?: unknown } | null;

    if (response.actionIdentifier === 'start') {
      void startTodaysShift().then((started) => open(started ? '/live' : '/'));

      return;
    }

    if (response.actionIdentifier === 'record') {
      open('/(tabs)/payouts');

      return;
    }

    open(data?.path);
  });

  return () => subscription.remove();
}
