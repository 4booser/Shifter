import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appear, Press, Roll } from '@/components/motion';
import { Ring } from '@/components/ring';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { pad } from '@/lib/calendar';
import { stopwatch } from '@/lib/format';
import { CalendarDayData, DaysResponse, money, toSavePayload } from '@/lib/types';
import { breakSeconds, forgotten, onBreak, useLive } from '@/store/live';
import { t } from '@/lib/i18n';

const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Minutes from midnight, so a shift ending after it still measures forwards. */
const minutesOf = (time: string) => {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);

  return hours * 60 + minutes;
};

/**
 * The shift, live.
 *
 * This is the one screen where the app is doing something rather than
 * recording something, and it used to look like a stopwatch demo: a big
 * monospace number and three links. What somebody wants at the fourth hour is
 * not how long has passed but how much is left and what it has come to, so
 * the ring answers the first and the money answers the second, and both move.
 *
 * Breaks are here because they are the number that decides paid hours, and
 * nobody remembers them at the end of a shift. The phone does.
 */
export default function LiveScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const live = useLive((state) => state.live);
  const clear = useLive((state) => state.clear);
  const toggleBreak = useLive((state) => state.toggleBreak);

  // A shift is hours long and the phone is on a bar. Letting it sleep is fine
  // for the count — the clock is the wall clock — but this screen is also how
  // people watch the money, and a screen that keeps going dark is one nobody
  // leaves open.
  useKeepAwake();

  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoursMarked = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);

  const styles = makeStyles(palette);

  if (live === null) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.hint}>{t('Смена не запущена.')}</Text>
        <Press style={styles.quiet} onPress={() => router.back()}>
          <Text style={styles.quietText}>{t('Назад')}</Text>
        </Press>
      </View>
    );
  }

  const started = new Date(live.startedAt);
  const elapsed = Math.max(0, Math.floor((now - started.getTime()) / 1000));
  const resting = onBreak(live);
  const paused = breakSeconds(live, now);
  const paid = Math.max(0, elapsed - paused);
  const earnedNow = live.hourlyRate !== null ? (paid / 3600) * live.hourlyRate : null;

  // The planned length, wrapping midnight, so a 17:00–01:00 shift is eight
  // hours rather than minus sixteen. Measured from when it was meant to
  // start, not from when it did: turning up twenty minutes late shortens what
  // is left, it does not lengthen the shift.
  const planStart = minutesOf(
    live.plannedStart ?? `${pad(started.getHours())}:${pad(started.getMinutes())}`,
  );
  const planEnd = minutesOf(live.plannedEnd);
  const planMinutes = (planEnd - planStart + 24 * 60) % (24 * 60) || 24 * 60;
  const leftSeconds = planMinutes * 60 - paid;

  // A tap on the hour. It is the only thing this screen says out loud, and it
  // is worth saying: an hour is the unit these people are paid in.
  const wholeHours = Math.floor(paid / 3600);

  if (wholeHours > hoursMarked.current) {
    hoursMarked.current = wholeHours;
    if (wholeHours > 0) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // With the button forgotten, "now" is a lie; the plan's own end is the
  // honest stamp. The person can still disagree and edit the day after.
  const finish = async (endAt?: string) => {
    setBusy(true);
    setError(null);

    try {
      const summary = await api<DaysResponse>(`/shifter/v1/days?from=${live.date}&to=${live.date}`);
      const day: CalendarDayData | undefined = summary.days[0];
      const payload = toSavePayload(day);
      const entry = payload.shifts.find((row) => row.shift_id === live.shiftId);
      const stamp = {
        actual_start: clock(started),
        actual_end: endAt ?? clock(new Date()),
        worked: true,
        // Minutes, because that is what the server prices in — and null
        // rather than zero where nobody took one, so the template's own
        // unpaid minutes are kept rather than overwritten with "none".
        break_minutes: paused > 30 ? Math.round(paused / 60) : null,
      };

      if (entry === undefined) {
        payload.shifts.push({
          shift_id: live.shiftId,
          needs_cover: false,
          revenue: null,
          ...stamp,
        });
      } else {
        Object.assign(entry, stamp);
      }

      await api(`/shifter/v1/days/${live.date}`, { method: 'PUT', body: payload });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clear();
      router.back();
    } catch {
      setError(t('Не записалось — попробуйте ещё раз.'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setBusy(false);
    }
  };

  const ringColour = resting ? palette.textSecondary : leftSeconds <= 0 ? palette.good : palette.accent;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]}>
      <Appear>
        <View style={styles.head}>
          <Text style={styles.title}>
            {live.symbol ?? '🕐'} {live.name}
          </Text>
          <Text style={styles.since}>
            с {clock(started)} · план до {live.plannedEnd.slice(0, 5)}
          </Text>
        </View>
      </Appear>

      {forgotten(live, Date.now()) && (
        <Appear>
          <View style={styles.overdue}>
            <Text style={styles.overdueText}>
              {t('План кончился в')} {live.plannedEnd.slice(0, 5)}. {t('Забыли выключить?')}
            </Text>
            <Press
              style={styles.overdueButton}
              disabled={busy}
              onPress={() => void finish(live.plannedEnd.slice(0, 5))}
            >
              <Text style={styles.overdueButtonText}>{t('Закрыть по плану')}</Text>
            </Press>
            <Text style={styles.overdueHint}>
              {t('Запишутся плановые часы, не таймер. «Закончил» ниже — если правда ещё работаете.')}
            </Text>
          </View>
        </Appear>
      )}

      <Appear index={1}>
        <Ring
          progress={paid / (planMinutes * 60)}
          colour={ringColour}
          track={palette.backgroundSelected}
        >
          <Text style={[styles.ticker, resting && styles.tickerResting]}>{stopwatch(paid)}</Text>

          {earnedNow !== null ? (
            <Roll
              value={earnedNow}
              prefix="₴"
              style={[styles.earned, { color: resting ? palette.textSecondary : palette.good }]}
              duration={900}
            />
          ) : (
            <Text style={styles.noRate}>{t('без почасовой ставки')}</Text>
          )}

          <Text style={styles.left}>
            {resting
              ? t('перерыв идёт')
              : leftSeconds > 0
                ? `${t('осталось')} ${stopwatch(leftSeconds)}`
                : `${t('сверх плана')} ${stopwatch(-leftSeconds)}`}
          </Text>
        </Ring>
      </Appear>

      <Appear index={2}>
        <View style={styles.facts}>
          <View style={styles.fact}>
            <Text style={styles.factValue}>{stopwatch(elapsed).slice(0, 5)}</Text>
            <Text style={styles.factLabel}>{t('на месте')}</Text>
          </View>
          <View style={styles.factRule} />
          <View style={styles.fact}>
            <Text style={[styles.factValue, paused > 0 && { color: palette.textSecondary }]}>
              {Math.round(paused / 60)}
            </Text>
            <Text style={styles.factLabel}>{t('мин перерыва')}</Text>
          </View>
          <View style={styles.factRule} />
          <View style={styles.fact}>
            <Text style={styles.factValue}>{live.hourlyRate === null ? '—' : money(live.hourlyRate)}</Text>
            <Text style={styles.factLabel}>{t('за час')}</Text>
          </View>
        </View>
      </Appear>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Appear index={3} style={styles.actions}>
        <View style={styles.row}>
          <Press
            style={[styles.break, resting && styles.breakOn]}
            onPress={() => {
              toggleBreak();
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
          >
            <Ionicons
              name={resting ? 'play' : 'pause'}
              size={17}
              color={resting ? '#fff' : palette.text}
            />
            <Text style={[styles.breakText, resting && styles.breakTextOn]}>
              {resting ? t('Вернулся') : t('Перерыв')}
            </Text>
          </Press>

          <Press style={styles.finish} disabled={busy} onPress={() => void finish()}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.finishText}>{t('Закончил')}</Text>
              </>
            )}
          </Press>
        </View>

        <Press style={styles.quiet} haptic={false} onPress={() => router.back()}>
          <Text style={styles.quietText}>{t('Свернуть — смена продолжает идти')}</Text>
        </Press>

        <Press
          style={styles.quiet}
          haptic={false}
          onPress={() => {
            clear();
            router.back();
          }}
        >
          <Text style={[styles.quietText, { color: palette.danger }]}>{t('Отменить без записи')}</Text>
        </Press>
      </Appear>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.background,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 22,
    },
    head: { alignItems: 'center', gap: 3 },
    title: { fontSize: 22, fontWeight: '800', color: palette.text, letterSpacing: -0.4 },
    since: { color: palette.textSecondary, fontVariant: ['tabular-nums'], fontSize: 13.5 },
    hint: { color: palette.textSecondary, fontSize: 15 },

    ticker: {
      fontSize: 46,
      fontWeight: '800',
      color: palette.text,
      fontVariant: ['tabular-nums'],
      letterSpacing: -1.6,
    },
    tickerResting: { color: palette.textSecondary },
    earned: {
      fontSize: 27,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      letterSpacing: -0.6,
      marginTop: 2,
    },
    noRate: { color: palette.textSecondary, fontSize: 13, marginTop: 4 },
    left: { color: palette.textSecondary, fontSize: 13, marginTop: 6, fontVariant: ['tabular-nums'] },

    facts: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 6,
    },
    fact: { alignItems: 'center', gap: 1, minWidth: 92 },
    factRule: { width: 1, alignSelf: 'stretch', backgroundColor: palette.border },
    factValue: {
      color: palette.text,
      fontSize: 17,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    factLabel: {
      color: palette.textSecondary,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    error: { color: palette.danger },
    actions: { alignSelf: 'stretch', alignItems: 'center', gap: 2 },
    row: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginBottom: 4 },
    break: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      paddingVertical: 16,
    },
    breakOn: { backgroundColor: palette.textSecondary, borderColor: palette.textSecondary },
    breakText: { color: palette.text, fontWeight: '700', fontSize: 15.5 },
    breakTextOn: { color: '#fff' },
    finish: {
      flex: 1.2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: palette.accent,
      borderRadius: 18,
      paddingVertical: 16,
    },
    finishText: { color: '#fff', fontWeight: '800', fontSize: 15.5 },
    overdue: {
      borderWidth: 1,
      borderColor: palette.danger,
      backgroundColor: palette.backgroundElement,
      borderRadius: 14,
      padding: 12,
      marginTop: 12,
    },
    overdueText: { color: palette.text, fontWeight: '700', fontSize: 14 },
    overdueButton: {
      backgroundColor: palette.danger,
      borderRadius: 10,
      alignItems: 'center',
      paddingVertical: 10,
      marginTop: 10,
    },
    overdueButtonText: { color: '#fff', fontWeight: '700' },
    overdueHint: { color: palette.textSecondary, fontSize: 12, marginTop: 8, lineHeight: 16 },
    quiet: { paddingVertical: 9 },
    quietText: { color: palette.textSecondary, fontWeight: '600', fontSize: 13.5 },
  });
