import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { forkJoin } from 'rxjs';

import { apiErrorMessage } from '../../core/auth/api-error';
import { CalendarApi } from '../../core/calendar/calendar-api';
import {
  addMonths,
  currentMonth,
  keysBetween,
  monthBounds,
  todayKey,
  weekBounds,
} from '../../core/calendar/calendar-date';
import { DaysResponse, EMPTY_SUMMARY, Goal } from '../../core/calendar/calendar.models';
import { AreaPoint } from '../../shared/charts/area-chart';
import { forecastFor, paceToGoal, projectionSeries } from '../../core/calendar/forecast';
import { averagesFor } from '../../core/calendar/insights';
import { currentCardTheme, drawShareCard } from '../../core/export/share-card';
import { Sheet, buildXlsx, downloadBlob } from '../../core/export/xlsx';
import { I18n, TPipe } from '../../core/i18n/i18n';
import { SettingsStore } from '../../core/settings/settings-store';
import { STATS_PERIODS } from '../../core/settings/settings-store';
import {
  Column,
  ColumnDatum,
  Tick,
  buildColumns,
  buildTicks,
} from '../../shared/charts/chart-math';
import { AreaChart } from '../../shared/charts/area-chart';
import { ColumnChart } from '../../shared/charts/column-chart';
import { Heatmap } from '../../shared/charts/heatmap';
import { GoalsModal } from '../dashboard/tools/goals-modal';
import { ProgressRing } from '../../shared/charts/progress-ring';
import { CountUp } from '../../shared/count-up';
import { Delta } from '../../shared/delta/delta';
import { Icon } from '../../shared/icon/icon';
import { MoneyPipe } from '../../shared/money/money-pipe';

type PresetId = 'month' | 'previous' | '3m' | '6m' | 'year' | 'all' | 'custom';

/** The shared list, shaped for this page's template. */
const PRESETS: { id: PresetId; label: string }[] = STATS_PERIODS.map((entry) => ({
  id: entry.value as PresetId,
  label: entry.label,
}));

/** Wide enough to mean "everything" without a special case on the server. */
const ALL_TIME = { from: '2000-01-01', to: '2099-12-31' };

@Component({
  selector: 'app-stats',
  imports: [
    DecimalPipe,
    FormsModule,
    RouterLink,
    TPipe,
    MoneyPipe,
    ColumnChart,
    AreaChart,
    Heatmap,
    ProgressRing,
    CountUp,
    Delta,
    Icon,
    GoalsModal,
  ],
  templateUrl: './stats.html',
})
export class Stats {
  private readonly api = inject(CalendarApi);
  private readonly settings = inject(SettingsStore);
  private readonly i18n = inject(I18n);

  protected readonly presets = PRESETS;
  /**
   * Opens on whatever the settings say, so someone who always looks at the year
   * is not clicking past this month every time. A stored value that no longer
   * names a preset falls back rather than leaving the page on nothing.
   */
  protected readonly preset = signal<PresetId>(
    (PRESETS.some((entry) => entry.id === this.settings.statsPeriod())
      ? this.settings.statsPeriod()
      : 'month') as PresetId,
  );
  protected readonly customFrom = signal(monthBounds(todayKey()).from);
  protected readonly customTo = signal(monthBounds(todayKey()).to);

  protected readonly summary = signal<DaysResponse>(EMPTY_SUMMARY);
  /** The same length of time immediately before the range, for the deltas. */
  protected readonly previous = signal<DaysResponse>(EMPTY_SUMMARY);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Twelve months of totals, for the "is this normal" chart. */
  protected readonly trend = signal<ColumnDatum[]>([]);

  /**
   * Fixed and in the stacking order, not derived from whichever period is on
   * screen: the legend for this chart has to name the same three series every
   * time, or a month with no sales would quietly repaint the others.
   */
  protected readonly mixLegend = [
    { name: 'Shifts', tint: 'teal' },
    { name: 'Sales', tint: 'indigo' },
    { name: 'Tips', tint: 'green' },
  ];

  /** The same months split three ways, for how the mix moved. */
  protected readonly trendParts = signal<
    { label: string; shifts: number; sales: number; tips: number }[]
  >([]);

  /**
   * Each month as a stack of what made it up, on one scale across the year.
   *
   * The twelve-month chart says whether a month was good; this says whether it
   * was good for the same reason. A summer carried by tips and a winter carried
   * by hours are different jobs, and the totals alone cannot tell them apart.
   */
  protected readonly mix = computed(() => {
    const months = this.trendParts();
    const peak = Math.max(
      1,
      ...months.map((month) => month.shifts + month.sales + month.tips),
    );

    return months.map((month) => {
      const total = month.shifts + month.sales + month.tips;

      return {
        label: month.label,
        total,
        // Of the tallest month, so the columns are comparable down the row;
        // the segments then divide that height between them.
        height: (total / peak) * 100,
        parts: [
          { name: 'Shifts', tint: 'teal', value: month.shifts },
          { name: 'Sales', tint: 'indigo', value: month.sales },
          { name: 'Tips', tint: 'green', value: month.tips },
        ]
          .filter((part) => part.value > 0)
          .map((part) => ({ ...part, share: total > 0 ? (part.value / total) * 100 : 0 })),
      };
    });
  });

