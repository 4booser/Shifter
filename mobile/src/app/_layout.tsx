import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { registerForPush, wireNotificationTaps } from '@/lib/notifications';
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
  if (session === undefined) return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={session !== null}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="day/[date]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="live" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="import" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
