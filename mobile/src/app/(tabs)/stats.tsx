import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { ClockRing, MoneyFlow, MonthBars } from '@/components/charts';
import { Appear, Press, Roll } from '@/components/motion';
import { Pace } from '@/components/pace';
import { running } from '@/lib/pace';

import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import {
  addMonths,
  changeOf,
  currentMonth,
  monthBounds,
  monthLabel,
  previousRange,
  todayKey,
} from '@/lib/calendar';
import { DaysResponse, money, moneyIn, plural } from '@/lib/types';
import { t } from '@/lib/i18n';

/** Money and hours at one place, and what the journey does to them. */
interface PlaceTotal {
  location_id: number;
  name: string;
  colour: string;
  hours: number;
  earned: number;
  days_worked: number;
  tips: number;
  per_hour: number;
  currency: string;
  /**
   * Null where nobody has said how far the place is. An unstated commute is
   * not a commute of zero, and printing "the same" would invent a comparison.
   */
  commute: { travel_hours: number; fares: number; per_hour_with_travel: number } | null;
}

interface Summary extends DaysResponse {
  by_location?: PlaceTotal[];
  /** Every currency the range touches. More than one means ₴ is a lie. */
  currencies?: string[];
  tips_earned: number;
  sales_earned: number;
  period_earned: number;
  overtime_earned: number;
  premium_earned: number;
  shifts_earned: number;
  /** The share of the takings, already inside shifts_earned. */
  revenue_earned: number;
  revenue_counted: number;
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = makeStyles(palette);

  const [span, setSpan] = useState<Span>('month');
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [before, setBefore] = useState<Summary | null>(null);
  const [partial, setPartial] = useState(false);
  const [months, setMonths] = useState<{ label: string; value: number; current: boolean }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * A place's hourly rate in the currency it is actually paid in. Where the
   * range touches only one currency the app's own symbol is right and reads
   * better; where it touches several, stamping ₴ on złoty is exactly the
   * confident lie about money this app does not tell.
   */
  const rate = (place: { currency: string }, value: number) =>
    (summary?.currencies ?? []).length > 1
      ? moneyIn(place.currency === '' ? (summary?.conversion?.base_currency ?? 'UAH') : place.currency, value)
      : money(value);

  /**
   * An amount in the currency the totals are actually in. Where the range
   * touches one currency the app's own symbol is right and reads better; where
   * it touches several, everything is already converted and printing ₴ on it
   * would be the confident lie this app does not tell.
   */
  const amount = (value: number) =>
    (summary?.currencies ?? []).length > 1
      ? moneyIn(summary?.conversion?.base_currency ?? 'UAH', value)
      : money(value);

  const bounds =
    span === 'month'
      ? monthBounds(month)
      : { from: `${month.year}-01-01`, to: `${month.year}-12-31` };

  const load = useCallback(async () => {
    const past = previousRange(span, month, todayKey());

    try {
      // The base is asked for here alone: this is the screen where a period
      // is meant to read as one number, and that is what a conversion is for.
      const [now, then] = await Promise.all([
        api<Summary>(`/shifter/v1/days?from=${bounds.from}&to=${bounds.to}&base=UAH`),
        api<Summary>(
          `/shifter/v1/days?from=${past.range.from}&to=${past.range.to}&base=UAH`,
        ).catch(() => null),
      ]);

      setSummary(now);
      setBefore(then);
      setPartial(past.partial);
      setError(null);
    } catch {
      setError(t('Не дотянулись до сервера.'));
    }
  }, [bounds.from, bounds.to, span, month]);

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

        // How many hours the shift spans, wrapping midnight. Counted first
        // rather than walked until the end hour comes round: a handover that
        // starts and ends in the same hour never met that condition until all
        // twenty-four had been marked, so the dial lit up completely and
        // "лучший час" reported midnight.
        const span = end === start ? 1 : (end - start + 24) % 24;

