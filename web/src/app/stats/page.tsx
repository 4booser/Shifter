'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import {
  addMonths,
  currentMonth,
  keysBetween,
  monthBounds,
  shiftDays,
  todayKey,
  fromKey,
} from '@/lib/calendar/calendar-date';
import { seasonalIndex, yearShape } from '@/lib/calendar/seasonality';
import { forecastFor, paceToGoal, projectionSeries } from '@/lib/calendar/forecast';
import { averagesFor } from '@/lib/calendar/insights';
import {
  CalendarDayData,
  DaysResponse,
  DeductionSplit,
  EMPTY_SUMMARY,
  ExpenseSplit,
  Goal,
  Raise,
  placeName,
} from '@/lib/calendar/models';
import { activeGoalFor, delta, earningsBuckets, median, weekdayTotals } from '@/lib/calendar/stats-math';
import { buildColumns, buildTicks, niceCeiling } from '@/lib/charts/math';
import { Sheet, buildXlsx, downloadBlob } from '@/lib/export/xlsx';
import { currentCardTheme, drawShareCard } from '@/lib/export/share-card';
import { drawStoryCard } from '@/lib/export/story-card';
import { useI18n } from '@/lib/i18n';
import { formatMoney, formatMoneyCompact, formatMoneyIn } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { Shell } from '@/components/layout/shell';
import { useReveal } from '@/lib/fx';
import { GoalsModal } from '@/components/dashboard/modals/goals-modal';
import { WhatIfCard } from '@/components/stats/what-if';
import { RhythmCard } from '@/components/stats/rhythm';
import { CitiesCard } from '@/components/stats/cities';
import { RecordsHealthCard } from '@/components/stats/records-health';
import { YearHeat } from '@/components/stats/year-heat';
import { TrophyShelf } from '@/components/stats/trophies';
import { hourDial, rateTrend, tipsByWeekday, waterfall, weekBands } from '@/lib/charts/report-math';
import { ClockRing, DaysAtGlance, MoneyFlow, MonthBars, RankBars, TipWeek, TrendLine, WeekBandsChart } from '@/components/charts/glass-charts';
import { AreaChart, ColumnChart, Plot, ProgressRing } from '@/components/charts/charts';
import { Alert, CountUp, Delta, Money } from '@/components/ui/bits';
import { FlowMoney } from '@/components/ui/flow';
import { Icon } from '@/components/ui/icon';

type PresetId = 'month' | 'previous' | '3m' | '6m' | 'year' | 'all' | 'custom';

const ALL_TIME = { from: '2000-01-01', to: '2099-12-31' };

/**
 * What a fine was for. 'unsaid' covers everything recorded before the reason
 * existed as well as everyone who did not bother — it is counted rather than
 * dropped so the split still adds up to the total above it.
 */
/** How the rate is quoted, printed after the two numbers. */
const PERIOD_SUFFIX: Record<Raise['period'], string> = {
  hour: '/hour',
  day: '/day',
  week: '/week',
  month: '/month',
};

/** What the work cost, as opposed to what the venue took off somebody. */
const EXPENSE_LABEL: Record<ExpenseSplit['kind'], string> = {
  transport: 'Getting there',
  uniform: 'Uniform',
  tools: 'Tools',
  food: 'Food at work',
  training: 'Training',
  other: 'Something else',
};

const REASON_LABEL: Record<DeductionSplit['reason'], string> = {
  shortfall: 'Till came up short',
  breakage: 'Breakage',
  late: 'Turned up late',
  waste: 'Waste',
  uniform: 'Uniform',
  other: 'Something else',
  unsaid: 'Not said',
};

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'previous', label: 'Last month' },
  { id: '3m', label: 'Last 3 months' },
  { id: '6m', label: 'Last 6 months' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
];

export default function StatsPage() {
  return (
    <Shell>
      <Stats />
    </Shell>
  );
}

