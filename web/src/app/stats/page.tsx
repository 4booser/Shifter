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
import { forecastFor, paceToGoal, projectionSeries } from '@/lib/calendar/forecast';
import { averagesFor } from '@/lib/calendar/insights';
import { DaysResponse, EMPTY_SUMMARY, Goal } from '@/lib/calendar/models';
import { activeGoalFor, delta, earningsBuckets, median, weekdayTotals } from '@/lib/calendar/stats-math';
import { buildColumns, buildTicks, niceCeiling } from '@/lib/charts/math';
import { Sheet, buildXlsx, downloadBlob } from '@/lib/export/xlsx';
import { currentCardTheme, drawShareCard } from '@/lib/export/share-card';
import { drawStoryCard } from '@/lib/export/story-card';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/settings/money';
import { useSettings } from '@/lib/settings/store';
import { Shell } from '@/components/layout/shell';
import { useReveal } from '@/lib/fx';
import { GoalsModal } from '@/components/dashboard/modals/goals-modal';
import { WhatIfCard } from '@/components/stats/what-if';
import { hourDial, rateTrend, tipsByWeekday, waterfall, weekBands } from '@/lib/charts/report-math';
import { ClockRing, DaysAtGlance, MoneyFlow, MonthBars, TipWeek, TrendLine, WeekBandsChart } from '@/components/charts/glass-charts';
import { AreaChart, ColumnChart, Plot, ProgressRing } from '@/components/charts/charts';
import { Alert, CountUp, Delta, Money } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

type PresetId = 'month' | 'previous' | '3m' | '6m' | 'year' | 'all' | 'custom';

