import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Press } from '@/components/motion';
import { Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { todayKey } from '@/lib/calendar';
import { t } from '@/lib/i18n';
import { DaysResponse, money } from '@/lib/types';
import { HeatCell, heatGrid } from '@/lib/year-heat';

/**
 * The web's year heat strip, in the pocket. No cursor — a tap answers with
 * «дата · сумма» under the grid; the year rides a horizontal scroll.
 */
export function YearHeatCard({ palette }: { palette: Palette }) {
  const styles = makeStyles(palette);
  const router = useRouter();
  const [days, setDays] = useState<{ date: string; earned: number }[] | null>(null);
  const [picked, setPicked] = useState<HeatCell | null>(null);

  useEffect(() => {
    const today = todayKey();
    const start = new Date(`${today}T12:00:00`);

    start.setDate(start.getDate() - 53 * 7);

    const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

    void api<DaysResponse>(`/shifter/v1/days?from=${from}&to=${today}`)
      .then((summary) => setDays(summary.days.map((day) => ({ date: day.date, earned: day.earned }))))
      .catch(() => setDays([]));
  }, []);

  const grid = useMemo(() => (days === null ? null : heatGrid(days, todayKey())), [days]);
  const strip = useRef<ScrollView>(null);

  if (grid === null || days === null || days.length < 30) return null;

  const monthName = (month: number) =>
    new Date(2026, month - 1, 15).toLocaleDateString('ru', { month: 'short' });

  const say = (cell: HeatCell) => {
    const label = new Date(`${cell.date}T12:00:00`).toLocaleDateString('ru', {
      day: 'numeric',
      month: 'long',
    });

    return cell.earned === null ? `${label} — ${t('не записано')}` : `${label} · ${money(cell.earned)}`;
  };

  const paint = (cell: HeatCell) => {
    if (cell.level === null)
      return { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.border };

    return {
      backgroundColor: palette.accent,
      opacity: [0.14, 0.32, 0.55, 0.78, 1][cell.level],
    };
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('Год в квадратах')}</Text>
      <Text style={styles.hint}>
        {t('Цвет — квартиль заработка среди оплаченных дней. Пустая клетка — день без записи, это не ноль.')}
      </Text>

      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        // The strip opens on the freshest weeks: the far left is a year ago
        // and, on a young account, honestly empty.
        onContentSizeChange={() => strip.current?.scrollToEnd({ animated: false })}
      >
        <View>
          <View style={[styles.monthRow, { width: grid.weeks.length * 14 }]}>
            {grid.months.map((month) => (
              <Text key={`${month.index}-${month.label}`} style={[styles.monthLabel, { left: month.index * 14 }]} numberOfLines={1}>
                {monthName(month.label)}
              </Text>
            ))}
          </View>
          <View style={styles.strip}>
            {grid.weeks.map((week, index) => (
              <View key={index} style={styles.week}>
                {week.map((cell) => (
                  <Press
                    key={cell.date}
                    haptic={false}
                    onPress={() => setPicked(picked?.date === cell.date ? null : cell)}
                  >
                    <View style={[styles.cell, paint(cell)]} />
                  </Press>
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {picked !== null && (
        <View style={styles.answerRow}>
          <Text style={styles.answer}>{say(picked)}</Text>
          <Press hitSlop={8} onPress={() => router.push(`/day/${picked.date}`)}>
            <Text style={styles.openDay}>{t('Открыть день')} →</Text>
          </Press>
        </View>
      )}

      <View style={styles.legendRow}>
        <Text style={styles.legend}>{t('меньше')}</Text>
        {[0.14, 0.32, 0.55, 0.78, 1].map((share) => (
          <View key={share} style={[styles.legendCell, { backgroundColor: palette.accent, opacity: share }]} />
        ))}
        <Text style={styles.legend}>{t('больше')}</Text>
      </View>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.backgroundElement,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 16,
      marginTop: 12,
    },
    title: { color: palette.text, fontSize: 15, fontWeight: '700' },
    hint: { color: palette.textSecondary, fontSize: 12, marginTop: 3, marginBottom: 10, lineHeight: 16 },
    monthRow: { height: 14, marginBottom: 2 },
    monthLabel: { position: 'absolute', top: 0, fontSize: 9, color: palette.textSecondary, width: 40 },
    strip: { flexDirection: 'row', gap: 3 },
    week: { gap: 3 },
    cell: { width: 11, height: 11, borderRadius: 3 },
    answerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
    answer: { color: palette.text, fontSize: 13, fontWeight: '600' },
    openDay: { color: palette.accent, fontSize: 13, fontWeight: '700' },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8, justifyContent: 'flex-end' },
    legend: { color: palette.textSecondary, fontSize: 11, marginHorizontal: 3 },
    legendCell: { width: 9, height: 9, borderRadius: 2 },
  });