  protected readonly trendColumns = computed<Column[]>(() =>
    // Wider cap: a dozen columns over this plot leave slots far wider than the
    // day chart's, and the default thickness would look like a rendering fault.
    buildColumns(this.trend(), 34),
  );
  protected readonly trendTicks = computed<Tick[]>(() => buildTicks(this.trend()));

  /** The best month in the window, so the chart can say what it is beating. */
  protected readonly trendBest = computed(() =>
    this.trend().reduce<ColumnDatum | null>(
      (best, entry) => (best === null || entry.earned > best.earned ? entry : best),
      null,
    ),
  );

  /**
   * How the worked days are spread, in six bands from the quietest to the best.
   * The page already gives a median and a best day, but two numbers cannot say
   * whether the money arrives evenly or in a few big nights — which is the
   * difference between a wage you can plan around and one you cannot.
   */
  protected readonly spread = computed(() => {
    const earned = this.summary()
      .days.filter((day) => day.hours > 0)
      .map((day) => day.earned)
      .sort((a, b) => a - b);

    if (earned.length < 4) return [];

    const low = earned[0];
    const high = earned[earned.length - 1];
    const span = high - low;

    // Every day the same is not six bands of one day each, it is one band.
    if (span <= 0) return [{ label: this.settings.format(low), count: earned.length, from: low, to: high }];

    const bands = 6;
    const step = span / bands;

    return Array.from({ length: bands }, (_, index) => {
      const from = low + step * index;
      const to = index === bands - 1 ? high : from + step;
      const count = earned.filter((value) =>
        index === bands - 1 ? value >= from : value >= from && value < to,
      ).length;

      return { label: this.settings.format(from), count, from, to };
    });
  });

  protected readonly spreadPeak = computed(() =>
    Math.max(1, ...this.spread().map((band) => band.count)),
  );

  /**
   * Which band the typical day falls in, so the chart can point at it rather
   * than leaving the reader to find the middle by eye.
   */
  protected readonly spreadMedianBand = computed(() => {
    const bands = this.spread();

    if (bands.length === 0) return -1;

    const earned = this.summary()
      .days.filter((day) => day.hours > 0)
      .map((day) => day.earned)
      .sort((a, b) => a - b);
    const median = earned[Math.floor(earned.length / 2)];

    return bands.findIndex((band, index) =>
      index === bands.length - 1 ? median >= band.from : median >= band.from && median < band.to,
    );
  });

  /** Mean of the months that had any work in them; empty months are not a dip. */
  protected readonly trendAverage = computed(() => {
    const worked = this.trend().filter((entry) => entry.earned > 0);

    if (worked.length === 0) return 0;

    return worked.reduce((sum, entry) => sum + entry.earned, 0) / worked.length;
  });

  protected readonly range = computed(() => {
    const now = currentMonth();
    const first = `${now.year}-${`${now.month}`.padStart(2, '0')}-01`;

    switch (this.preset()) {
      case 'previous':
        return monthBounds(shiftMonth(now, -1));
      case '3m':
        return { from: monthBounds(shiftMonth(now, -2)).from, to: monthBounds(first).to };
      case '6m':
        return { from: monthBounds(shiftMonth(now, -5)).from, to: monthBounds(first).to };
      case 'year':
        return { from: `${now.year}-01-01`, to: `${now.year}-12-31` };
      case 'all':
        return ALL_TIME;
      case 'custom':
        return this.customFrom() <= this.customTo()
          ? { from: this.customFrom(), to: this.customTo() }
          : { from: this.customTo(), to: this.customFrom() };
      default:
        return monthBounds(first);
    }
  });

  constructor() {
    this.loadGoals();

    effect(() => {
      const { from, to } = this.range();

      this.loading.set(true);
      this.error.set(null);

      this.api.days(from, to).subscribe({
        next: (response) => {
          this.summary.set(response);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.loading.set(false);
        },
      });

      // The window immediately before, same length, so "vs previous" compares
      // like with like whatever the preset.
      const span = keysBetween(from, to).length;
      const previousTo = shiftKey(from, -1);
      const previousFrom = shiftKey(previousTo, -(span - 1));

      this.api.days(previousFrom, previousTo).subscribe({
        next: (response) => this.previous.set(response),
        error: () => this.previous.set(EMPTY_SUMMARY),
      });
    });

    this.loadTrend();
  }

  /**
   * Twelve months ending with this one, independent of the period picker: the
   * rest of the page answers "how did this stretch go", and this answers "is
   * that normal", which is a different question and a fixed window.
   *
   * One request per month rather than one long range, because overtime and
   * period wages are worked out per range — a single span would smear both
   * across the month boundaries they belong to.
   */
  private loadTrend(): void {
    const anchor = currentMonth();
    const months = Array.from({ length: 12 }, (_, index) => addMonths(anchor, index - 11));

    forkJoin(
      months.map((month) => {
        const { from, to } = monthBounds(
          `${month.year}-${`${month.month}`.padStart(2, '0')}-01`,
        );

        return this.api.days(from, to);
      }),
    ).subscribe({
      next: (responses) => {
        this.trend.set(
          responses.map((response, index) => ({
            label: this.monthLabel(months[index]),
            earned: response.total_earned,
            planned: response.planned_earned,
            hours: response.hours,
          })),
        );

        // The same twelve responses, kept split, so the mix over the year costs
        // no extra requests.
        this.trendParts.set(
          responses.map((response, index) => ({
            label: this.monthLabel(months[index]),
            shifts: response.shifts_earned + response.period_earned + response.overtime_earned,
            sales: response.sales_earned,
            tips: response.tips_earned,
          })),
        );
      },
      error: () => {
        this.trend.set([]);
        this.trendParts.set([]);
      },
    });
  }