const ALL_TIME = { from: '2000-01-01', to: '2099-12-31' };

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
  const { t, lang } = useI18n();
  const revealHost = useReveal<HTMLDivElement>();
  const settings = useSettings((state) => state.settings);

  const [preset, setPreset] = useState<PresetId>(
    (PRESETS.some((entry) => entry.id === settings.statsPeriod) ? settings.statsPeriod : 'month') as PresetId,
  );
  const [customFrom, setCustomFrom] = useState(monthBounds(todayKey()).from);
  const [customTo, setCustomTo] = useState(monthBounds(todayKey()).to);
  const [summary, setSummary] = useState<DaysResponse>(EMPTY_SUMMARY);
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
    const { from, to } = range;

    setError(null);

    void calendarApi
      .days(from, to)
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

  const forecast = forecastFor(summary.days, range.from, range.to, awayDays);
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
        shifts: summary.days_worked,
        hours: summary.hours,
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
          place.name,
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
          className="field-input !w-36"
          value={customFrom}
          onChange={(event) => {
            setCustomFrom(event.target.value);
            setPreset('custom');
          }}
        />
        <input
          type="date"
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
        <Kpi label={t('Earned')} delta={delta(summary.total_earned, previous.total_earned)}>
          <CountUp value={summary.total_earned} className="text-[1.25rem] font-bold text-good" />
        </Kpi>
        <Kpi label={t('Hours')} delta={delta(summary.hours, previous.hours)}>
          <CountUp value={summary.hours} format={(value) => `${Math.round(value)}`} className="text-[1.25rem] font-bold" />
        </Kpi>
        <Kpi label={t('Per working day')} delta={delta(averages.perDay, beforeAverages.perDay)}>
          <Money value={averages.perDay} className="text-[1.25rem] font-bold" />
        </Kpi>
        <Kpi label={t('Per hour')} delta={delta(averages.perHour, beforeAverages.perHour)}>
          <Money value={averages.perHour} className="text-[1.25rem] font-bold" />
        </Kpi>
        <Kpi label={t('Median day')} delta={null}>
          <Money value={dayMedian} className="text-[1.25rem] font-bold" />
        </Kpi>
        <Kpi label={t('Days worked')} delta={delta(summary.days_worked, previous.days_worked)}>
          <span className="text-[1.25rem] font-bold tabular">{summary.days_worked}</span>
        </Kpi>
      </div>

      {/* ==== Goal + cumulative ==== */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          title={t('Earned over the period')}
          hint={forecast.live ? `${t('Projected by period end')}: ${formatMoney(settings, forecast.projected)}` : undefined}
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
        {trendParts.some((month) => month.shifts + month.sales + month.tips > 0) && (
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

        {sources.length > 0 && (
          <Card title={t('Where the money came from')}>
            {/* Composition strip: shares of one whole. */}
            <div className="mb-3 flex h-5 gap-[2px] overflow-hidden rounded-(--radius)">
              {sources.map((row, index) => (
                <span
                  key={row.name}
                  title={`${t(row.name)}: ${formatMoney(settings, row.value)}`}
                  style={{ width: `${(row.value / sourceTotal) * 100}%`, background: SOURCE_TINTS[index % SOURCE_TINTS.length] }}
                />
              ))}
            </div>
            <ul className="flex flex-col gap-1.5">
              {sources.map((row, index) => (
                <li key={row.name} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-[0.85rem]">
                  <span className="flex items-center gap-1.5 text-muted">
                    <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_TINTS[index % SOURCE_TINTS.length] }} />
                    {t(row.name)}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(row.value / Math.max(...sources.map((source) => source.value))) * 100}%`,
                        background: SOURCE_TINTS[index % SOURCE_TINTS.length],
                      }}
                    />
                  </span>
                  <Money value={row.value} className="font-semibold" />
                </li>
              ))}
            </ul>
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
              </dl>
            )}
          </Card>
        )}
      </div>

      {/* ==== Waterfall + punchcard ==== */}
      <div className="grid gap-3 lg:grid-cols-2">
        {waterfallSteps.length > 0 && (
          <Card title={t('How the money assembled')} hint={t('Every source in one bar; the cuts hang under it.')}>
            <MoneyFlow steps={waterfallSteps} />
          </Card>
        )}
        {bands.length > 0 && (
          <Card title={t('The shape of your week')} hint={t('When each weekday starts and ends, and what its hour pays.')}>
            <WeekBandsChart bands={bands} />
          </Card>
        )}
        {tipWeek.length > 1 && (
          <Card title={t('Which nights tip')} hint={t('The average a day of that weekday brings, and what share of it that was.')}>
            <TipWeek rows={tipWeek} />
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
      <Card title={t('Every day, at a glance')}>
        <DaysAtGlance values={heatValues} from={range.from === ALL_TIME.from ? `${currentMonth().year}-01-01` : range.from} to={range.to === ALL_TIME.to ? `${currentMonth().year}-12-31` : range.to} />
      </Card>

      {/* ==== Weekdays + top shifts + start hour ==== */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title={t('By weekday')}>
          <ul className="flex flex-col gap-1.5">
            {weekdays.map((day) => (
              <li key={day.name} className="grid grid-cols-[2.4rem_1fr_auto] items-center gap-2 text-[0.85rem]">
                <span className="text-muted">{t(day.name)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-(--accent)" style={{ width: `${day.share}%` }} />
                </span>
                <Money value={day.value} className="tabular" />
              </li>
            ))}
          </ul>
        </Card>

        {topShifts.length > 0 && (
          <Card title={t('Top shifts')}>
            <ul className="flex flex-col gap-1.5">
              {topShifts.map((row) => (
                <li key={row.name} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-[0.85rem]">
                  <span className="truncate text-muted">{row.name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-(--accent)" style={{ width: `${row.share}%` }} />
                  </span>
                  <span className="tabular">
                    {row.byPeriod ? `${Math.round(row.hours)}h` : formatMoney(settings, row.value)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {byStartHour.length > 0 && (
          <Card title={t('Which starting hour pays')}>
            <Plot max={byStartHour[0].max} height="8rem" tight>
              {byStartHour.map((row) => (
                <div key={row.hour} className="flex h-full flex-1 flex-col justify-end" title={`${row.label}: ${formatMoney(settings, row.earned)}`}>
                  <span
                    className="grow-y rounded-t"
                    style={{ height: `${row.height}%`, background: row.best ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, var(--surface-2))' }}
                  />
                  <span className="mt-0.5 text-center text-[0.62rem] text-faint">{row.label}</span>
                </div>
              ))}
            </Plot>
          </Card>
        )}
      </div>

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
        <Card title={t('Places side by side')} hint={t('Which hour is worth more — the question behind holding two jobs.')}>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.85rem]">
              <thead className="text-left text-muted">
                <tr>
                  {[t('Place of work'), t('Days worked'), t('Hours'), t('Earned'), t('Tips'), t('Per hour')].map((column) => (
                    <th key={column} className="px-2 py-1.5 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...comparison]
                  .sort((a, b) => b.per_hour - a.per_hour)
                  .map((place) => (
                    <tr key={place.location_id} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: place.colour }} />
                        {place.name}
                        {place.days_worked > 0 && place.days_worked < 3 && (
                          <span className="chip ml-1.5 border-warn/40 text-warn">{t('few shifts')}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 tabular">{place.days_worked}</td>
                      <td className="px-2 py-1.5 tabular">{Math.round(place.hours * 10) / 10}</td>
                      <td className="px-2 py-1.5"><Money value={place.earned} /></td>
                      <td className="px-2 py-1.5"><Money value={place.tips} /></td>
                      <td className="px-2 py-1.5 font-semibold"><Money value={place.per_hour} /></td>
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
