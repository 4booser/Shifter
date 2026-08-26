import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { addMonths, currentMonth, monthBounds, monthCells, monthLabel, todayKey } from '@/lib/calendar';
import { CalendarDayData, DaysResponse, money } from '@/lib/types';
import { LiveShift, useLive } from '@/store/live';
import { useSession } from '@/store/session';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/**
 * The month, the way the web draws it: worked days wear their money,
 * planned ones an outline, today a ring. A tap opens the day editor.
 */
export default function CalendarScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const signOut = useSession((state) => state.signOut);
  const live = useLive((state) => state.live);
  const startLive = useLive((state) => state.start);
  const hydrateLive = useLive((state) => state.hydrate);

  useFocusEffect(
    useCallback(() => {
      void hydrateLive();
    }, [hydrateLive]),
  );

  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<DaysResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const bounds = monthBounds(month);

  const load = useCallback(async () => {
    try {
      setSummary(await api<DaysResponse>(`/shifter/v1/days?from=${bounds.from}&to=${bounds.to}`));
      setError(null);
    } catch {
      setError('Не дотянулись до сервера.');
    }
  }, [bounds.from, bounds.to]);

  // Focus, not mount: returning from the day editor must show the edit.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const byDate = useMemo(
    () => new Map((summary?.days ?? []).map((day) => [day.date, day])),
    [summary],
  );
  const cells = monthCells(month);
  const today = todayKey();
  const startable = useMemo(() => {
    const plan = byDate.get(today)?.shifts.find((entry) => !entry.worked);

    if (plan === undefined) return null;

    return { ...plan, rate: null as number | null };
  }, [byDate, today]);
  const styles = makeStyles(palette);

  const cellLook = (day: CalendarDayData | undefined) => {
    if (day === undefined || day.shifts.length === 0) return styles.cellEmpty;

    const anyWorked = day.shifts.some((entry) => entry.worked);

    return anyWorked ? styles.cellWorked : styles.cellPlanned;
  };

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
        <Text style={styles.title}>{monthLabel(month)}</Text>
        <Pressable onPress={signOut} hitSlop={8}>
          <Ionicons name="log-out-outline" size={20} color={palette.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.monthNav}>
        <Pressable style={styles.navButton} hitSlop={6} onPress={() => setMonth((m) => addMonths(m, -1))}>
          <Ionicons name="chevron-back" size={18} color={palette.text} />
        </Pressable>
        <Pressable style={styles.navButton} onPress={() => setMonth(currentMonth())}>
          <Text style={styles.navToday}>Сегодня</Text>
        </Pressable>
        <Pressable style={styles.navButton} hitSlop={6} onPress={() => setMonth((m) => addMonths(m, 1))}>
          <Ionicons name="chevron-forward" size={18} color={palette.text} />
        </Pressable>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryText}>
            {money(summary?.total_earned ?? 0)} · {summary?.days_worked ?? 0} см · {Math.round(summary?.hours ?? 0)} ч
          </Text>
        </View>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <View style={styles.weekHead}>
        {WEEKDAYS.map((name) => (
          <Text key={name} style={styles.weekDay}>
            {name}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((key, index) =>
          key === null ? (
            <View key={`pad-${index}`} style={styles.cellPad} />
          ) : (
            <Pressable
              key={key}
              style={[styles.cell, cellLook(byDate.get(key)), key === today && styles.cellToday]}
              onPress={() => router.push(`/day/${key}`)}
            >
              <Text
                style={[
                  styles.cellDay,
                  (byDate.get(key)?.shifts.length ?? 0) > 0 && styles.cellDayBusy,
                ]}
              >
                {Number(key.slice(8))}
              </Text>
              {(byDate.get(key)?.shifts.length ?? 0) > 0 && (
                <Text style={styles.cellSymbol} numberOfLines={1}>
                  {byDate
                    .get(key)!
                    .shifts.map((entry) => entry.symbol ?? '•')
                    .slice(0, 3)
                    .join('')}
                </Text>
              )}
              {(byDate.get(key)?.earned ?? 0) > 0 && (
                <Text style={styles.cellMoney} numberOfLines={1}>
                  {money(byDate.get(key)!.earned)}
                </Text>
              )}
            </Pressable>
          ),
        )}
      </View>

      {live !== null && (
        <Pressable style={styles.liveCard} onPress={() => router.push('/live')}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            Смена идёт: {live.symbol ?? '🕐'} {live.name} с {new Date(live.startedAt).toTimeString().slice(0, 5)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={palette.accent} />
        </Pressable>
      )}

      {live === null && startable !== null && (
        <Pressable
          style={styles.startButton}
          onPress={() => {
            const shift: LiveShift = {
              date: today,
              shiftId: startable.shift_id,
              name: startable.name,
              symbol: startable.symbol,
              startedAt: new Date().toISOString(),
              hourlyRate: startable.rate,
              plannedEnd: startable.end_time,
            };

            startLive(shift);
            router.push('/live');
          }}
        >
          <Ionicons name="play" size={16} color="#fff" />
          <Text style={styles.startText}>
            Начать смену · {startable.symbol ?? ''} {startable.name}
          </Text>
        </Pressable>
      )}

      <Text style={styles.hint}>Тапните день, чтобы отметить смену, чай и штрафы.</Text>
    </ScrollView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 14, paddingTop: 58, gap: 10 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 24, fontWeight: '800', color: palette.text, letterSpacing: -0.5 },
    monthNav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    navButton: {
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    navToday: { color: palette.text, fontWeight: '600', fontSize: 13 },
    summaryPill: { marginLeft: 'auto' },
    summaryText: { color: palette.textSecondary, fontSize: 12.5, fontVariant: ['tabular-nums'] },
    error: { color: palette.danger },
    weekHead: { flexDirection: 'row' },
    weekDay: {
      flex: 1,
      textAlign: 'center',
      color: palette.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
    cellPad: { width: '14.28%' },
    cell: {
      width: '14.28%',
      minHeight: 64,
      borderRadius: 14,
      padding: 4,
      alignItems: 'center',
      gap: 1,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    cellEmpty: { backgroundColor: 'transparent' },
    cellPlanned: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accent,
      borderStyle: 'dashed',
    },
    cellWorked: { backgroundColor: palette.accentSoft, borderColor: palette.accentSoft },
    cellToday: { borderColor: palette.accent, borderWidth: 2, borderStyle: 'solid' },
    cellDay: { color: palette.textSecondary, fontSize: 12, fontWeight: '600' },
    cellDayBusy: { color: palette.text },
    cellSymbol: { fontSize: 13 },
    cellMoney: { color: palette.text, fontSize: 9.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
    hint: { color: palette.textSecondary, fontSize: 12.5, textAlign: 'center', marginTop: 4 },
    liveCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.accentSoft,
      borderWidth: 1,
      borderColor: palette.accent,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent },
    liveText: { color: palette.text, fontWeight: '600', flex: 1, fontSize: 13.5 },
    startButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: palette.accent,
      borderRadius: 14,
      paddingVertical: 13,
    },
    startText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  });