  private monthLabel({ year, month }: { year: number; month: number }): string {
    return new Intl.DateTimeFormat(this.i18n.lang(), { month: 'short' })
      .format(new Date(year, month - 1, 1));
  }

  // ==== Goal ====

  protected readonly goals = signal<Goal[]>([]);
  protected readonly goalsOpen = signal(false);

  protected loadGoals(): void {
    this.api.goals().subscribe({
      next: (goals) => this.goals.set(goals),
      error: () => this.goals.set([]),
    });
  }

  /**
   * The goal that governs the range on screen, and what it asks for over it.
   *
   * Only whole periods get a figure. Half a month against a monthly goal is not
   * half the target in any sense a reader would accept, so a partial range says
   * nothing rather than showing a prorated number that would be wrong to act on.
   */
  protected readonly activeGoal = computed(() => {
    const { from, to } = this.range();
    const goals = this.goals();

    if (goals.length === 0) return null;

    // "All time" is a hundred-year span standing in for "everything", not a
    // stretch anyone sets a goal against. Multiplying a monthly goal by the
    // months in it produced a target of 78 million, which is arithmetically
    // right and no use to a reader.
    if (this.preset() === 'all') return null;

    const days = keysBetween(from, to).length;

    if (days === 0) return null;

    const candidates: { period: Goal['period']; multiple: number }[] = [
      { period: 'day', multiple: days },
      { period: 'week', multiple: days % 7 === 0 ? days / 7 : 0 },
      { period: 'month', multiple: wholeMonths(from, to) },
      { period: 'year', multiple: wholeYears(from, to) },
    ];

    // Largest period that divides the range cleanly: a month of days answers to
    // the monthly goal, not to the daily one multiplied by thirty.
    for (const candidate of [...candidates].reverse()) {
      if (candidate.multiple <= 0) continue;

      const goal = resolveGoal(goals, candidate.period, from, to);

      if (goal !== null) return { goal, target: goal.amount * candidate.multiple };
    }

    return null;
  });

  protected readonly goalProgress = computed(() => {
    const active = this.activeGoal();

    if (active === null) return null;

    const earned = this.summary().total_earned;

    return {
      goal: active.target,
      note: active.goal.note,
      earned,
      percent: Math.min(100, (earned / active.target) * 100),
      remaining: Math.max(0, active.target - earned),
      reached: earned >= active.target,
    };
  });

  // ==== Deltas against the previous window ====

  private delta(now: number, before: number): number | null {
    if (before === 0) return null;

    return ((now - before) / before) * 100;
  }

  protected readonly earnedDelta = computed(() =>
    this.delta(this.summary().total_earned, this.previous().total_earned),
  );

  protected readonly hoursDelta = computed(() =>
    this.delta(this.summary().hours, this.previous().hours),
  );

  /** Per-unit figures, and how each one moved against the window before. */
  protected readonly averages = computed(() => averagesFor(this.summary()));
  private readonly beforeAverages = computed(() => averagesFor(this.previous()));

  protected readonly perDayDelta = computed(() =>
    this.delta(this.averages().perDay, this.beforeAverages().perDay),
  );
  protected readonly perHourDelta = computed(() =>
    this.delta(this.averages().perHour, this.beforeAverages().perHour),
  );
  protected readonly perShiftDelta = computed(() =>
    this.delta(this.averages().perShift, this.beforeAverages().perShift),
  );
  protected readonly tipsPerDayDelta = computed(() =>
    this.delta(this.averages().tipsPerDay, this.beforeAverages().tipsPerDay),
  );
  protected readonly salesPerDayDelta = computed(() =>
    this.delta(this.averages().salesPerDay, this.beforeAverages().salesPerDay),
  );
  protected readonly hoursPerDayDelta = computed(() =>
    this.delta(this.averages().hoursPerDay, this.beforeAverages().hoursPerDay),
  );

  // ==== Cumulative ====

  protected readonly cumulative = computed<AreaPoint[]>(() => {
    const { from, to } = this.range();
    const byDate = new Map(this.summary().days.map((day) => [day.date, day.earned]));
    const keys = keysBetween(from, to);

    // Beyond a quarter the line is dense enough that daily points stop reading.
    if (keys.length > 120) {
      let running = 0;

      return [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => {
          running += value;

          return { label: key.slice(5), value: running };
        });
    }

    let running = 0;

    return keys.map((key) => {
      running += byDate.get(key) ?? 0;

      return { label: key.slice(8), value: running };
    });
  });