function Stats() {
  const { t, n, lang } = useI18n();
  const revealHost = useReveal<HTMLDivElement>();
  const settings = useSettings((state) => state.settings);
  const formatWith = (code: string, amount: number) => formatMoneyIn(settings, code, amount);

  /**
   * A place with no currency set earns in whatever the app is set to, which
   * is the base — the same rule the server converts by. Falling back to the
   * first code in the list instead would label unplaced shifts in zloty
   * purely because Z sorts before U.
   */
  const currencyOf = (place: { currency: string }) =>
    place.currency.length === 3 ? place.currency : settings.baseCurrency;

  const [preset, setPreset] = useState<PresetId>(
    (PRESETS.some((entry) => entry.id === settings.statsPeriod) ? settings.statsPeriod : 'month') as PresetId,
  );
  const [customFrom, setCustomFrom] = useState(monthBounds(todayKey()).from);
  const [customTo, setCustomTo] = useState(monthBounds(todayKey()).to);
  const [summary, setSummary] = useState<DaysResponse>(EMPTY_SUMMARY);
  /** Three years back, for the shape of the year. Loaded once, read cheaply. */
  const [history, setHistory] = useState<CalendarDayData[]>([]);
  const [previous, setPrevious] = useState<DaysResponse>(EMPTY_SUMMARY);
  const [trendRaw, setTrendRaw] = useState<{ label: string; earned: number; planned: number; hours: number }[]>([]);
  const [trendParts, setTrendParts] = useState<{ label: string; shifts: number; sales: number; tips: number }[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => {
    const now = currentMonth();
    const first = `${now.year}-${`${now.month}`.padStart(2, '0')}-01`;
    const shift = (deltaMonths: number) => {
      const shifted = addMonths(now, deltaMonths);

      return `${shifted.year}-${`${shifted.month}`.padStart(2, '0')}-01`;
    };

    switch (preset) {
      case 'previous':
        return monthBounds(shift(-1));
      case '3m':
        return { from: monthBounds(shift(-2)).from, to: monthBounds(first).to };
      case '6m':
        return { from: monthBounds(shift(-5)).from, to: monthBounds(first).to };
      case 'year':
        return { from: `${now.year}-01-01`, to: `${now.year}-12-31` };
      case 'all':
        return ALL_TIME;
      case 'custom':
        return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom };
      default:
        return monthBounds(first);
    }
  }, [preset, customFrom, customTo]);

  const loadGoals = () => void calendarApi.goals().then(setGoals).catch(() => setGoals([]));

  useEffect(loadGoals, []);

  useEffect(() => {
    const from = `${Number(todayKey().slice(0, 4)) - 3}-01-01`;

    void calendarApi
      .days(from, todayKey())
      .then((range) => setHistory(range.days))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    const { from, to } = range;

    setError(null);

    void calendarApi
      // The base is asked for on this page alone: it is where somebody goes
      // to see a period as one number, and the conversion is what that means
      // when the period was earned in two currencies.
      .days(from, to, settings.baseCurrency)
      .then(setSummary)
      .catch((caught) => setError(apiErrorMessage(caught)));

    // The window immediately before, same length, so "vs previous" compares
    // like with like whatever the preset.
    const span = keysBetween(from, to).length;
    const previousTo = shiftDays(from, -1);

    void calendarApi
      .days(shiftDays(previousTo, -(span - 1)), previousTo)
      .then(setPrevious)
      .catch(() => setPrevious(EMPTY_SUMMARY));
  }, [range]);

  // Twelve months ending with this one, one request per month: overtime and
  // period wages are computed per range and would smear across boundaries.
  useEffect(() => {
    const anchor = currentMonth();
    const months = Array.from({ length: 12 }, (_, index) => addMonths(anchor, index - 11));
    const monthLabel = (month: { year: number; month: number }) =>
      new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(month.year, month.month - 1, 1));

    void Promise.all(
      months.map((month) => {
        const { from, to } = monthBounds(`${month.year}-${`${month.month}`.padStart(2, '0')}-01`);

        return calendarApi.days(from, to);
      }),
    )
      .then((responses) => {
        setTrendRaw(
          responses.map((response, index) => ({
            label: monthLabel(months[index]),
            earned: response.total_earned,
            planned: response.planned_earned,
            hours: response.hours,
          })),
        );
        setTrendParts(
          responses.map((response, index) => ({
            label: monthLabel(months[index]),
            shifts:
              response.shifts_earned
              + response.period_earned
              + response.overtime_earned
              + response.premium_earned,
            sales: response.sales_earned,
            tips: response.tips_earned,
          })),
        );
      })
      .catch(() => {
        setTrendRaw([]);
        setTrendParts([]);
      });
  }, [lang]);

  // ==== Derived ====

  const averages = averagesFor(summary);
  const beforeAverages = averagesFor(previous);

  const active = preset === 'all' ? null : activeGoalFor(goals, range.from, range.to);
  const goalProgress =
    active === null
      ? null
      : {
          target: active.target,
          note: active.goal.note,
          percent: Math.min(100, (summary.total_earned / active.target) * 100),
          remaining: Math.max(0, active.target - summary.total_earned),
          reached: summary.total_earned >= active.target,
        };

  // Leave and sickness are days the person is not available, not days they
  // failed to earn — the forecast is told so explicitly.
  const awayDays = useMemo(() => {
    const away = new Set<string>();

    for (const event of summary.events) {
      if (event.kind !== 'vacation' && event.kind !== 'sick') continue;

      for (const key of keysBetween(event.start_date, event.end_date)) away.add(key);
    }

    return away;
  }, [summary.events]);

  // The month's own history, where there is enough of it. Two years of a
  // December is the difference between a forecast and a flat line, and it is
  // the one thing a second year of records is actually for.
  const season = useMemo(() => {
    if (!range.from.startsWith(range.to.slice(0, 4))) return null;

    return seasonalIndex(yearShape(history, todayKey()), Number(range.from.slice(5, 7)));
  }, [history, range]);

  const forecast = forecastFor(summary.days, range.from, range.to, awayDays, season);
  const waterfallSteps = useMemo(() => waterfall(summary), [summary]);
  const bands = useMemo(() => weekBands(summary.days), [summary.days]);
  const tipWeek = useMemo(() => tipsByWeekday(summary.days), [summary.days]);
  const dial = useMemo(() => hourDial(summary.days), [summary.days]);
  const rate = useMemo(
    () =>
      rateTrend(summary.days).map((point) => ({
        label: `${point.week.slice(8)}.${point.week.slice(5, 7)}`,
        value: point.perHour,
        hours: point.hours,
      })),
    [summary.days],
  );
  const dialTotal = dial.reduce((sum, value) => sum + value, 0);
  const pace = paceToGoal(forecast, active?.target ?? null);

  const cumulative = useMemo(() => {
    const byDate = new Map(summary.days.map((day) => [day.date, day.earned]));
    const keys = keysBetween(range.from, range.to);
    let running = 0;

    // Beyond a quarter, daily points on the full axis stop reading.
    if (keys.length > 120) {
      return [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => ({ label: key.slice(5), value: (running += value) }));
    }

    return keys.map((key) => ({ label: key.slice(8), value: (running += byDate.get(key) ?? 0) }));
  }, [summary.days, range]);

  const cumulativePrevious = useMemo(() => {
    const days = [...previous.days].sort((a, b) => a.date.localeCompare(b.date));

    if (days.length < 2) return [];

    let running = 0;

    return days.map((day) => ({ label: day.date.slice(5), value: (running += day.earned) }));
  }, [previous.days]);

  const projection = forecast.live ? projectionSeries(summary.days, range.from, range.to, forecast) : [];

  const buckets = earningsBuckets(summary, range.from, range.to);
  const earningsColumns = buildColumns(buckets.data);
  const earningsTicks = buildTicks(buckets.data);
  const trendColumns = buildColumns(trendRaw, 34);
  const trendTicks = buildTicks(trendRaw);

  const weekdays = weekdayTotals(summary.days);

  const heatValues = useMemo(() => new Map(summary.days.map((day) => [day.date, day.earned])), [summary.days]);

  const dayMedian = median(summary.days.map((day) => day.earned).filter((value) => value > 0));

  const bestDay = useMemo(() => {
    if (summary.days.length === 0) return null;

    const best = summary.days.reduce((top, day) => (day.earned > top.earned ? day : top));

    return best.earned > 0 ? best : null;
  }, [summary.days]);

  /** Sources ranked, and the same five as shares of one whole. */
  const sources = [
    // The percentage comes out of the shifts figure it already sits inside:
    // hidden there it cannot be seen to be working, which is the whole reason
    // somebody agreed to it.
    { name: 'Shifts', value: summary.shifts_earned - summary.revenue_earned },
    { name: 'Percentage', value: summary.revenue_earned },
    { name: 'Overtime', value: summary.overtime_earned },
    { name: 'Premiums', value: summary.premium_earned },
    { name: 'Salary', value: summary.period_earned },
    { name: 'Sales', value: summary.sales_earned },
    { name: 'Tips', value: summary.tips_earned },
  ].filter((row) => row.value > 0);
  const sourceTotal = sources.reduce((sum, row) => sum + row.value, 0);
  const SOURCE_TINTS = [
    'var(--s1)',
    'var(--s2)',
    'var(--s3)',
    'var(--s4)',
    'var(--s5)',
    'var(--accent)',
    'var(--warn)',
  ];

  const mixMax = niceCeiling(Math.max(1, ...trendParts.map((month) => month.shifts + month.sales + month.tips)));

  const tipsSplit = useMemo(() => {
    let cash = 0;
    let total = 0;

    for (const day of summary.days) {
      total += day.tips ?? 0;
      cash += day.tips_cash ?? 0;
    }

    if (total <= 0) return null;

    const card = Math.max(0, total - cash);

    return { cash, card, total, cashShare: (cash / total) * 100 };
  }, [summary.days]);

  const topShifts = useMemo(() => {
    const totals = new Map<string, { name: string; value: number; hours: number }>();

    for (const day of summary.days) {
      for (const entry of day.shifts) {
        if (!entry.worked) continue;

        const bucket = totals.get(entry.name) ?? { name: entry.name, value: 0, hours: 0 };

        bucket.value += entry.earned;
        bucket.hours += entry.hours;
        totals.set(entry.name, bucket);
      }
    }

    const rows = [...totals.values()].sort((a, b) => b.value - a.value || b.hours - a.hours).slice(0, 6);
    const anyPaid = rows.some((row) => row.value > 0);
    const top = Math.max(1, ...rows.map((row) => (anyPaid && row.value > 0 ? row.value : 0)));
    const topHours = Math.max(1, ...rows.map((row) => row.hours));

    // A per-period wage earns nothing per shift; its hours carry the bar.
    return rows.map((row) => ({
      ...row,
      byPeriod: row.value === 0 && row.hours > 0,
      share: row.value > 0 ? (row.value / top) * 100 : (row.hours / topHours) * 100,
    }));
  }, [summary.days]);

  const byStartHour = useMemo(() => {
    const totals = new Map<number, { earned: number; count: number }>();

    for (const day of summary.days) {
      for (const entry of day.shifts) {
        if (!entry.worked) continue;

        const hour = Number(entry.start_time.slice(0, 2));

        if (Number.isNaN(hour)) continue;

        const bucket = totals.get(hour) ?? { earned: 0, count: 0 };

        bucket.earned += entry.earned;
        bucket.count += 1;
        totals.set(hour, bucket);
      }
    }

    if (totals.size < 2) return [];

    const rows = [...totals.entries()].map(([hour, bucket]) => ({ hour, ...bucket })).sort((a, b) => a.hour - b.hour);
    const raw = Math.max(1, ...rows.map((row) => row.earned));
    const top = niceCeiling(raw);

    return rows.map((row) => ({
      ...row,
      label: `${`${row.hour}`.padStart(2, '0')}:00`,
      height: Math.max(2, (row.earned / top) * 100),
      best: row.earned === raw,
      max: top,
    }));
  }, [summary.days]);

  const comparison = summary.by_location.length >= 2 ? summary.by_location : null;

  // The travel column only appears once somebody has said how far a place is.
  // An empty column reads as "the journey is nothing", which is the exact
  // wrong answer.
  const anyCommute = (comparison ?? []).some((place) => place.commute != null);

  // ==== Exports ====

  const exportPng = () => {
    setExporting(true);

    drawShareCard(
      {
        title: t('Statistics'),
        period: `${range.from} — ${range.to}`,
        summary,
        format: (value) => formatMoney(settings, value),
        labels: {
          earned: t('Earned'),
          net: t('After tax'),
          hours: t('Hours'),
          days: t('Days worked'),
          perHour: t('Average hourly'),
          byDay: t('By day'),
          shifts: t('Shifts'),
          salary: t('Salary'),
          sales: t('Sales'),
          tips: t('Tips'),
          overtime: t('Overtime hours'),
          planned: t('Still planned'),
          places: t('Places'),
          worked: t('Worked'),
        },
      },
      currentCardTheme(),
    )
      .then((blob) => downloadBlob(`shifter-${range.from}.png`, blob))
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setExporting(false));
  };

  /** The same period, shaped for a phone screen and a feed. */
  const exportStory = () => {
    setExporting(true);

    const byWeekday = new Array(7).fill(0) as number[];

    for (const day of summary.days) {
      byWeekday[(fromKey(day.date).getDay() + 6) % 7] += day.earned;
    }

    const peak = Math.max(1, ...byWeekday);
    const best = [...summary.days].sort((a, b) => b.earned - a.earned)[0];
    const lines = [
      averages.perHour > 0 ? `${t('Per hour')}: ${formatMoney(settings, averages.perHour)}` : null,
      best !== undefined && best.earned > 0
        ? `${t('Best day')}: ${formatMoney(settings, best.earned)}`
        : null,
      summary.tips_earned > 0 ? `${t('Tips')}: ${formatMoney(settings, summary.tips_earned)}` : null,
      // Never fewer than three: a card with a hole in it reads as broken.
      `${t('Days worked')}: ${summary.days_worked}`,
      summary.hours > 0 ? `${t('Hours')}: ${Math.round(summary.hours)}` : null,
    ].filter((line): line is string => line !== null);

    void drawStoryCard(
      {
        period: preset === 'month' ? new Intl.DateTimeFormat(lang, { month: 'long' }).format(fromKey(range.from)) : `${range.from.slice(8)}.${range.from.slice(5, 7)} — ${range.to.slice(8)}.${range.to.slice(5, 7)}`,
        earned: formatMoney(settings, summary.total_earned),
        meta: `${n(summary.days_worked, 'shifts')} · ${n(Math.round(summary.hours), 'hours')}`,
        lines,
        rhythm: byWeekday.map((value) => value / peak),
        brand: 'shifter.ink',
      },
      currentCardTheme(),
    )
      .then((blob) => downloadBlob(`shifter-story-${range.from}.png`, blob))
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setExporting(false));
  };

  const exportXlsx = () => {
    const overview: Sheet = {
      name: t('Statistics').slice(0, 28),
      rows: [
        [t('Period'), `${range.from} — ${range.to}`],
        [t('Earned'), summary.total_earned],
        [t('Still planned'), summary.planned_earned],
        [t('Hours'), summary.hours],
        [t('Overtime'), summary.overtime_earned],
        [t('Premiums'), summary.premium_earned],
        [t('Percentage'), summary.revenue_earned],
        [t('Salary'), summary.period_earned],
        [t('Sales'), summary.sales_earned],
        [t('Tips'), summary.tips_earned],
        [t('Tip-out'), summary.tip_out],
        [t('Days worked'), summary.days_worked],
        [t('Paid'), summary.paid],
        [t('Difference'), summary.difference],
        [t('Projected by period end'), forecast.projected],
      ],
    };

    const days: Sheet = {
      name: t('By day').slice(0, 28),
      rows: [
        [t('Period'), t('Shifts'), t('Hours'), t('Worked'), t('Sales'), t('Tips'), t('Earned'), t('Still planned'), t('Note')],
        ...summary.days.map((day) => [
          day.date,
          day.shifts.map((entry) => entry.name).join(' + '),
          day.shifts.reduce((total, entry) => total + entry.hours, 0),
          day.shifts.every((entry) => entry.worked) ? 'yes' : 'partly',
          day.sales.reduce((total, entry) => total + entry.earned, 0),
          day.tips ?? 0,
          day.earned,
          day.planned,
          day.note ?? '',
        ]),
      ],
    };

    const places: Sheet = {
      name: t('By place of work').slice(0, 28),
      rows: [
        [t('Place of work'), t('Days worked'), t('Hours'), t('Earned'), t('Tips'), t('Sales'), t('Tip-out'), t('Per hour')],
        ...summary.by_location.map((place) => [
          placeName(place, t('No place set')),
          place.days_worked,
          place.hours,
          place.earned,
          place.tips,
          place.sales,
          place.tip_out,
          place.per_hour,
        ]),
      ],
    };

    downloadBlob(`shifter-${range.from}-${range.to}.xlsx`, buildXlsx([overview, days, places]));
  };

  return (
    <div ref={revealHost} className="flex flex-col gap-4">
      {/* ==== Range picker + exports ==== */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-[1.3rem] font-bold tracking-tight">{t('Statistics')}</h1>
        <div className="seg flex-wrap">
          {PRESETS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`seg-btn ${preset === entry.id ? 'is-active' : ''}`}
              onClick={() => setPreset(entry.id)}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
        <input
          type="date"
          aria-label={t('From')}
          className="field-input !w-36"
          value={customFrom}
          onChange={(event) => {
            setCustomFrom(event.target.value);
            setPreset('custom');
          }}
        />
        <input
          type="date"
          aria-label={t('To')}
          className="field-input !w-36"
          value={customTo}
          onChange={(event) => {
            setCustomTo(event.target.value);
            setPreset('custom');
          }}
        />
        <span className="ml-auto flex gap-1.5">
          <Link href="/report" className="btn btn-sm">
            <Icon name="note" size={13} />
            {t('Report')}
          </Link>
          <Link href="/compare" className="btn btn-sm">
            <Icon name="swap" size={13} />
            {t('Compare')}
          </Link>
          <button type="button" className="btn btn-sm" disabled={exporting} onClick={exportPng}>
            <Icon name="download" size={13} />
            PNG
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={exporting}
            title={t('A 9:16 card for stories')}
            onClick={exportStory}
          >
            📱 {t('Story')}
          </button>
          <button type="button" className="btn btn-sm" onClick={exportXlsx}>
            <Icon name="download" size={13} />
            XLSX
          </button>
        </span>
      </div>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {/* ==== KPI row ==== */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {/* Where the range mixes currencies the plain sum is hryvnia and
            zloty added together as if they were the same money, so the
            converted figure is the only honest headline. */}
        <Kpi label={t('Earned')} delta={summary.conversion === null ? delta(summary.total_earned, previous.total_earned) : null}>
          {summary.conversion === null ? (
            <CountUp value={summary.total_earned} className="text-[1.25rem] font-bold text-good" />
          ) : (
            <span className="text-[1.25rem] font-bold text-good tabular">
              ≈ {formatWith(summary.conversion.base_currency, summary.conversion.total_earned)}
            </span>
          )}
        </Kpi>
        <Kpi label={t('Hours')} delta={delta(summary.hours, previous.hours)}>
          <CountUp value={summary.hours} format={(value) => `${Math.round(value)}`} className="text-[1.25rem] font-bold" />
        </Kpi>
        <Kpi label={t('Per working day')} delta={delta(averages.perDay, beforeAverages.perDay)}>
          <FlowMoney value={averages.perDay} className="text-[1.25rem] font-bold" />
        </Kpi>
        <Kpi label={t('Per hour')} delta={delta(averages.perHour, beforeAverages.perHour)}>
          <FlowMoney value={averages.perHour} className="text-[1.25rem] font-bold" />
        </Kpi>
        <Kpi label={t('Median day')} delta={null}>
          <FlowMoney value={dayMedian} className="text-[1.25rem] font-bold" />
        </Kpi>
        <Kpi label={t('Days worked')} delta={delta(summary.days_worked, previous.days_worked)}>
          <span className="text-[1.25rem] font-bold tabular">{summary.days_worked}</span>
        </Kpi>
      </div>

      {/* ==== Goal + cumulative ==== */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          title={t('Earned over the period')}
          hint={
            forecast.live
              ? forecast.seasonal === null
                ? `${t('Projected by period end')}: ${formatMoney(settings, forecast.projected)}`
                // Both, because they disagree for a reason worth reading.
                : `${t('Projected by period end')}: ${formatMoney(settings, forecast.projected)}`
                  + ` · ${t('with the season')}: ${formatMoney(settings, forecast.seasonal)}`
              : undefined
          }
        >
          <AreaChart points={cumulative} projection={projection} comparison={cumulativePrevious} goal={active?.target ?? null} />
          <p className="field-hint mt-1 flex flex-wrap gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-(--accent)" /> {t('This period')}
            </span>
            {cumulativePrevious.length > 1 && (
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-faint" /> {t('Previous period')}
              </span>
            )}
            {active !== null && (
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-good" /> {t('Goal')}
              </span>
            )}
          </p>
        </Card>

        <Card
          title={t('Goal')}
          action={
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setGoalsOpen(true)}>
              <Icon name="target" size={13} />
              {t('Edit')}
            </button>
          }
        >
          {goalProgress === null ? (
            <p className="field-hint">{t('Set an amount to aim for and the period fills this meter.')}</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative">
                <ProgressRing percent={goalProgress.percent} />
                <span className="absolute inset-0 grid place-items-center text-[1.05rem] font-bold tabular">
                  {Math.round(goalProgress.percent)}%
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[0.9rem]">
                  <Money value={summary.total_earned} className="font-bold" /> / <Money value={goalProgress.target} />
                </p>
                {goalProgress.reached ? (
                  <p className="text-[0.85rem] font-semibold text-good">{t('Reached')} 🎉</p>
                ) : (
                  <p className="field-hint">
                    <Money value={goalProgress.remaining} /> {t('to go')}
                    {pace !== null && !pace.ahead && (
                      <span className="block text-warn">
                        {t('Needs')} <Money value={pace.perDay} /> {t('a day from here')}
                      </span>
                    )}
                  </p>
                )}
                {goalProgress.note && <p className="field-hint">«{goalProgress.note}»</p>}
              </div>
            </div>
          )}
        </Card>
      </div>

      <WhatIfCard suggestedTarget={active?.target ?? null} />

      <RhythmCard />

      <YearHeat />

      <CitiesCard />

      <TrophyShelf />

      <RecordsHealthCard />

      {/* ==== Earnings + twelve months ==== */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title={t(buckets.grain === 'day' ? 'By day' : buckets.grain === 'week' ? 'By week' : 'By month')}>
          <ColumnChart columns={earningsColumns} ticks={earningsTicks} labelEvery={buckets.data.length > 14 ? 7 : 1} />
        </Card>
        <Card title={t('Twelve months')} hint={t('Is this month normal?')}>
          <MonthBars
            rows={trendRaw.map((month, index) => ({
              label: month.label,
              value: month.earned,
              current: index === trendRaw.length - 1,
            }))}
          />
        </Card>
      </div>

      {/* ==== Mix + sources ==== */}
      <div className="grid gap-3 lg:grid-cols-2">
        {trendParts.filter((month) => month.shifts + month.sales + month.tips > 0).length >= 3 && (
          <Card title={t('What each month was made of')}>
            <Plot max={mixMax} height="11rem">
              {trendParts.filter((month) => month.shifts + month.sales + month.tips > 0).map((month) => {
                const total = month.shifts + month.sales + month.tips;
                const parts = [
                  { value: month.shifts, colour: 'var(--s1)' },
                  { value: month.sales, colour: 'var(--s2)' },
                  { value: month.tips, colour: 'var(--s3)' },
                ].filter((part) => part.value > 0);

                return (
                  <div key={month.label} className="group relative flex h-full flex-1 flex-col justify-end" title={`${month.label}: ${formatMoney(settings, total)}`}>
                    <div
                      className="grow-y flex flex-col-reverse gap-[2px] overflow-hidden rounded-t"
                      style={{ height: `${(total / mixMax) * 100}%` }}
                    >
                      {parts.map((part, index) => (
                        <span key={index} style={{ background: part.colour, height: `${total > 0 ? (part.value / total) * 100 : 0}%` }} />
                      ))}
                    </div>
                    <span className="mt-0.5 text-center text-[0.62rem] text-faint">{month.label}</span>
                  </div>
                );
              })}
            </Plot>
            <p className="field-hint mt-1.5 flex gap-3">
              {[
                { name: t('Shifts'), colour: 'var(--s1)' },
                { name: t('Sales'), colour: 'var(--s2)' },
                { name: t('Tips'), colour: 'var(--s3)' },
              ].map((entry) => (
                <span key={entry.name} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: entry.colour }} />
                  {entry.name}
                </span>
              ))}
            </p>
          </Card>
        )}

        {summary.raises.length > 0 && (
          <Card
            title={t('When the rate moved')}
            hint={t('Read out of the shifts themselves, so it is money that actually changed hands.')}
          >
            {/* The headline is the part nobody can name off the top of their
                head and everybody feels: how long it has been. */}
            <p className="text-[1.6rem] font-extrabold tracking-tight">
              {n(Math.round(summary.raises[0].days_ago / 30), 'months')}
            </p>
            <p className="field-hint">{t('since the last change')}</p>

            <ul className="mt-2.5 flex flex-col gap-1.5">
              {summary.raises.slice(0, 6).map((raise) => (
                <li
                  key={`${raise.shift_id}-${raise.on}`}
                  className="flex flex-wrap items-baseline gap-x-2 border-t border-border pt-1.5 text-[0.85rem]"
                >
                  <span className="tabular text-muted">{raise.on}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {raise.location_name ?? raise.shift_name}
                  </span>
                  <span className="tabular">
                    <Money value={raise.before} /> → <Money value={raise.after} />
                    <span className="text-muted">{t(PERIOD_SUFFIX[raise.period])}</span>
                  </span>
                  <span
                    className={`tabular w-full text-right text-[0.78rem] ${
                      raise.worth_since < 0 ? 'text-danger' : 'text-good'
                    }`}
                  >
                    {raise.worth_since < 0 ? '−' : '+'}
                    <Money value={Math.abs(raise.worth_since)} /> {t('since then')}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {summary.conversion !== null && (
          <Card
            title={t('All of it in one currency')}
            hint={t('At the National Bank’s published rate, so you can check it against your own.')}
          >
            <p className="text-[1.6rem] font-extrabold tracking-tight text-good">
              ≈ {formatWith(summary.conversion.base_currency, summary.conversion.total_earned)}
            </p>
            {summary.conversion.net_earned !== summary.conversion.total_earned && (
              <p className="field-hint">
                {t('On hand')} ≈ {formatWith(summary.conversion.base_currency, summary.conversion.net_earned)}
              </p>
            )}

            <ul className="mt-2.5 flex flex-col gap-1">
              {summary.conversion.by_location.map((place) => (
                <li
                  key={place.location_id}
                  className="flex items-baseline justify-between gap-2 text-[0.86rem]"
                >
                  <span className="text-muted">
                    {placeName(place, t('No place set'))}
                    <span className="ml-1.5 text-faint">{place.currency}</span>
                  </span>
                  <span className="tabular">
                    {formatWith(place.currency, place.earned)}
                    {place.currency !== summary.conversion!.base_currency && (
                      <span className="ml-1.5 font-bold">
                        {place.converted === null
                          ? `→ ${t('no rate')}`
                          : `≈ ${formatWith(summary.conversion!.base_currency, place.converted)}`}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <ul className="field-hint mt-2.5 flex flex-col gap-0.5 tabular">
              {summary.conversion.rates.map((rate) => (
                <li key={rate.code}>
                  1 {rate.code} = {rate.rate} UAH · {t('official')} {rate.on}
                  {/* The rate somebody is actually handed, named as such. The
                      totals above are the official ones and stay that way —
                      a figure that changed source without saying so would be
                      worse than one that is merely approximate. */}
                  {rate.market !== null && (
                    <span className="ml-2 text-muted">
                      · {t('a bank buys at')} {rate.market}
                      {rate.market_on !== null && ` · ${rate.market_on}`}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {summary.conversion.unconverted.length > 0 && (
              <p className="mt-1 text-[0.82rem] text-warn">
                {t('No rate for')} {summary.conversion.unconverted.join(', ')} —{' '}
                {t('that money is not in the total above.')}
              </p>
            )}
          </Card>
        )}

      </div>

      {/* ==== Waterfall + punchcard ==== */}
      <div className="grid gap-3 lg:grid-cols-2">
        {waterfallSteps.length > 0 && (
          <Card title={t('How the money assembled')} hint={t('Every source in one bar; the cuts hang under it.')}>
            <MoneyFlow steps={waterfallSteps} />
            {(summary.tip_out > 0 || summary.deductions > 0 || summary.tax > 0) && (
              <dl className="mt-3 flex flex-col gap-1 border-t border-border pt-2 text-[0.85rem]">
                {summary.tip_out > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">{t('Tip-out')}</dt>
                    <dd className="text-danger">−<Money value={summary.tip_out} /></dd>
                  </div>
                )}
                {summary.deductions > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">{t('Meals and fines')}</dt>
                    <dd className="text-danger">−<Money value={summary.deductions} /></dd>
                  </div>
                )}
                {/* What the fines were actually for. The total above says how
                    much; only this says whether it is worth a conversation. */}
                {summary.deductions_by_reason.map((split) => (
                  <div key={split.reason} className="flex justify-between pl-3">
                    <dt className="text-muted text-[0.8rem]">
                      {t(REASON_LABEL[split.reason])}
                      {split.days > 1 && <span className="text-muted"> · {n(split.days, 'days')}</span>}
                    </dt>
                    <dd className="text-muted text-[0.8rem] tabular">
                      −<Money value={split.amount} />
                    </dd>
                  </div>
                ))}
                {summary.tax > 0 && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-muted">{t('Tax withheld')}</dt>
                      <dd className="text-danger">−<Money value={summary.tax} /></dd>
                    </div>
                    <div className="flex justify-between font-bold">
                      <dt>{t('Take-home')}</dt>
                      <dd><Money value={summary.net_earned} /></dd>
                    </div>
                  </>
                )}

                {/* Below the take-home line on purpose: this money left after
                    the wage arrived, and folding it in would stop the app
                    agreeing with anybody's payslip. */}
                {summary.expenses > 0 && (
                  <div className="mt-1 border-t border-border pt-1.5">
                    <div className="flex justify-between">
                      <dt className="text-muted">{t('And the work cost you')}</dt>
                      <dd className="text-muted">−<Money value={summary.expenses} /></dd>
                    </div>
                    {summary.expenses_by_kind.map((split) => (
                      <div key={split.kind} className="flex justify-between pl-3">
                        <dt className="text-muted text-[0.8rem]">{t(EXPENSE_LABEL[split.kind])}</dt>
                        <dd className="text-muted text-[0.8rem] tabular">
                          −<Money value={split.amount} />
                        </dd>
                      </div>
                    ))}
                    {summary.travel_share_of_tips !== null && (
                      <p className="field-hint mt-1">
                        {t('The taxi home ate')} {summary.travel_share_of_tips}%{' '}
                        {t('of your tips')}
                      </p>
                    )}
                  </div>
                )}
              </dl>
            )}
          </Card>
        )}
        {bands.length > 0 && (
          <Card title={t('The shape of your week')} hint={t('When each weekday starts and ends, and what its hour pays.')}>
            <WeekBandsChart bands={bands} />
          </Card>
        )}
      </div>

      {/* ==== Clock face + rate trend ==== */}
      {(dialTotal > 0 || rate.length > 1) && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {dialTotal > 0 && (
            <Card title={t('Around the clock')} hint={t('Midnight on top; the brighter the hour, the more it brings.')}>
              <ClockRing hours={dial} />
            </Card>
          )}
          {rate.length > 1 && (
            <Card title={t('Your hour, week by week')} hint={t('Where a raise — or a quiet cut — shows up first.')}>
              <TrendLine points={rate} />
            </Card>
          )}
        </div>
      )}

      {/* ==== Heatmap ==== */}

      {/* ==== What feeds the month: days and shifts side by side ==== */}
      <Card title={t('What feeds the month')} hint={t('The same money twice: by weekday and by shift.')}>
        <div className="grid gap-4 md:grid-cols-2">
          <RankBars
            rows={weekdays.map((day) => ({ name: t(day.name), value: day.value }))}
            format={(value) => formatMoneyCompact(settings, value)}
          />
          {topShifts.length > 0 && (
            <RankBars
              rows={topShifts.map((row) => ({
                name: row.name,
                value: row.value,
                caption: `${Math.round(row.hours)}h`,
              }))}
              format={(value) => formatMoneyCompact(settings, value)}
            />
          )}
        </div>
      </Card>

      {/* ==== Tips split + best day + overtime ==== */}
      <div className="grid gap-3 md:grid-cols-3">
        {tipsSplit !== null && (
          <Card title={t('Tips: cash against card')}>
            <div className="mb-2 flex h-4 gap-[2px] overflow-hidden rounded-full">
              <span style={{ width: `${tipsSplit.cashShare}%`, background: 'var(--s3)' }} title={t('Cash')} />
              <span style={{ width: `${100 - tipsSplit.cashShare}%`, background: 'var(--s1)' }} title={t('Card')} />
            </div>
            <p className="flex justify-between text-[0.85rem]">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: 'var(--s3)' }} />
                {t('Cash')} <Money value={tipsSplit.cash} className="font-semibold" />
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: 'var(--s1)' }} />
                {t('Card')} <Money value={tipsSplit.card} className="font-semibold" />
              </span>
            </p>
          </Card>
        )}

        {bestDay !== null && (
          <Card title={t('Best day')}>
            <p className="text-[1.3rem] font-bold text-good">
              <Money value={bestDay.earned} />
            </p>
            <p className="field-hint capitalize">
              {new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(
                new Date(`${bestDay.date}T00:00:00`),
              )}
            </p>
          </Card>
        )}

        {summary.revenue_earned > 0 && (
          <Card title={t('Percentage')}>
            <p className="text-[1.5rem] font-extrabold text-good">
              +<Money value={summary.revenue_earned} />
            </p>
            <p className="field-hint">
              {t('from takings of')} <Money value={summary.revenue_counted} />
            </p>
          </Card>
        )}

        {summary.premium_earned > 0 && (
          <Card title={t('Premiums')}>
            <p className="text-[1.3rem] font-bold text-good">
              +<Money value={summary.premium_earned} />
            </p>
            <p className="field-hint">
              {summary.night_hours > 0
                ? `${Math.round(summary.night_hours * 10) / 10} ${t('night hours and public holidays')}`
                : t('public holidays')}
            </p>
          </Card>
        )}

        {summary.overtime_hours > 0 && (
          <Card title={t('Overtime')}>
            <p className="text-[1.3rem] font-bold">
              +<Money value={summary.overtime_earned} />
            </p>
            <p className="field-hint">
              {Math.round(summary.overtime_hours * 10) / 10} {t('hours past the weekly threshold')}
            </p>
          </Card>
        )}
      </div>

      {/* ==== Places ==== */}
      {comparison !== null && (
        <Card
          title={t('Places side by side')}
          hint={t(
            anyCommute
              ? 'Which hour is worth more once the journey counts — the question behind holding two jobs.'
              : 'Which hour is worth more — the question behind holding two jobs.',
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[0.85rem]">
              <thead className="text-left text-muted">
                <tr>
                  {[t('Place of work'), t('Days worked'), t('Hours'), t('Earned'), t('Tips'), t('Per hour')].map((column) => (
                    <th key={column} className="px-2 py-1.5 font-medium">
                      {column}
                    </th>
                  ))}
                  {/* Only where somebody has actually said how far a place is.
                      An empty column would read as "the journey is nothing". */}
                  {anyCommute && (
                    <th className="px-2 py-1.5 font-medium">{t('Per hour with travel')}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...comparison]
                  .sort((a, b) => b.per_hour - a.per_hour)
                  .map((place) => (
                    <tr key={place.location_id} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: place.colour }} />
                        {placeName(place, t('No place set'))}
                        {place.days_worked > 0 && place.days_worked < 3 && (
                          <span className="chip ml-1.5 border-warn/40 text-warn">{t('few shifts')}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 tabular">{place.days_worked}</td>
                      <td className="px-2 py-1.5 tabular">{Math.round(place.hours * 10) / 10}</td>
                      {/* Where the range mixes currencies, each place is
                          labelled with its own: printing zloty with a hryvnia
                          mark makes the comparison this table exists for a
                          lie. */}
                      {summary.currencies.length > 1 ? (
                        <>
                          <td className="px-2 py-1.5 tabular">{formatWith(currencyOf(place), place.earned)}</td>
                          <td className="px-2 py-1.5 tabular">{formatWith(currencyOf(place), place.tips)}</td>
                          <td className="px-2 py-1.5 font-semibold tabular">{formatWith(currencyOf(place), place.per_hour)}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-1.5"><Money value={place.earned} /></td>
                          <td className="px-2 py-1.5"><Money value={place.tips} /></td>
                          <td className="px-2 py-1.5 font-semibold"><Money value={place.per_hour} /></td>
                        </>
                      )}
                      {anyCommute && (
                        <td className="px-2 py-1.5 tabular">
                          {place.commute == null ? (
                            <span className="text-muted">—</span>
                          ) : summary.currencies.length > 1 ? (
                            formatWith(currencyOf(place), place.commute.per_hour_with_travel)
                          ) : (
                            <Money value={place.commute.per_hour_with_travel} />
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <GoalsModal open={goalsOpen} onClose={() => setGoalsOpen(false)} onSaved={loadGoals} />
    </div>
  );
}

function Kpi({ label, delta: change, children }: { label: string; delta: number | null; children: React.ReactNode }) {
  return (
    <div className="card reveal lift glow p-3">
      <span className="field-hint block">{label}</span>
      <span className="flex items-baseline gap-2">
        {children}
        <Delta percent={change} />
      </span>
    </div>
  );
}

function Card({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card reveal p-4">
      <header className="mb-2.5 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[0.98rem] font-bold">{title}</h2>
          {hint && <p className="field-hint">{hint}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
