import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { api } from './api';

/**
 * Phone notifications, end to end: ask once, hand the address to the server,
 * and open the screen a tap was about. Nothing here nags — a refused
 * permission is simply a phone that will not be notified, which is a choice
 * the person is allowed to make.
 */
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

    await api('/shifter/v1/push/device', {
      method: 'POST',
      body: { token, platform: Platform.OS, language },
    });

    return token;
  } catch {
    // A phone that cannot be registered is not a phone that should crash.
    return null;
  }
}

/**
 * Wires the two things a notification can do: arrive while the app is open,
 * and be tapped from outside it. The payload carries the web path, which
 * maps one-to-one onto the app's own routes.
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

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    open((response.notification.request.content.data as { path?: unknown } | null)?.path);
  });

  return () => subscription.remove();
}