  /**
   * The same running total over the window before this one. Laid across the
   * same width so the two line up start-to-start: a February compared against
   * a March has three fewer days, and matching them by date would make the
   * shorter month look like it stopped early rather than finished.
   */
  protected readonly cumulativePrevious = computed<AreaPoint[]>(() => {
    const days = [...this.previous().days].sort((a, b) => a.date.localeCompare(b.date));

    if (days.length < 2) return [];

    let running = 0;

    return days.map((day) => {
      running += day.earned;

      return { label: day.date.slice(5), value: running };
    });
  });

  /** Everything the period gave back: tip-out, staff meals and fines. */
  protected readonly withheld = computed(
    () => this.summary().tip_out + this.summary().deductions,
  );

  protected readonly tipsShare = computed(() => {
    const summary = this.summary();

    return summary.total_earned === 0
      ? 0
      : (summary.tips_earned / summary.total_earned) * 100;
  });

  protected readonly salesUnits = computed(() =>
    this.summary()
      .days.flatMap((day) => day.sales)
      .reduce((total, entry) => total + entry.quantity, 0),
  );

  // ==== Forecast ====

  protected readonly forecast = computed(() => {
    const { from, to } = this.range();

    return forecastFor(this.summary().days, from, to);
  });

  protected readonly pace = computed(() =>
    paceToGoal(this.forecast(), this.activeGoal()?.target ?? null),
  );

  protected readonly projection = computed<AreaPoint[]>(() => {
    const forecast = this.forecast();

    if (!forecast.live) return [];

    const { from, to } = this.range();

    return projectionSeries(this.summary().days, from, to, forecast);
  });

  /** How the projection compares with the same period before it. */
  protected readonly projectionDelta = computed(() =>
    this.delta(this.forecast().projected, this.previous().total_earned),
  );

  protected readonly goalPercent = computed(() => {
    const progress = this.goalProgress();

    return progress === null ? 0 : progress.percent;
  });

  // ==== Streaks and averages ====

  /** The run ending today, which is the one worth showing as "current". */
  protected readonly currentStreak = computed(() => {
    const worked = new Set(
      this.summary()
        .days.filter((day) => day.shifts.some((entry) => entry.worked))
        .map((day) => day.date),
    );

    const keys = keysBetween(this.range().from, this.range().to)
      .filter((key) => key <= todayKey())
      .reverse();

    let running = 0;

    for (const key of keys) {
      if (!worked.has(key)) break;

      running += 1;
    }

    return running;
  });

  /** The most recent days with something on them, newest first. */
  protected readonly activity = computed(() =>
    [...this.summary().days]
      .filter((day) => day.earned > 0 || day.shifts.length > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6),
  );

  protected readonly streak = computed(() => {
    const worked = new Set(
      this.summary()
        .days.filter((day) => day.shifts.some((entry) => entry.worked))
        .map((day) => day.date),
    );

    let best = 0;
    let running = 0;

    for (const key of keysBetween(this.range().from, this.range().to)) {
      running = worked.has(key) ? running + 1 : 0;
      best = Math.max(best, running);
    }

    return best;
  });

