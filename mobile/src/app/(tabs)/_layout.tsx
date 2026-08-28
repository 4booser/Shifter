import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

import { TabBar } from '@/components/tab-bar';
import { Colors } from '@/constants/theme';

/**
 * Route to icon, in one place. The bar draws the outline for a tab you are
 * not on and the filled one for the tab you are.
 */
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'calendar',
  schedule: 'people',
  gigs: 'sparkles',
  payouts: 'wallet',
  stats: 'stats-chart',
};

export default function TabsLayout() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} palette={palette} icons={ICONS} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Календарь',
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'График',
        }}
      />
      <Tabs.Screen
        name="gigs"
        options={{
          title: 'Подработки',
        }}
      />
      <Tabs.Screen
        name="payouts"
        options={{
          title: 'Выплаты',
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Статистика',
        }}
      />
    </Tabs>
  );
}
