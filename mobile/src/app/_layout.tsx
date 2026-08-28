import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LockGate } from '@/components/lock-gate';
import { registerForPush, wireNotificationTaps } from '@/lib/notifications';
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

    void registerForPush('ru');

    return wireNotificationTaps();
  }, [session]);

  // Keychain still being read: the splash is covering everything anyway.
  useEffect(() => {
    if (session === null || session === undefined) return;

    void useMono.getState().hydrate();
  }, [session]);

  if (session === undefined) return null;

  return (
    // Gesture handler needs a root of its own, and the calendar's paint gesture
    // is the first thing in the app to depend on it.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LockGate>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={session !== null}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="day/[date]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="live" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="import" options={{ presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
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
