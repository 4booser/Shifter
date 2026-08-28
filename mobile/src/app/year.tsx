import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonthBars } from '@/components/charts';
import { Press } from '@/components/motion';
import { Colors, Palette } from '@/constants/theme';
import { api } from '@/lib/api';
import { currentMonth, monthBounds } from '@/lib/calendar';
import { DaysResponse, money, plural } from '@/lib/types';
import { t } from '@/lib/i18n';

/**
 * Hours are the honest measure of a year in hospitality: money moves with the
 * city and the season, hours are what a person actually gave. The names are
 * the trade's own, not a leaderboard.
 */
const TIERS: { hours: number; name: string; emoji: string }[] = [
  { hours: 1800, name: t('Легенда зала'), emoji: '👑' },
  { hours: 1200, name: t('Железная смена'), emoji: '🔥' },
  { hours: 800, name: t('Опора заведения'), emoji: '💪' },
  { hours: 400, name: t('Твёрдая рука'), emoji: '⚓️' },
  { hours: 150, name: t('Входите в ритм'), emoji: '🎯' },
  { hours: 0, name: t('Только начали'), emoji: '🌱' },
];

const MONTHS_SHORT = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

const WEEKDAYS = [t('Пн'), t('Вт'), t('Ср'), t('Чт'), t('Пт'), t('Сб'), t('Вс')];

interface YearSummary extends DaysResponse {
  tips_earned: number;
  by_location: { location_id: number; name: string; earned: number; hours: number }[];
  /** Every time the rate moved on a shift worked in the year, newest first. */
  raises?: Raise[];
}

/** One change of rate, read out of the shifts rather than kept in a log. */
interface Raise {
  shift_id: number;
  shift_name: string;
  location_name: string | null;
  on: string;
  before: number;
  after: number;
  period: 'hour' | 'day' | 'week' | 'month';
  worth_since: number;
  days_ago: number;
}

const PERIOD_SUFFIX: Record<Raise['period'], string> = {
  hour: t('/час'),
  day: t('/день'),
  week: t('/неделю'),
  month: t('/месяц'),
};

/**
 * The year, in the pocket. Everything here is counted from the same days the
 * calendar draws — a year is twelve of the same request the month view makes,
 * so nothing can disagree with anything.
 */
