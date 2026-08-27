import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import { ClockRing, MoneyFlow, MonthBars } from '@/components/charts';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { addMonths, currentMonth, monthBounds, monthLabel } from '@/lib/calendar';
import { DaysResponse, money } from '@/lib/types';

interface Summary extends DaysResponse {
  tips_earned: number;
  sales_earned: number;
  period_earned: number;
  overtime_earned: number;
  premium_earned: number;
  shifts_earned: number;
}

type Span = 'month' | 'year';

/**
 * Statistics in the hand: the four numbers people actually quote, then the
 * shape of the money and the shape of the day. Everything is priced by the
 * server — the phone only draws — so the figures here and on the site can
 * never drift apart.
 */
export default function StatsScreen() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);

  const [span, setSpan] = useState<Span>('month');
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [months, setMonths] = useState<{ label: string; value: number; current: boolean }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bounds =
    span === 'month'
      ? monthBounds(month)
      : { from: `${month.year}-01-01`, to: `${month.year}-12-31` };

  const load = useCallback(async () => {
    try {
      setSummary(await api<Summary>(`/shifter/v1/days?from=${bounds.from}&to=${bounds.to}`));
      setError(null);
    } catch {
      setError('Не дотянулись до сервера.');
    }
  }, [bounds.from, bounds.to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Twelve months back, one request each — the same call the site makes.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const now = currentMonth();
      const rows: { label: string; value: number; current: boolean }[] = [];

      for (let back = 11; back >= 0; back--) {
        const at = addMonths(now, -back);
        const range = monthBounds(at);

        try {
          const data = await api<DaysResponse>(`/shifter/v1/days?from=${range.from}&to=${range.to}`);

          rows.push({
            label: monthLabel(at).slice(0, 3),
            value: data.total_earned,
            current: back === 0,
          });
        } catch {
          rows.push({ label: monthLabel(at).slice(0, 3), value: 0, current: back === 0 });
        }
      }

      if (!cancelled) setMonths(rows);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Which hours of the day this person is actually on shift.
  const dial = useMemo(() => {
    const hours = new Array(24).fill(0) as number[];

    for (const day of summary?.days ?? []) {
      for (const shift of day.shifts) {
        if (!shift.worked) continue;

        const start = Number(shift.start_time.slice(0, 2));
        const end = Number(shift.end_time.slice(0, 2));
        let cursor = start;

        // An overnight shift wraps; without this the small hours look empty
        // for exactly the people who work them.
        for (let guard = 0; guard < 24; guard++) {
          hours[cursor % 24] += 1;
          cursor += 1;

          if (cursor % 24 === end) break;
        }
      }
    }

    return hours;
  }, [summary]);

  const parts = summary === null
    ? []
    : [
        { name: 'Смены', value: summary.shifts_earned, colour: palette.accent },
        { name: 'Надбавки', value: summary.premium_earned + summary.overtime_earned, colour: palette.good },
        { name: 'Продажи', value: summary.sales_earned, colour: '#D97706' },
        { name: 'Чаевые', value: summary.tips_earned, colour: '#0891B2' },
      ].filter((part) => part.value > 0);

  const perHour = summary === null || summary.hours <= 0 ? 0 : summary.total_earned / summary.hours;

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
      <Text style={styles.title}>Статистика</Text>

      <View style={styles.toolbar}>
        {(['month', 'year'] as Span[]).map((value) => (
          <Pressable
            key={value}
            style={[styles.segment, span === value && styles.segmentOn]}
            onPress={() => setSpan(value)}
          >
            <Text style={[styles.segmentText, span === value && styles.segmentTextOn]}>
              {value === 'month' ? 'Месяц' : 'Год'}
            </Text>
          </Pressable>
        ))}
        <View style={styles.spacer} />
        <Pressable style={styles.navButton} onPress={() => setMonth((at) => addMonths(at, -1))}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.period}>
          {span === 'month' ? monthLabel(month) : `${month.year}`}
        </Text>
        <Pressable style={styles.navButton} onPress={() => setMonth((at) => addMonths(at, 1))}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <View style={styles.kpis}>
        <Kpi palette={palette} label="Заработано" value={money(summary?.total_earned ?? 0)} strong />
        <Kpi palette={palette} label="В час" value={money(perHour)} />
        <Kpi palette={palette} label="Смен" value={`${summary?.days_worked ?? 0}`} />
        <Kpi palette={palette} label="Часов" value={`${Math.round(summary?.hours ?? 0)}`} />
      </View>

      {parts.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Откуда пришли деньги</Text>
          <MoneyFlow parts={parts} palette={palette} />
        </View>
      )}

      {dial.some((value) => value > 0) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Круглые сутки</Text>
          <ClockRing hours={dial} palette={palette} />
        </View>
      )}

      {months.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Двенадцать месяцев</Text>
          <MonthBars rows={months} palette={palette} />
        </View>
      )}
    </ScrollView>
  );
}

function Kpi({
  palette,
  label,
  value,
  strong = false,
}: {
  palette: Palette;
  label: string;
  value: string;
  strong?: boolean;
}) {
  const styles = makeStyles(palette);

  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, strong && styles.kpiValueStrong]}>{value}</Text>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 14, paddingTop: 58, gap: 10 },
    title: { fontSize: 24, fontWeight: '800', color: palette.text, letterSpacing: -0.5 },
    toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    segment: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 12,
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
    },
    segmentOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    segmentText: { color: palette.text, fontSize: 13, fontWeight: '600' },
    segmentTextOn: { color: '#fff' },
    spacer: { flex: 1 },
    navButton: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
    },
    navText: { color: palette.text, fontSize: 17, lineHeight: 20 },
    period: { color: palette.text, fontSize: 13, fontWeight: '600', textTransform: 'capitalize', minWidth: 92, textAlign: 'center' },
    error: { color: palette.danger },
    kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    kpi: {
      flexGrow: 1,
      flexBasis: '46%',
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 16,
      padding: 12,
      gap: 2,
    },
    kpiLabel: { color: palette.textSecondary, fontSize: 12, fontWeight: '600' },
    kpiValue: { color: palette.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
    kpiValueStrong: { color: palette.good, fontSize: 24 },
    card: {
      backgroundColor: palette.backgroundElement,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 18,
      padding: 14,
      gap: 10,
    },
    cardTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
  });
