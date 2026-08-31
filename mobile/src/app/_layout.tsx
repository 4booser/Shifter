import '../../global.css';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LockGate } from '@/components/lock-gate';
import { registerForPush, wireNotificationTaps } from '@/lib/notifications';
// Imported for its side effect: the task has to be defined at module load,
// before the system ever calls it, and it is defined nowhere else.
import '@/lib/wage-watch';
import { watchLiveShift } from '@/lib/live-activity';
import { useEye } from '@/lib/eye';
import { useLang } from '@/lib/i18n';
import { useMono } from '@/store/mono';
import { useSession } from '@/store/session';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const session = useSession((state) => state.session);
  const hydrate = useSession((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (session !== undefined) void SplashScreen.hideAsync();
  }, [session]);

  // The push address is offered once there is somebody to notify, and the
  // taps are wired for the app's whole life.
  useEffect(() => {
    if (session === null || session === undefined) return;

    void registerForPush(useLang.getState().lang);

    const stopTaps = wireNotificationTaps();
    // The lock screen follows the store for the app's whole life, so the four
    // places a shift changes never have to remember to say so.
    const stopShift = watchLiveShift();

    return () => {
      stopTaps?.();
      stopShift();
    };
  }, [session]);

  // Keychain still being read: the splash is covering everything anyway.
  const lang = useLang((state) => state.lang);
  const eyeIsShut = useEye((state) => state.shut);

  useEffect(() => {
    if (session === null || session === undefined) return;

    void useMono.getState().hydrate();
  }, [session]);

  if (session === undefined) return null;

  return (
    // Gesture handler needs a root of its own, and the calendar's paint gesture
    // is the first thing in the app to depend on it.
    // Keyed on the language: choosing another one remounts the app, which is
    // what changing language does anyway and saves threading a hook through
    // four hundred call sites.
    <GestureHandlerRootView key={`${lang}:${eyeIsShut ? 'shut' : 'open'}`} style={{ flex: 1 }}>
      <LockGate>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={session !== null}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="day/[date]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="live" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="import" options={{ presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
            <Stack.Screen name="settings-keys" options={{ presentation: 'modal' }} />
            <Stack.Screen name="settings-alerts" options={{ presentation: 'modal' }} />
            <Stack.Screen name="settings-data" options={{ presentation: 'modal' }} />
            <Stack.Screen name="report" options={{ presentation: 'modal' }} />
            <Stack.Screen name="assistant" options={{ presentation: 'modal' }} />
            <Stack.Screen name="year" options={{ presentation: 'modal' }} />
            <Stack.Screen name="templates" options={{ presentation: 'modal' }} />
            <Stack.Screen name="places" options={{ presentation: 'modal' }} />
            <Stack.Screen name="search" options={{ presentation: 'modal' }} />
            <Stack.Screen name="board" options={{ presentation: 'modal' }} />
            <Stack.Screen name="crew" options={{ presentation: 'modal' }} />
            <Stack.Screen name="costs" options={{ presentation: 'modal' }} />
          </Stack.Protected>
          <Stack.Protected guard={session === null}>
            <Stack.Screen name="login" />
          </Stack.Protected>
        </Stack>
      </LockGate>
    </GestureHandlerRootView>
  );
}