export default function YearScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const styles = makeStyles(palette);
  const insets = useSafeAreaInsets();

  const [year, setYear] = useState(currentMonth().year);
  const [summary, setSummary] = useState<YearSummary | null>(null);
  const [previous, setPrevious] = useState<YearSummary | null>(null);
  const [months, setMonths] = useState<{ label: string; value: number; current: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [now, before] = await Promise.all([
        api<YearSummary>(`/shifter/v1/days?from=${year}-01-01&to=${year}-12-31`),
        api<YearSummary>(`/shifter/v1/days?from=${year - 1}-01-01&to=${year - 1}-12-31`),
      ]);

      setSummary(now);
      setPrevious(before);
      setError(null);
    } catch {
      setError(t('Не дотянулись до сервера.'));
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  // One request per month for the bars: the same call the month view makes,
  // so a bar and the month behind it can never show different money.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const rows: { label: string; value: number; current: boolean }[] = [];
      const today = currentMonth();

      for (let month = 1; month <= 12; month++) {
        const range = monthBounds({ year, month });

        try {
          const data = await api<DaysResponse>(`/shifter/v1/days?from=${range.from}&to=${range.to}`);

          rows.push({
            label: t(MONTHS_SHORT[month - 1]),
            value: data.total_earned,
            current: year === today.year && month === today.month,
          });
        } catch {
          rows.push({ label: t(MONTHS_SHORT[month - 1]), value: 0, current: false });
        }
      }

      if (!cancelled) setMonths(rows);
    })();

    return () => {
      cancelled = true;
    };
  }, [year]);

  const tier = TIERS.find((entry) => (summary?.hours ?? 0) >= entry.hours) ?? TIERS[TIERS.length - 1];

  const facts = useMemo(() => {
    if (summary === null) return null;

    const worked = summary.days.filter((day) => day.shifts.some((shift) => shift.worked));
    const best = worked.reduce<(typeof worked)[number] | null>(
      (top, day) => (top === null || day.earned > top.earned ? day : top),
      null,
    );

    const byWeekday = new Map<number, number>();
    const byShift = new Map<string, number>();
    let nights = 0;
    let shifts = 0;

    for (const day of worked) {
      const weekday = (new Date(`${day.date}T00:00:00`).getDay() + 6) % 7;

      byWeekday.set(weekday, (byWeekday.get(weekday) ?? 0) + 1);

      for (const entry of day.shifts) {
        if (!entry.worked) continue;

        shifts += 1;
        byShift.set(entry.name, (byShift.get(entry.name) ?? 0) + 1);
        if (Number(entry.start_time.slice(0, 2)) >= 20) nights += 1;
      }
    }

    const favourite = [...byShift.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
    const busiest = [...byWeekday.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
    const place = [...(summary.by_location ?? [])].sort((left, right) => right.earned - left.earned)[0] ?? null;

    // Days off are counted from the calendar, not from the response: a day
    // with nothing on it is never sent, so filtering the list for empty days
    // finds none and reports a year without a single day off.
    const today = new Date();
    const isThisYear = year === today.getFullYear();
    const start = new Date(year, 0, 1);
    const end = isThisYear ? today : new Date(year, 11, 31);
    const elapsed = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const daysOff = Math.max(0, elapsed - worked.length);

    return { best, favourite, busiest, place, nights, shifts, daysOff, worked: worked.length };
  }, [summary, year]);

  const delta = (now: number, before: number): string | null => {
    if (before <= 0 || now <= 0) return null;

    const change = Math.round(((now - before) / before) * 100);

    if (Math.abs(change) < 3) return t('как в прошлом');

    return change > 0 ? `+${change}% ${t('к прошлому')}` : `${change}% ${t('к прошлому')}`;
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.head}>
        <Text style={styles.title}>{t('Твой год')}</Text>
        <Press hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={palette.textSecondary} />
        </Press>
      </View>

      <View style={styles.yearNav}>
        <Press style={styles.navButton} onPress={() => setYear((value) => value - 1)}>
          <Ionicons name="chevron-back" size={18} color={palette.text} />
        </Press>
        <Text style={styles.yearLabel}>{year}</Text>
        <Press
          style={[styles.navButton, year >= currentMonth().year && { opacity: 0.35 }]}
          disabled={year >= currentMonth().year}
          onPress={() => setYear((value) => value + 1)}
        >
          <Ionicons name="chevron-forward" size={18} color={palette.text} />
        </Press>
      </View>

      {loading && <ActivityIndicator color={palette.accent} style={{ marginTop: 30 }} />}
      {error !== null && <Text style={styles.error}>{error}</Text>}

      {!loading && summary !== null && summary.days_worked === 0 && (
        <Text style={styles.lead}>За {year} год отмеченных смен нет — отсюда и рассказывать нечего.</Text>
      )}

      {!loading && summary !== null && summary.days_worked > 0 && facts !== null && (
        <>
          <View style={styles.tier}>
            <Text style={styles.tierEmoji}>{tier.emoji}</Text>
            <Text style={styles.tierName}>{tier.name}</Text>
            <Text style={styles.tierMeta}>
              {plural(facts.shifts, t('смена'), t('смены'), t('смен'))} · {Math.round(summary.hours)} ч · {money(summary.total_earned)}
            </Text>
          </View>

          <View style={styles.bigGrid}>
            <Big
              palette={palette}
              label={t("Заработано")}
              value={money(summary.total_earned)}
              hint={previous === null ? null : delta(summary.total_earned, previous.total_earned)}
              strong
            />
            <Big
              palette={palette}
              label={t("Часов")}
              value={`${Math.round(summary.hours)}`}
              hint={previous === null ? null : delta(summary.hours, previous.hours)}
            />
            <Big palette={palette} label={t("Смен")} value={`${facts.shifts}`} hint={null} />
            <Big
              palette={palette}
              label={t("В час")}
              value={money(summary.hours > 0 ? summary.total_earned / summary.hours : 0)}
              hint={null}
            />
          </View>


          <Section palette={palette} title={t("Месяц за месяцем")}>
            <MonthBars rows={months} palette={palette} />
          </Section>

          <Section palette={palette} title={t("Что запомнилось")}>
            {facts.best !== null && (
              <Fact palette={palette} emoji="🏆" title={t("Лучший день")}>
                {said(facts.best.date)} · {money(facts.best.earned)}
              </Fact>
            )}
            {facts.favourite !== null && (
              <Fact palette={palette} emoji="⭐️" title={t("Любимая смена")}>
                {facts.favourite[0]} · {plural(facts.favourite[1], t('раз'), t('раза'), t('раз'))}
              </Fact>
            )}
            {facts.busiest !== null && (
              <Fact palette={palette} emoji="📅" title={t("Чаще всего выходили")}>
                {WEEKDAYS[facts.busiest[0]]} · {plural(facts.busiest[1], t('раз'), t('раза'), t('раз'))}
              </Fact>
            )}
            {facts.place !== null && (
              <Fact palette={palette} emoji="🏠" title={t("Главное место")}>
                {/* Shifts with no place land in a synthetic bucket the totals
                    name in English; nothing here should read it out loud. */}
                {facts.place.location_id === 0 ? t('Без места') : facts.place.name} ·{' '}
                {money(facts.place.earned)}
              </Fact>
            )}
            <Fact palette={palette} emoji="🌙" title={t("Ночей")}>
              {facts.shifts > 0 ? Math.round((facts.nights / facts.shifts) * 100) : 0}% смен начинались
              после 20:00
            </Fact>
            <Fact palette={palette} emoji="🛌" title={t("Отдых")}>
              {plural(facts.daysOff, t('день'), t('дня'), t('дней'))} без смены
            </Fact>
            {summary.tips_earned > 0 && (
              <Fact palette={palette} emoji="🪙" title={t("Чаевые")}>
                {money(summary.tips_earned)} за год
              </Fact>
            )}
            {/* The line worth having is the date itself: almost nobody can name
                when they last got a raise, and everybody feels it. */}
            {(summary.raises ?? []).length > 0 && (
              <Fact palette={palette} emoji="📈" title={t("Ставка")}>
                {said(summary.raises![0].on)} · {money(summary.raises![0].before)} →{' '}
                {money(summary.raises![0].after)}
                {PERIOD_SUFFIX[summary.raises![0].period]} ·{' '}
                {plural(
                  Math.round(summary.raises![0].days_ago / 30),
                  t('месяц назад'),
                  t('месяца назад'),
                  t('месяцев назад'),
                )}
              </Fact>
            )}
          </Section>
        </>
      )}
    </ScrollView>
  );
}

