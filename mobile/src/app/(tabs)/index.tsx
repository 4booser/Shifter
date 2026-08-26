import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';

interface DaysResponse {
  days: { date: string; earned: number; hours: number; shifts: { name: string; start_time: string; end_time: string; worked: boolean }[] }[];
  total_earned: number;
  hours: number;
  days_worked: number;
}

const pad = (value: number) => `${value}`.padStart(2, '0');

/**
 * M0's proof of life: the month straight off the same API the site uses.
 * The full gesture calendar arrives with phase M1 — this screen already
 * answers the question people open the app with: how is the month going.
 */
export default function CalendarScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const signOut = useSession((state) => state.signOut);

  const [summary, setSummary] = useState<DaysResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;

  const load = useCallback(async () => {
    try {
      setSummary(await api<DaysResponse>(`/shifter/v1/days?from=${from}&to=${to}`));
      setError(null);
    } catch {
      setError('Не дотянулись до сервера.');
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const styles = makeStyles(palette);
  const monthName = now.toLocaleDateString('ru', { month: 'long', year: 'numeric' });
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const upcoming = (summary?.days ?? [])
    .filter((day) => day.date >= today && day.shifts.length > 0)
    .slice(0, 6);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>{monthName[0].toUpperCase() + monthName.slice(1)}</Text>
        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Выйти</Text>
        </Pressable>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <View style={styles.cards}>
        <View style={[styles.card, styles.hero]}>
          <Text style={styles.cardLabel}>Заработано</Text>
          <Text style={styles.heroValue}>
            ₴{Math.round(summary?.total_earned ?? 0).toLocaleString('ru')}
          </Text>
        </View>
        <View style={styles.row}>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.cardLabel}>Смен</Text>
            <Text style={styles.cardValue}>{summary?.days_worked ?? '—'}</Text>
          </View>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.cardLabel}>Часов</Text>
            <Text style={styles.cardValue}>{Math.round(summary?.hours ?? 0)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.section}>Ближайшие смены</Text>
      {upcoming.length === 0 && <Text style={styles.empty}>Впереди пока пусто. Календарь — в вебе, полная сетка здесь — в фазе M1.</Text>}
      {upcoming.map((day) => (
        <View key={day.date} style={styles.card}>
          <Text style={styles.dayDate}>
            {new Date(`${day.date}T00:00:00`).toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          {day.shifts.map((shift, index) => (
            <Text key={index} style={styles.shiftLine}>
              {shift.name} · {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
              {shift.worked ? ' ✅' : ''}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 16, paddingTop: 60, gap: 10 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    title: { fontSize: 26, fontWeight: '800', color: palette.text, letterSpacing: -0.5 },
    signOut: { color: palette.textSecondary, fontWeight: '600' },
    error: { color: palette.danger },
    cards: { gap: 8 },
    card: {
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      padding: 14,
      gap: 4,
    },
    hero: { alignItems: 'flex-start' },
    row: { flexDirection: 'row', gap: 8 },
    half: { flex: 1 },
    cardLabel: { color: palette.textSecondary, fontSize: 13, fontWeight: '600' },
    heroValue: { color: palette.text, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
    cardValue: { color: palette.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
    section: { color: palette.text, fontSize: 17, fontWeight: '800', marginTop: 10 },
    empty: { color: palette.textSecondary },
    dayDate: { color: palette.text, fontWeight: '700', textTransform: 'capitalize' },
    shiftLine: { color: palette.textSecondary, fontVariant: ['tabular-nums'] },
  });
