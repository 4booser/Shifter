import { Ionicons } from '@expo/vector-icons';
import { Tabs, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { TabBar } from '@/components/tab-bar';
import { API_BASE } from '@/lib/api';
import { Colors } from '@/constants/theme';
import { t } from '@/lib/i18n';

/**
 * Route to icon, in one place. The bar draws the outline for a tab you are
 * not on and the filled one for the tab you are.
 */
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'calendar',
  schedule: 'people',
  gigs: 'sparkles',
  payouts: 'wallet',
  bank: 'card',
  stats: 'stats-chart',
};

/** The tab route as the counter names it. Anything else is not counted. */
const SEEN: Record<string, string> = {
  index: 'calendar',
  schedule: 'schedule',
  gigs: 'gigs',
  payouts: 'payouts',
  bank: 'bank',
  stats: 'stats',
};

export default function TabsLayout() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const segment = useSegments();

  /**
   * One integer, so decisions about what to build next stop being guesses.
   *
   * The tab's own name and nothing else — no identifier of any kind reaches
   * this, by design and by test. Failing is silent: a counter that can
   * interrupt somebody's shift has its priorities backwards.
   */
  useEffect(() => {
    const screen = SEEN[segment[segment.length - 1] ?? ''] ?? null;

    if (screen === null) return;

    void fetch(`${API_BASE}/shifter/v1/status/seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screen }),
    }).catch(() => undefined);
  }, [segment]);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} palette={palette} icons={ICONS} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('Календарь'),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('График'),
        }}
      />
      <Tabs.Screen
        name="gigs"
        options={{
          title: t('Подработки'),
        }}
      />
      <Tabs.Screen
        name="payouts"
        options={{
          title: t('Выплаты'),
        }}
      />
      <Tabs.Screen
        name="bank"
        options={{
          title: t('Банк'),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('Статистика'),
        }}
      />
    </Tabs>
  );
}