/** "5 марта" — a day the way somebody would say it. */
function said(date: string): string {
  const months = [
    t('января'), t('февраля'), t('марта'), t('апреля'), t('мая'), t('июня'),
    t('июля'), t('августа'), t('сентября'), t('октября'), t('ноября'), t('декабря'),
  ];
  const [, month, day] = date.split('-');

  return `${Number(day)} ${months[Number(month) - 1]}`;
}

function Big({
  palette,
  label,
  value,
  hint,
  strong = false,
}: {
  palette: Palette;
  label: string;
  value: string;
  hint: string | null;
  strong?: boolean;
}) {
  const styles = makeStyles(palette);

  return (
    <View style={styles.big}>
      <Text style={styles.bigLabel}>{label}</Text>
      <Text style={[styles.bigValue, strong && { color: palette.good }]}>{value}</Text>
      {hint !== null && <Text style={styles.bigHint}>{hint}</Text>}
    </View>
  );
}

function Section({
  palette,
  title,
  children,
}: {
  palette: Palette;
  title: string;
  children: React.ReactNode;
}) {
  const styles = makeStyles(palette);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Fact({
  palette,
  emoji,
  title,
  children,
}: {
  palette: Palette;
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  const styles = makeStyles(palette);

  return (
    <View style={styles.fact}>
      <Text style={styles.factEmoji}>{emoji}</Text>
      <View style={styles.grow}>
        <Text style={styles.factTitle}>{title}</Text>
        <Text style={styles.factBody}>{children}</Text>
      </View>
    </View>
  );
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    content: { padding: 18, paddingBottom: 44, gap: 12 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: palette.text, fontSize: 26, fontWeight: '800' },
    grow: { flex: 1 },
    error: { color: palette.danger, fontSize: 13 },
    lead: { color: palette.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 12 },

    yearNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
    navButton: {
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    yearLabel: { color: palette.text, fontSize: 20, fontWeight: '800', minWidth: 72, textAlign: 'center' },

    tier: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accent,
      borderWidth: 1,
      borderRadius: 20,
      padding: 20,
      alignItems: 'center',
      gap: 4,
    },
    tierEmoji: { fontSize: 44 },
    tierName: { color: palette.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
    tierMeta: { color: palette.textSecondary, fontSize: 13, textAlign: 'center' },

    bigGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    big: {
      minWidth: '46%',
      flexGrow: 1,
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
    },
    bigLabel: { color: palette.textSecondary, fontSize: 12 },
    bigValue: { color: palette.text, fontSize: 22, fontWeight: '800', marginTop: 3 },
    bigHint: { color: palette.textSecondary, fontSize: 11, marginTop: 2 },

    section: { gap: 10, marginTop: 6 },
    sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '700' },

    fact: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: palette.backgroundElement,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    factEmoji: { fontSize: 22 },
    factTitle: { color: palette.textSecondary, fontSize: 12 },
    factBody: { color: palette.text, fontSize: 14.5, fontWeight: '600', marginTop: 2 },
  });