  protected readonly median = computed(() => {
    const values = this.summary()
      .days.map((day) => day.earned)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);

    if (values.length === 0) return 0;

    const middle = Math.floor(values.length / 2);

    return values.length % 2 === 0
      ? (values[middle - 1] + values[middle]) / 2
      : values[middle];
  });

  protected readonly longestShift = computed(() => {
    let top: { name: string; hours: number } | null = null;

    for (const day of this.summary().days) {
      for (const entry of day.shifts) {
        if (top === null || entry.hours > top.hours) {
          top = { name: entry.name, hours: entry.hours };
        }
      }
    }

    return top;
  });

  // ==== KPI ====

  protected readonly averagePerDay = computed(() => {
    const summary = this.summary();

    return summary.days_worked === 0 ? 0 : summary.total_earned / summary.days_worked;
  });

  protected readonly averageHourly = computed(() => {
    const summary = this.summary();

    return summary.hours === 0 ? 0 : summary.shifts_earned / summary.hours;
  });

  protected readonly bestDay = computed(() => {
    const days = this.summary().days;

    if (days.length === 0) return null;

    const best = days.reduce((top, day) => (day.earned > top.earned ? day : top));

    return best.earned > 0 ? best : null;
  });

  // ==== Earnings over the range, granularity following its length ====

  protected readonly granularity = computed<'day' | 'week' | 'month'>(() => {
    const { from, to } = this.range();
    const days = keysBetween(from, to).length;

    if (days <= 62) return 'day';
    if (days <= 240) return 'week';

    return 'month';
  });

  private readonly earningsData = computed<ColumnDatum[]>(() => {
    const summary = this.summary();
    const { from, to } = this.range();
    const grain = this.granularity();

    if (grain === 'day') {
      const byDate = new Map(summary.days.map((day) => [day.date, day]));

      return keysBetween(from, to).map((key) => {
        const day = byDate.get(key);

        return {
          label: key.slice(8),
          earned: day?.earned ?? 0,
          planned: day?.planned ?? 0,
          hours: day?.hours ?? 0,
        };
      });
    }

    // Weeks and months group the recorded days; buckets keyed by their label.
    const buckets = new Map<string, ColumnDatum>();

    for (const day of summary.days) {
      const label =
        grain === 'week' ? weekBounds(day.date).from.slice(5) : day.date.slice(0, 7);
      const bucket = buckets.get(label) ?? { label, earned: 0, planned: 0, hours: 0 };

      bucket.earned += day.earned;
      bucket.planned += day.planned;
      bucket.hours += day.hours;
      buckets.set(label, bucket);
    }

    return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
  });

  protected readonly earningsColumns = computed<Column[]>(() =>
    buildColumns(this.earningsData()),
  );
  protected readonly earningsTicks = computed<Tick[]>(() =>
    buildTicks(this.earningsData()),
  );
  protected readonly earningsLabelEvery = computed(() => {
    const total = this.earningsData().length;

    return total > 14 ? 7 : 1;
  });

  // ==== Heatmap ====

  protected readonly heatValues = computed(() => {
    return new Map(this.summary().days.map((day) => [day.date, day.earned]));
  });

  // ==== Weekday breakdown ====

  protected readonly weekdays = computed(() => {
    const totals = new Array(7).fill(0) as number[];

    for (const day of this.summary().days) {
      const [year, month, dayOfMonth] = day.date.split('-').map(Number);
      const weekday = (new Date(year, month - 1, dayOfMonth).getDay() + 6) % 7;

      totals[weekday] += day.earned;
    }

    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const top = Math.max(1, ...totals);

    return totals.map((value, index) => ({
      name: names[index],
      value,
      share: (value / top) * 100,
    }));
  });

  // ==== Top shifts ====

  protected readonly topShifts = computed(() => {
    const totals = new Map<string, { name: string; value: number; hours: number }>();

    for (const day of this.summary().days) {
      for (const entry of day.shifts) {
        if (!entry.worked) continue;

        const bucket = totals.get(entry.name) ?? {
          name: entry.name,
          value: 0,
          hours: 0,
        };

        bucket.value += entry.earned;
        bucket.hours += entry.hours;
        totals.set(entry.name, bucket);
      }
    }

    // A weekly or monthly wage earns nothing per shift — it is paid once per
    // period and lands on the range summary instead. Ranking those by money
    // put them at the bottom with a bar reading "0", which looks like the
    // shift was worthless rather than paid another way. Where a row has no
    // per-shift pay, its hours carry the bar and the label.
    const rows = [...totals.values()]
      .sort((a, b) => b.value - a.value || b.hours - a.hours)
      .slice(0, 6);

    const anyPaid = rows.some((row) => row.value > 0);
    const top = Math.max(
      1,
      ...rows.map((row) => (anyPaid && row.value > 0 ? row.value : 0)),
    );
    const topHours = Math.max(1, ...rows.map((row) => row.hours));

    return rows.map((row) => ({
      ...row,
      /** True when this template is paid per period rather than per shift. */
      byPeriod: row.value === 0 && row.hours > 0,
      share: row.value > 0 ? (row.value / top) * 100 : (row.hours / topHours) * 100,
    }));
  });

  // ==== Sources and places ====

  protected readonly sources = computed(() => {
    const summary = this.summary();

    const rows = [
      { name: 'Shifts', value: summary.shifts_earned },
      { name: 'Overtime', value: summary.overtime_earned },
      { name: 'Salary', value: summary.period_earned },
      { name: 'Sales', value: summary.sales_earned },
      { name: 'Tips', value: summary.tips_earned },
    ].filter((row) => row.value > 0);

    const top = Math.max(1, ...rows.map((row) => row.value));

    return rows.map((row) => ({ ...row, share: (row.value / top) * 100 }));
  });

  /**
   * The same five sources as proportions of one another rather than as ranked
   * lengths. The bars below answer "which is biggest"; this answers "what is
   * this wage made of", which is the question behind deciding whether to chase
   * shifts or chase tables — and a row of bars cannot be read as a share.
   */
  protected readonly composition = computed(() => {
    const summary = this.summary();

    const parts = [
      { name: 'Shifts', value: summary.shifts_earned, tint: 'teal' },
      { name: 'Salary', value: summary.period_earned, tint: 'rose' },
      { name: 'Overtime', value: summary.overtime_earned, tint: 'amber' },
      { name: 'Sales', value: summary.sales_earned, tint: 'indigo' },
      { name: 'Tips', value: summary.tips_earned, tint: 'green' },
    ].filter((part) => part.value > 0);

    const total = parts.reduce((sum, part) => sum + part.value, 0);

    if (total <= 0) return [];

    return parts.map((part) => ({
      ...part,
      share: (part.value / total) * 100,
      // Below about a twelfth the segment is thinner than its own label, so the
      // legend carries the name instead of crushing it into the mark.
      labelled: part.value / total >= 0.08,
    }));
  });

  /**
   * What each sales position actually brought in. The page knows every unit
   * sold and never said which of them was worth selling.
   */
  protected readonly salesRanked = computed(() => {
    const totals = new Map<string, { earned: number; units: number }>();

    for (const day of this.summary().days) {
      for (const sale of day.sales ?? []) {
        const bucket = totals.get(sale.name) ?? { earned: 0, units: 0 };

        bucket.earned += sale.earned;
        bucket.units += sale.quantity;
        totals.set(sale.name, bucket);
      }
    }

    const rows = [...totals.entries()]
      .map(([name, bucket]) => ({ name, ...bucket }))
      .filter((row) => row.earned > 0)
      .sort((a, b) => b.earned - a.earned);

    const top = Math.max(1, ...rows.map((row) => row.earned));

    return rows.map((row) => ({ ...row, share: (row.earned / top) * 100 }));
  });

  /**
   * What is taken back off the sources above. The bars alone never added up to
   * the headline figure, which is the question this card is asked: the total is
   * the five sources minus these two, and then minus tax to reach a pocket.
   *
   * Mirrors the server's own arithmetic in DayHandler:
   *   total = shifts + sales + tips + salary + overtime − tip-out − deductions
   *   net   = total − tax
   */
  protected readonly deductionRows = computed(() => {
    const summary = this.summary();

    return [
      { name: 'Tip-out', value: summary.tip_out },
      { name: 'Meals and fines', value: summary.deductions },
    ].filter((row) => row.value > 0);
  });

  /** True when tax is withheld, so the net line is worth showing at all. */
  protected readonly hasTax = computed(() => this.summary().tax > 0);

  protected readonly places = computed(() => {
    const rows = this.summary().by_location;

    if (rows.length < 2) return [];

    const top = Math.max(1, ...rows.map((row) => row.earned));

    return rows.map((row) => ({
      name: row.name,
      value: row.earned,
      colour: row.colour,
      share: (row.earned / top) * 100,
    }));
  });

  /**
   * Each place on the measures that decide whether it is worth keeping.
   *
   * The ranked bar below says which place paid more, which is mostly a question
   * of how many shifts each got. Someone holding two jobs is asking a different
   * one — which hour is worth more — and that only shows when the places are
   * put side by side on the same measures.
   */
  protected readonly placeBreakdown = computed(() => {
    const rows = this.summary().by_location;

    if (rows.length < 2) return [];

    const earned = rows.reduce((sum, row) => sum + row.earned, 0);
    const hours = rows.reduce((sum, row) => sum + row.hours, 0);

    // Only places with enough shifts behind them can win the badge. One good
    // night would otherwise crown a place as the best-paying job there is, and
    // that is a claim somebody might hand their notice in over.
    const settled = rows.filter((row) => row.days_worked >= 3);
    const bestHourly = settled.length > 0 ? Math.max(...settled.map((row) => row.per_hour)) : -1;

    return [...rows]
      .sort((a, b) => b.per_hour - a.per_hour)
      .map((row) => ({
        name: row.name,
        colour: row.colour,
        earned: row.earned,
        hours: row.hours,
        days: row.days_worked,
        perHour: row.per_hour,
        tips: row.tips,
        earnedShare: earned > 0 ? (row.earned / earned) * 100 : 0,
        hoursShare: hours > 0 ? (row.hours / hours) * 100 : 0,
        /** Ranked by the hour, so the best-paying one is named rather than found. */
        best: row.per_hour === bestHourly && row.per_hour > 0,
        /**
         * Too few shifts for the hourly figure to mean anything. One good night
         * at a place makes it look like the best-paying job there is, and
         * someone could reasonably act on that.
         */
        thin: row.days_worked > 0 && row.days_worked < 3,
      }));
  });

  /**
   * Tips as a share of what each month brought in.
   *
   * The amount of tips already has a card; a share answers a different
   * question — whether the tipping is holding up as the hours change. A good
   * month on more shifts is not the same as a good month on better tables.
   */
  protected readonly tipsTrend = computed(() => {
    const months = this.trendParts().filter(
      (month) => month.shifts + month.sales + month.tips > 0,
    );

    if (months.length < 2) return [];

    const shares = months.map((month) => {
      const total = month.shifts + month.sales + month.tips;

      return { label: month.label, share: (month.tips / total) * 100 };
    });

    const peak = Math.max(...shares.map((entry) => entry.share), 1);

    return shares.map((entry) => ({
      ...entry,
      // Against the best month rather than against 100%, or a wage where tips
      // are a tenth would draw twelve slivers and say nothing.
      height: Math.max(2, (entry.share / peak) * 100),
    }));
  });

  /**
   * Share of money against share of time, per shift template.
   *
   * "Top shifts" ranks by what each earned. A shift taking a third of the hours
   * for a fifth of the money is the one worth dropping, and no ranking by money
   * alone can show it. Both bars are percentages of their own totals, so it is
   * one scale and the pair can be compared.
   */
  protected readonly moneyVsTime = computed(() => {
    const totals = new Map<string, { earned: number; hours: number }>();

    for (const day of this.summary().days) {
      for (const entry of day.shifts) {
        if (!entry.worked) continue;

        const bucket = totals.get(entry.name) ?? { earned: 0, hours: 0 };

        bucket.earned += entry.earned;
        bucket.hours += entry.hours;
        totals.set(entry.name, bucket);
      }
    }

    const rows = [...totals.entries()].map(([name, bucket]) => ({ name, ...bucket }));
    const earned = rows.reduce((sum, row) => sum + row.earned, 0);
    const hours = rows.reduce((sum, row) => sum + row.hours, 0);

    if (rows.length < 2 || earned <= 0 || hours <= 0) return [];

    return rows
      .map((row) => ({
        name: row.name,
        moneyShare: (row.earned / earned) * 100,
        timeShare: (row.hours / hours) * 100,
        earned: row.earned,
        hours: row.hours,
      }))
      .sort((a, b) => b.moneyShare - a.moneyShare);
  });

  /**
   * Cash against card, on the tips.
   *
   * The day panel has asked for this on every shift and nothing has ever shown
   * it back. It is the one split that decides whether the money is already in a
   * pocket or arriving with the wage — and whether it is visible to a tax
   * office, which is not this app's business to judge but is the user's to see.
   */
  protected readonly tipsSplit = computed(() => {
    let cash = 0;
    let total = 0;

    for (const day of this.summary().days) {
      total += day.tips ?? 0;
      cash += day.tips_cash ?? 0;
    }

    if (total <= 0) return null;

    // Cash is recorded as a part of the tips, not on top of them.
    const card = Math.max(0, total - cash);

    return {
      cash,
      card,
      total,
      cashShare: (cash / total) * 100,
      cardShare: (card / total) * 100,
    };
  });

  /**
   * What the hours past the weekly threshold were worth.
   *
   * The KPI row says how many hours went over. It does not say what they
   * bought, and the premium is the whole reason for noticing them.
   */
  protected readonly overtime = computed(() => {
    const summary = this.summary();

    if (summary.overtime_hours <= 0) return null;

    return {
      hours: summary.overtime_hours,
      earned: summary.overtime_earned,
      share: summary.hours > 0 ? (summary.overtime_hours / summary.hours) * 100 : 0,
      perHour: summary.overtime_hours > 0 ? summary.overtime_earned / summary.overtime_hours : 0,
    };
  });

  /**
   * Which starting hour the money comes from.
   *
   * A late shift and an early one are different jobs even at the same place,
   * and the templates hide that behind a name. Bucketed by the hour a shift
   * starts, because that is the thing being chosen when a rota is offered.
   */
  protected readonly byStartHour = computed(() => {
    const totals = new Map<number, { earned: number; count: number }>();

    for (const day of this.summary().days) {
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

    const rows = [...totals.entries()]
      .map(([hour, bucket]) => ({ hour, ...bucket }))
      .sort((a, b) => a.hour - b.hour);

    const top = Math.max(1, ...rows.map((row) => row.earned));

    return rows.map((row) => ({
      ...row,
      label: `${`${row.hour}`.padStart(2, '0')}:00`,
      height: Math.max(2, (row.earned / top) * 100),
      best: row.earned === top,
    }));
  });

  /**
   * How much a day has had to bring in, recomputed as the period ran down.
   *
   * The goal meter says how far along you are. It cannot say whether the hill
   * is getting steeper, which is the thing that decides whether to pick up
   * another shift — and a target that has quietly climbed from 1 500 a day to
   * 2 400 is worth seeing before the last week rather than during it.
   */
  protected readonly climb = computed(() => {
    const active = this.activeGoal();

    if (active === null) return null;

    const { from, to } = this.range();
    const keys = keysBetween(from, to);

    if (keys.length < 4) return null;

    const byDate = new Map(this.summary().days.map((day) => [day.date, day.earned]));
    const today = todayKey();

    let running = 0;
    const points: { key: string; needed: number; done: boolean }[] = [];

    keys.forEach((key, index) => {
      const left = keys.length - index;
      // What the remaining days each had to bring in, standing at this one.
      const needed = Math.max(0, (active.target - running) / left);

      points.push({ key, needed, done: key <= today });
      running += byDate.get(key) ?? 0;
    });

    // Only the days already behind us are fact; the rest would be a flat line
    // drawn from a total that has not happened.
    const walked = points.filter((point) => point.done);

    if (walked.length < 3) return null;

    const peak = Math.max(...walked.map((point) => point.needed), 1);
    const first = walked[0].needed;
    const last = walked[walked.length - 1].needed;

    return {
      start: first,
      now: last,
      // Rising means falling behind; the wording elsewhere leans on this.
      steeper: last > first,
      reached: last === 0,
      points: walked.map((point) => ({
        ...point,
        height: Math.max(2, (point.needed / peak) * 100),
      })),
    };
  });

  /**
   * What an hour was actually worth on each day worked.
   *
   * This began as hours-against-money on two axes, which was the wrong form for
   * the data: shifts are all 7 to 11 hours, so every point landed in the same
   * corner and the plot said nothing. Dividing one by the other says it
   * directly — a day at 180 an hour against an average of 270 is the day worth
   * asking about, and it needs one axis instead of two.
   */
  protected readonly hourlyByDay = computed(() => {
    const days = this.summary()
      .days.filter((day) => day.hours > 0 && day.earned > 0)
      .map((day) => ({ date: day.date, rate: day.earned / day.hours, hours: day.hours }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (days.length < 4) return null;

    const totalHours = this.summary().days.reduce((sum, day) => sum + day.hours, 0);
    const totalEarned = this.summary().days.reduce((sum, day) => sum + day.earned, 0);
    const average = totalHours > 0 ? totalEarned / totalHours : 0;
    const peak = Math.max(...days.map((day) => day.rate), average);

    return {
      average,
      // Where the average sits up the plot, so the line can be drawn across it.
      averageAt: peak > 0 ? (average / peak) * 100 : 0,
      best: Math.max(...days.map((day) => day.rate)),
      worst: Math.min(...days.map((day) => day.rate)),
      days: days.map((day) => ({
        ...day,
        height: Math.max(2, (day.rate / peak) * 100),
        below: day.rate < average,
      })),
    };
  });

  /** Whole numbers for counters that are not money. */
  protected readonly plain = (value: number) => `${Math.round(value)}`;

  // ==== Exports ====

  protected readonly exporting = signal(false);

  protected exportPng(): void {
    this.exporting.set(true);

    drawShareCard(
      {
        title: this.i18n.t('Statistics'),
        period: `${this.range().from} — ${this.range().to}`,
        summary: this.summary(),
        format: (value) => this.settings.format(value),
        labels: {
          earned: this.i18n.t('Earned'),
          net: this.i18n.t('After tax'),
          hours: this.i18n.t('Hours'),
          days: this.i18n.t('Days worked'),
          perHour: this.i18n.t('Average hourly'),
          byDay: this.i18n.t('By day'),
          shifts: this.i18n.t('Shifts'),
          salary: this.i18n.t('Salary'),
          sales: this.i18n.t('Sales'),
          tips: this.i18n.t('Tips'),
          overtime: this.i18n.t('Overtime hours'),
          planned: this.i18n.t('Still planned'),
          places: this.i18n.t('Places'),
          worked: this.i18n.t('Worked'),
        },
      },
      currentCardTheme(),
    )
      .then((blob) => downloadBlob(`shifter-${this.range().from}.png`, blob))
      .catch((error: unknown) => this.error.set(apiErrorMessage(error)))
      .finally(() => this.exporting.set(false));
  }

  protected exportXlsx(): void {
    const summary = this.summary();
    const forecast = this.forecast();
    const t = (key: string) => this.i18n.t(key);

    const overview: Sheet = {
      name: t('Statistics').slice(0, 28),
      rows: [
        [t('Period'), `${this.range().from} — ${this.range().to}`],
        [t('Earned'), summary.total_earned],
        [t('Still planned'), summary.planned_earned],
        [t('Hours'), summary.hours],
        [t('Overtime'), summary.overtime_earned],
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
        [
          t('Period'),
          t('Shifts'),
          t('Hours'),
          t('Worked'),
          t('Sales'),
          t('Tips'),
          t('Earned'),
          t('Still planned'),
          t('Note'),
        ],
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
        [
          t('Place of work'),
          t('Days worked'),
          t('Hours'),
          t('Earned'),
          t('Tips'),
          t('Sales'),
          t('Tip-out'),
          t('Per hour'),
        ],
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

    downloadBlob(
      `shifter-${this.range().from}-${this.range().to}.xlsx`,
      buildXlsx([overview, days, places]),
    );
  }

  // ==== Location comparison ====

  /** Ranked on each column so the best cell in a row can be marked. */
  protected readonly comparison = computed(() => {
    const places = this.summary().by_location;

    if (places.length < 2) return null;

    const best = {
      earned: Math.max(...places.map((place) => place.earned)),
      perHour: Math.max(...places.map((place) => place.per_hour)),
      tips: Math.max(...places.map((place) => place.tips)),
      hours: Math.max(...places.map((place) => place.hours)),
      days: Math.max(...places.map((place) => place.days_worked)),
    };

    return { places, best };
  });

  protected pick(preset: PresetId): void {
    this.preset.set(preset);
  }

  protected setCustom(from: string, to: string): void {
    if (from) this.customFrom.set(from);
    if (to) this.customTo.set(to);

    this.preset.set('custom');
  }
}

/** Steps a 'YYYY-MM-DD' key by whole days. */
function shiftKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);

  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, '0'),
    `${date.getDate()}`.padStart(2, '0'),
  ].join('-');
}