        for (let step = 0; step < span; step++) hours[(start + step) % 24] += 1;
      }
    }

    return hours;
  }, [summary]);

  const parts = summary === null
    ? []
    : [
        // The percentage comes out of the shifts figure it already sits
        // inside: hidden there it cannot be seen to be working, which is the
        // whole reason somebody agreed to it.
        { name: t('Смены'), value: summary.shifts_earned - summary.revenue_earned, colour: palette.accent },
        { name: t('Процент'), value: summary.revenue_earned, colour: '#B5449C' },
        { name: t('Надбавки'), value: summary.premium_earned + summary.overtime_earned, colour: palette.good },
        { name: t('Продажи'), value: summary.sales_earned, colour: '#D97706' },
        { name: t('Чаевые'), value: summary.tips_earned, colour: '#0891B2' },
      ].filter((part) => part.value > 0);

  // Converted where the range mixes currencies: adding złoty to hryvnia and
  // dividing by hours is a number with no meaning at all.
  const perHour =
    summary === null || summary.hours <= 0
      ? 0
      : (summary.conversion?.total_earned ?? summary.total_earned) / summary.hours;

  // The same period a year or a month back, cut to the same length where this
  // one is still running. A comparison is the only thing on this screen that
  // answers "is it going well", and until now nothing here answered it.
  const earnedBefore = before === null
    ? null
    : (before.conversion?.total_earned ?? before.total_earned);
  const perHourBefore =
    before === null || before.hours <= 0
      ? null
      : (before.conversion?.total_earned ?? before.total_earned) / before.hours;

  const step = (by: number) => {
    setSummary(null);
    setBefore(null);
    setMonth((at) => (span === 'month' ? addMonths(at, by) : { ...at, year: at.year + by }));
  };

  // Sideways changes the period, the way it does on the calendar. The offset
  // keeps a vertical scroll vertical: a list that jumps to last month because
  // a thumb drifted is worse than no gesture at all.
  const swipe = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .onEnd((event) => {
      if (Math.abs(event.translationX) < 60) return;

      step(event.translationX < 0 ? 1 : -1);
    })
    .runOnJS(true);

  return (
    <GestureDetector gesture={swipe}>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}
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
      <Text style={styles.title}>{t('Статистика')}</Text>

      <View style={styles.toolbar}>
        {(['month', 'year'] as Span[]).map((value) => (
          <Press
            key={value}
            style={[styles.segment, span === value && styles.segmentOn]}
            onPress={() => setSpan(value)}
          >
            <Text style={[styles.segmentText, span === value && styles.segmentTextOn]}>
              {value === 'month' ? t('Месяц') : t('Год')}
            </Text>
          </Press>
        ))}
        <View style={styles.spacer} />
        <Press style={styles.navButton} onPress={() => step(-1)}>
          <Text style={styles.navText}>‹</Text>
        </Press>
        <Text style={styles.period}>
          {span === 'month' ? monthLabel(month) : `${month.year}`}
        </Text>
        <Press style={styles.navButton} onPress={() => step(1)}>
          <Text style={styles.navText}>›</Text>
        </Press>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Appear>
      <View style={styles.kpis}>
        {/* Where the range mixes currencies the plain sum is hryvnia and
            zloty added together as if they were the same money. The converted
            figure is the only honest headline. */}
        <Kpi
          palette={palette}
          label={t("Заработано")}
          value={
            summary?.conversion != null
              ? `≈ ${moneyIn(summary.conversion.base_currency, summary.conversion.total_earned)}`
              : money(summary?.total_earned ?? 0)
          }
          change={changeOf(
            summary?.conversion?.total_earned ?? summary?.total_earned ?? 0,
            earnedBefore ?? 0,
          )}
          strong
        />
        {/* Every other figure on this screen is guarded; this one stamped a
            hryvnia sign on a sum of hryvnia and złoty, directly above the card
            that exists to say the range mixes currencies. */}
        <Kpi
          palette={palette}
          label={t("В час")}
          value={
            (summary?.currencies ?? []).length > 1
              ? moneyIn(summary?.conversion?.base_currency ?? 'UAH', perHour)
              : money(perHour)
          }
          change={changeOf(perHour, perHourBefore ?? 0)}
        />
        <Kpi
          palette={palette}
          label={t("Смен")}
          amount={summary?.days_worked ?? 0}
          change={changeOf(summary?.days_worked ?? 0, before?.days_worked ?? 0)}
        />
        <Kpi
          palette={palette}
          label={t("Часов")}
          amount={Math.round(summary?.hours ?? 0)}
          change={changeOf(summary?.hours ?? 0, before?.hours ?? 0)}
        />
      </View>
      </Appear>

      {/* The comparison as a shape rather than a percentage: whether the month
          started slowly and caught up, or started well and stalled, are two
          completely different conversations and one number cannot tell them
          apart. */}
      {summary !== null && span === 'month' && (
        <Appear index={1}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Темп месяца')}</Text>
            <Pace
              now={running(summary.days, bounds.from, bounds.to)}
              before={
                before === null
                  ? []
                  : running(
                      before.days,
                      previousRange(span, month, todayKey()).range.from,
                      previousRange(span, month, todayKey()).range.to,
                    )
              }
              palette={palette}
            />
          </View>
        </Appear>
      )}

      {before !== null && earnedBefore !== null && earnedBefore > 0 && (
        <Text style={styles.against}>
          {partial
            ? `${t('Против тех же дней')} ${span === 'month' ? t('прошлого месяца') : t('прошлого года')}: ${amount(earnedBefore)}`
            : `${span === 'month' ? t('Прошлый месяц') : t('Прошлый год')}: ${amount(earnedBefore)}`}
        </Text>
      )}

      {/* Which hour is worth more — the question behind holding two jobs. */}
      {(summary?.by_location ?? []).length >= 2 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Места бок о бок')}</Text>

          {[...(summary?.by_location ?? [])]
            .sort(
              (a, b) =>
                (b.commute?.per_hour_with_travel ?? b.per_hour) -
                (a.commute?.per_hour_with_travel ?? a.per_hour),
            )
            .map((place) => (
              <View key={place.location_id} style={styles.placeRow}>
                <View style={[styles.placeDot, { backgroundColor: place.colour }]} />
                <View style={styles.grow}>
                  <Text style={styles.placeName} numberOfLines={1}>
                    {place.location_id === 0 ? t('Без места') : place.name}
                  </Text>
                  <Text style={styles.placeMeta}>
                    {plural(place.days_worked, t('смена'), t('смены'), t('смен'))} ·{' '}
                    {Math.round(place.hours)} ч
                    {place.commute !== null &&
                      ` · +${Math.round(place.commute.travel_hours)} ${t('ч в пути')}`}
                  </Text>
                </View>
                <View style={styles.placeMoney}>
                  {/* The commute figure leads where there is one: it is the
                      number that decides which job to keep. */}
                  <Text style={styles.placeHour}>
                    {rate(place, place.commute?.per_hour_with_travel ?? place.per_hour)}
                    <Text style={styles.placeHourUnit}>{t('/час')}</Text>
                  </Text>
                  {place.commute !== null && (
                    <Text style={styles.placeWas}>без дороги {rate(place, place.per_hour)}</Text>
                  )}
                </View>
              </View>
            ))}
        </View>
      )}

      {summary?.conversion != null && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Всё в одной валюте')}</Text>
          <Text style={styles.convertedTotal}>
            ≈ {moneyIn(summary.conversion.base_currency, summary.conversion.total_earned)}
          </Text>

          {summary.conversion.by_location.map((place) => (
            <View key={place.location_id} style={styles.convertRow}>
              <Text style={styles.convertPlace} numberOfLines={1}>
                {place.location_id === 0 ? t('Без места') : place.name}
                <Text style={styles.convertCode}> {place.currency}</Text>
              </Text>
              <Text style={styles.convertValue}>
                {moneyIn(place.currency, place.earned)}
                {place.currency !== summary.conversion!.base_currency && (
                  <Text style={styles.convertStrong}>
                    {place.converted === null
                      ? t('  → курса нет')
                      : `  ≈ ${moneyIn(summary.conversion!.base_currency, place.converted)}`}
                  </Text>
                )}
              </Text>
            </View>
          ))}

          {/* The rate is part of the answer: a converted wage nobody can
              check against their own bank is one they will act on and later
              find was invented. */}
          <Text style={styles.convertRate}>
            {summary.conversion.rates
              .map((rate) => `1 ${rate.code} = ${rate.rate} UAH · ${rate.on}`)
              .join('   ')}
          </Text>

          {summary.conversion.unconverted.length > 0 && (
            <Text style={styles.convertMissing}>
              Курса нет для {summary.conversion.unconverted.join(', ')} — эти деньги не в сумме
              выше.
            </Text>
          )}
        </View>
      )}

      {parts.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Откуда пришли деньги')}</Text>
          <MoneyFlow parts={parts} palette={palette} format={amount} />
        </View>
      )}

      {dial.some((value) => value > 0) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Круглые сутки')}</Text>
          <ClockRing hours={dial} palette={palette} />
        </View>
      )}

      {months.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Двенадцать месяцев')}</Text>
          <MonthBars rows={months} palette={palette} format={amount} />
        </View>
      )}
    </ScrollView>
    </GestureDetector>
  );
}

