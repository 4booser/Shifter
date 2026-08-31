import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/motion';
import { buzz } from '@/lib/haptics';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { currentMonth, monthBounds, monthLabel } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import { CalendarDayData, money } from '@/lib/types';
import { shareIncomePdf } from '@/lib/papers-share';

/**
 * The month, day by day — the site's report in the pocket.
 *
 * Every row is a day that happened: the shifts on it, the hours, what came
 * in tips and what the day earned, with the month's totals under them. The
 * one screen somebody opens when a manager says «and what did you actually
 * work in August», which is exactly why it also offers the paper.
 */
interface Range {
  days: CalendarDayData[];
  total_earned: number;
  hours: number;
  days_worked: number;
  tips_earned: number;
}

export default function ReportScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const [month, setMonth] = useState(currentMonth());
  const [range, setRange] = useState<Range | null>(null);

  const bounds = useMemo(() => monthBounds(month), [month]);

  useEffect(() => {
    setRange(null);

    void api<Range>(`/shifter/v1/days?from=${bounds.from}&to=${bounds.to}`)
      .then(setRange)
      .catch(() => setRange(null));
  }, [bounds.from, bounds.to]);

  const rows = (range?.days ?? [])
    .filter((day) => day.shifts.some((shift) => shift.worked) || (day.tips ?? 0) > 0)
    .sort((one, two) => one.date.localeCompare(two.date));

  const step = (delta: number) => {
    buzz.choose();
    setMonth((was) => {
      const at = new Date(was.year, was.month - 1 + delta, 1);

      return { year: at.getFullYear(), month: at.getMonth() + 1 };
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.head}>
        <Text style={styles.title}>{t('Отчёт за месяц')}</Text>
        <Press hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={palette.textSecondary} />
        </Press>
      </View>

      <View style={styles.monthRow}>
        <Press style={styles.stepper} onPress={() => step(-1)}>
          <Ionicons name="chevron-back" size={18} color={palette.text} />
        </Press>
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        <Press style={styles.stepper} onPress={() => step(1)}>
          <Ionicons name="chevron-forward" size={18} color={palette.text} />
        </Press>
      </View>

      {range === null ? (
        <ActivityIndicator color={palette.accent} />
      ) : rows.length === 0 ? (
        <Text style={styles.lead}>{t('В этом месяце ещё нет отработанных смен.')}</Text>
      ) : (
        <>
          <View style={styles.totals}>
            <View style={styles.totalCell}>
              <Text style={styles.totalValue}>{range.days_worked}</Text>
              <Text style={styles.totalLabel}>{t('смен')}</Text>
            </View>
            <View style={styles.totalCell}>
              <Text style={styles.totalValue}>{Math.round(range.hours)}</Text>
              <Text style={styles.totalLabel}>{t('часов')}</Text>
            </View>
            <View style={styles.totalCell}>
              <Text style={[styles.totalValue, { color: palette.good }]}>{money(range.total_earned)}</Text>
              <Text style={styles.totalLabel}>{t('заработано')}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.rowHead}>
              <Text style={[styles.cellDay, styles.headText]}>{t('День')}</Text>
              <Text style={[styles.cellHours, styles.headText]}>{t('ч')}</Text>
              <Text style={[styles.cellTips, styles.headText]}>{t('чай')}</Text>
              <Text style={[styles.cellEarned, styles.headText]}>{t('всего')}</Text>
            </View>

            {rows.map((day) => {
              const worked = day.shifts.filter((shift) => shift.worked);
              const hours = worked.reduce((sum, shift) => sum + shift.hours, 0);
              const tips = (day.tips ?? 0) + (day.tips_cash ?? 0);

              return (
                <View key={day.date} style={styles.row}>
                  <View style={styles.cellDay}>
                    <Text style={styles.dayNumber}>{day.date.slice(8)}</Text>
                    <Text style={styles.dayShifts} numberOfLines={1}>
                      {worked.map((shift) => shift.name).join(', ') || '·'}
                    </Text>
                  </View>
                  <Text style={styles.cellHours}>{hours > 0 ? Math.round(hours * 10) / 10 : '·'}</Text>
                  <Text style={styles.cellTips}>{tips > 0 ? money(tips) : '·'}</Text>
                  <Text style={[styles.cellEarned, styles.earnedText]}>{money(day.earned)}</Text>
                </View>
              );
            })}
          </View>

          <Press
            style={styles.paper}
            onPress={() => void shareIncomePdf('ru', { from: bounds.from, to: bounds.to })}
          >
            <Ionicons name="reader-outline" size={18} color={palette.accent} />
            <Text style={styles.paperText}>{t('Справка о доходе за этот месяц')}</Text>
          </Press>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 20, paddingBottom: 48, gap: 12 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: palette.text, fontSize: 26, fontWeight: '800' },
    lead: { color: palette.textSecondary, fontSize: 13, lineHeight: 18 },

    monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepper: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    monthLabel: { color: palette.text, fontSize: 16, fontWeight: '700', textTransform: 'capitalize' },

    totals: { flexDirection: 'row', gap: 8 },
    totalCell: {
      flex: 1,
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 12,
      alignItems: 'center',
    },
    totalValue: { color: palette.text, fontSize: 18, fontWeight: '800' },
    totalLabel: { color: palette.textSecondary, fontSize: 11, marginTop: 2 },

    card: {
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    headText: { color: palette.textSecondary, fontSize: 11, textTransform: 'uppercase' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.border,
    },
    cellDay: { flex: 1 },
    dayNumber: { color: palette.text, fontSize: 14, fontWeight: '700' },
    dayShifts: { color: palette.textSecondary, fontSize: 11, marginTop: 1 },
    cellHours: { width: 44, textAlign: 'right', color: palette.text, fontSize: 13 },
    cellTips: { width: 78, textAlign: 'right', color: palette.textSecondary, fontSize: 13 },
    cellEarned: { width: 90, textAlign: 'right', color: palette.text, fontSize: 13 },
    earnedText: { fontWeight: '700' },

    paper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 13,
    },
    paperText: { color: palette.accent, fontSize: 14, fontWeight: '700' },
  });