/**
 * Whole calendar months spanned, or 0 when the range is not whole months.
 * Mirrors GoalCalculator.WholeMonths on the server; the two have to agree or
 * the meter would claim a target the server would not.
 */
function wholeMonths(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);

  if (fd !== 1) return 0;
  if (td !== new Date(ty, tm, 0).getDate()) return 0;

  return (ty - fy) * 12 + tm - fm + 1;
}

function wholeYears(from: string, to: string): number {
  if (!from.endsWith('-01-01') || !to.endsWith('-12-31')) return 0;

  return Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1;
}

/**
 * The goal for a period over a range: one pinned to a period inside the range
 * wins, otherwise the standing one. Same precedence as the server's resolver.
 */
function resolveGoal(
  goals: Goal[],
  period: Goal['period'],
  from: string,
  to: string,
): Goal | null {
  const ofPeriod = goals.filter((goal) => goal.period === period);
  const pinned = ofPeriod.find(
    (goal) => goal.anchor !== null && goal.anchor >= from && goal.anchor <= to,
  );

  return pinned ?? ofPeriod.find((goal) => goal.anchor === null) ?? null;
}

function shiftMonth(anchor: { year: number; month: number }, delta: number): string {
  const shifted = addMonths(anchor, delta);

  return `${shifted.year}-${`${shifted.month}`.padStart(2, '0')}-01`;
}