function Kpi({
  palette,
  label,
  value,
  amount,
  change,
  strong = false,
}: {
  palette: Palette;
  label: string;
  /** A formatted figure, where the currency has to be decided by the caller. */
  value?: string;
  /** A plain count, which can be rolled rather than swapped. */
  amount?: number;
  /** Per cent against the same period before. Null where there is none. */
  change?: number | null;
  strong?: boolean;
}) {
  const styles = makeStyles(palette);

  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>

      {amount === undefined ? (
        <Text style={[styles.kpiValue, strong && styles.kpiValueStrong]}>{value}</Text>
      ) : (
        <Roll value={amount} style={[styles.kpiValue, strong && styles.kpiValueStrong]} />
      )}

      {/* Zero is worth saying — "the same as last month" is an answer. Null is
          not: it means there was nothing to divide by. */}
      {change !== null && change !== undefined && (
        <Text
          style={[
            styles.kpiChange,
            change > 0 && { color: palette.good },
            change < 0 && { color: palette.danger },
          ]}
        >
          {change > 0 ? '↑' : change < 0 ? '↓' : '='} {Math.abs(change)}%
        </Text>
      )}
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    // The last card ended flush against the tab bar; every other screen
    // leaves room for it.
    content: { padding: 14, gap: 10, paddingBottom: 44 },
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
    against: {
      color: palette.textSecondary,
      fontSize: 12.5,
      textAlign: 'center',
      marginTop: -2,
    },
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
    kpiChange: {
      color: palette.textSecondary,
      fontSize: 11.5,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      marginTop: 1,
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
    convertedTotal: { color: palette.good, fontSize: 24, fontWeight: '800', marginTop: 4 },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
    placeDot: { width: 9, height: 9, borderRadius: 999 },
    grow: { flex: 1, minWidth: 0 },
    placeName: { color: palette.text, fontSize: 15, fontWeight: '600' },
    placeMeta: { color: palette.textSecondary, fontSize: 12, marginTop: 2 },
    placeMoney: { alignItems: 'flex-end' },
    placeHour: { color: palette.text, fontSize: 16, fontWeight: '800' },
    placeHourUnit: { color: palette.textSecondary, fontSize: 12, fontWeight: '600' },
    placeWas: { color: palette.textSecondary, fontSize: 11, marginTop: 2 },
    convertRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 6 },
    convertPlace: { color: palette.textSecondary, fontSize: 13, flexShrink: 1 },
    convertCode: { color: palette.textSecondary, fontSize: 11 },
    convertValue: { color: palette.text, fontSize: 13 },
    convertStrong: { color: palette.text, fontWeight: '700' },
    convertRate: { color: palette.textSecondary, fontSize: 11, marginTop: 10 },
    convertMissing: { color: palette.danger, fontSize: 12, marginTop: 6, lineHeight: 17 },
    cardTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
  });
