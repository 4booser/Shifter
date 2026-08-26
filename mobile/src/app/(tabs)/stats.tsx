import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { Colors } from '@/constants/theme';

export default function Placeholder() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <Text style={[styles.title, { color: palette.text }]}>Статистика</Text>
      <Text style={{ color: palette.textSecondary, textAlign: 'center' }}>
        Едет в фазе M2 мобильного плана. Пока — на www.shifter.ink.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  title: { fontSize: 22, fontWeight: '800' },
});
