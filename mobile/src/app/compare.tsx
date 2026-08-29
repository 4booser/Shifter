import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { addMonths, currentMonth, monthBounds, monthLabel, YearMonth } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import { DaysResponse, money } from '@/lib/types';

/**
 * Two months, side by side — asked where the question is actually asked.
 *
 * «Этот месяц против прошлого» is bar-counter talk, not desk talk, and the
 * site had this page first. The figures are the server's own range totals for
 * both periods, so this screen and the calendar cannot disagree.
 */
export default function CompareScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // The right month against the one before it. Stepping moves both: the
  // question is always "this against the previous", whichever "this" is.
  const [at, setAt] = useState<YearMonth>(currentMonth());

  const [now, setNow] = useState<DaysResponse | null>(null);
  const [before, setBefore] = useState<DaysResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const a = monthBounds(at);
    const b = monthBounds(addMonths(at, -1));

    setError(null);

    Promise.all([
      api<DaysResponse>(`/shifter/v1/days?from=${a.from}&to=${a.to}`),
      api<DaysResponse>(`/shifter/v1/days?from=${b.from}&to=${b.to}`),
    ])
      .then(([one, two]) => {
        setNow(one);
        setBefore(two);
      })
      .catch(() => setError(t('Не удалось загрузить месяцы.')));
  }, [at]);

  useEffect(load, [load]);

  const rows: {
    label: string;
    read: (data: DaysResponse) => number;
    kind: 'money' | 'hours' | 'count' | 'rate';
    /** Where more is not better — spending-shaped figures. */
    inverted?: boolean;
  }[] = [
    { label: 'Заработано', read: (d) => d.total_earned, kind: 'money' },
    { label: 'Из них чаевые', read: (d) => d.tips_earned, kind: 'money' },
    { label: 'На руки', read: (d) => d.net_earned, kind: 'money' },
    { label: 'Часы', read: (d) => d.hours, kind: 'hours' },
    { label: 'Смен', read: (d) => d.days_worked, kind: 'count' },
    {
      label: 'Ставка часа',
      read: (d) => (d.hours > 0 ? d.total_earned / d.hours : 0),
      kind: 'rate',
    },
    { label: 'Удержания', read: (d) => d.deductions, kind: 'money', inverted: true },
    { label: 'Расходы', read: (d) => d.expenses, kind: 'money', inverted: true },
  ];

  const spell = (value: number, kind: string) =>
    kind === 'money' || kind === 'rate'
      ? money(value)
      : kind === 'hours'
        ? `${Math.round(value)} ${t('ч')}`
        : `${Math.round(value)}`;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}
    >
      <View style={styles.head}>
        <Text style={styles.title}>{t('Сравнение месяцев')}</Text>
        <Press hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={palette.textSecondary} />
        </Press>
      </View>

      <View style={styles.picker}>
        <Press hitSlop={10} onPress={() => setAt(addMonths(at, -1))}>
          <Ionicons name="chevron-back" size={20} color={palette.textSecondary} />
        </Press>
        <Text style={styles.pickerLabel}>
          {monthLabel(addMonths(at, -1))} → {monthLabel(at)}
        </Text>
        <Press hitSlop={10} onPress={() => setAt(addMonths(at, 1))}>
          <Ionicons name="chevron-forward" size={20} color={palette.textSecondary} />
        </Press>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {now !== null && before !== null && (
        <View style={styles.card}>
          {rows.map((row, index) => {
            const a = row.read(before);
            const b = row.read(now);
            const delta = b - a;

            // A change against nothing is not a percentage — it is the thing
            // having started, and it is said with a number, not with ∞%.
            const share = a > 0 ? Math.round((delta / a) * 100) : null;
            const better = row.inverted === true ? delta < 0 : delta > 0;

            return (
              <View key={row.label} style={[styles.row, index > 0 && styles.rowBorder]}>
                <Text style={styles.rowLabel}>{t(row.label)}</Text>
                <View style={styles.rowValues}>
                  <Text style={styles.was}>{spell(a, row.kind)}</Text>
                  <Ionicons name="arrow-forward" size={12} color={palette.textSecondary} />
                  <Text style={styles.is}>{spell(b, row.kind)}</Text>
                  {delta !== 0 && (
                    <Text
                      style={[
                        styles.delta,
                        { color: better ? palette.good : palette.danger },
                      ]}
                    >
                      {share === null
                        ? delta > 0 ? '+' : '−'
                        : `${delta > 0 ? '+' : '−'}${Math.abs(share)}%`}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.hint}>
        {t('Те же итоги, что считает календарь, — два месяца рядом. Ставка часа — заработанное на отработанное, без плана.')}
      </Text>
    </ScrollView>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 20, paddingBottom: 48, gap: 12 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: palette.text, fontSize: 22, fontWeight: '800' },
    picker: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: palette.backgroundElement,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    pickerLabel: { color: palette.text, fontSize: 14.5, fontWeight: '700' },
    error: { color: palette.danger, fontSize: 13.5 },
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 16,
      paddingHorizontal: 14,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 11,
      gap: 8,
    },
    rowBorder: { borderTopWidth: 1, borderTopColor: palette.border },
    rowLabel: { color: palette.textSecondary, fontSize: 13.5, flexShrink: 1 },
    rowValues: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    was: { color: palette.textSecondary, fontSize: 13.5 },
    is: { color: palette.text, fontSize: 14.5, fontWeight: '700' },
    delta: { fontSize: 12, fontWeight: '700' },
    hint: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 18 },
  });
