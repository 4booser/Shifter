import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { pad } from '@/lib/calendar';
import { CalendarDayData, DaysResponse, money, toSavePayload } from '@/lib/types';
import { useLive } from '@/store/live';

const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/**
 * The shift, live: elapsed time and money growing while the person works.
 * Finishing writes the actual clock onto the day through the same PUT the
 * web uses, so the calendar and the audit trail see one truth.
 */
export default function LiveScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const live = useLive((state) => state.live);
  const clear = useLive((state) => state.clear);

  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);

  const styles = makeStyles(palette);

  if (live === null) {
    return (
      <View style={styles.screen}>
        <Text style={styles.hint}>Смена не запущена.</Text>
        <Pressable style={styles.quiet} onPress={() => router.back()}>
          <Text style={styles.quietText}>Назад</Text>
        </Pressable>
      </View>
    );
  }

  const started = new Date(live.startedAt);
  const seconds = Math.max(0, Math.floor((now - started.getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const ticker = `${pad(hours)}:${pad(minutes)}:${pad(seconds % 60)}`;
  const earnedNow = live.hourlyRate !== null ? (seconds / 3600) * live.hourlyRate : null;

  const finish = async () => {
    setBusy(true);
    setError(null);

    try {
      const summary = await api<DaysResponse>(`/shifter/v1/days?from=${live.date}&to=${live.date}`);
      const day: CalendarDayData = summary.days[0];
      const payload = toSavePayload(day);
      const entry = payload.shifts.find((row) => row.shift_id === live.shiftId);
      const stamp = { actual_start: clock(started), actual_end: clock(new Date()), worked: true };

      if (entry === undefined) payload.shifts.push({
          shift_id: live.shiftId,
          needs_cover: false,
          break_minutes: null,
          revenue: null,
          ...stamp,
        });
      else Object.assign(entry, stamp);

      await api(`/shifter/v1/days/${live.date}`, { method: 'PUT', body: payload });
      clear();
      router.back();
    } catch {
      setError('Не записалось — попробуйте ещё раз.');
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>
        {live.symbol ?? '🕐'} {live.name}
      </Text>
      <Text style={styles.since}>
        с {clock(started)} · план до {live.plannedEnd.slice(0, 5)}
      </Text>

      <Text style={styles.ticker}>{ticker}</Text>
      {earnedNow !== null && <Text style={styles.earned}>{money(earnedNow)} уже ваши</Text>}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={({ pressed }) => [styles.finish, pressed && { opacity: 0.85 }]}
        disabled={busy}
        onPress={() => void finish()}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.finishText}>Закончил смену</Text>
          </>
        )}
      </Pressable>

      <Pressable style={styles.quiet} onPress={() => router.back()}>
        <Text style={styles.quietText}>Свернуть — смена продолжает идти</Text>
      </Pressable>

      <Pressable
        style={styles.quiet}
        onPress={() => {
          clear();
          router.back();
        }}
      >
        <Text style={[styles.quietText, { color: palette.danger }]}>Отменить без записи</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 10,
    },
    title: { fontSize: 22, fontWeight: '800', color: palette.text },
    hint: { color: palette.textSecondary, fontSize: 15 },
    since: { color: palette.textSecondary, fontVariant: ['tabular-nums'] },
    ticker: {
      fontSize: 64,
      fontWeight: '800',
      color: palette.text,
      fontVariant: ['tabular-nums'],
      letterSpacing: -2,
      marginVertical: 8,
    },
    earned: { fontSize: 20, fontWeight: '700', color: palette.good, fontVariant: ['tabular-nums'] },
    error: { color: palette.danger },
    finish: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.accent,
      borderRadius: 16,
      paddingHorizontal: 26,
      paddingVertical: 15,
      marginTop: 14,
    },
    finishText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    quiet: { paddingVertical: 8 },
    quietText: { color: palette.textSecondary, fontWeight: '600' },
  });
