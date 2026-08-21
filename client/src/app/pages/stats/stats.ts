import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

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
import { DaysResponse, EMPTY_SUMMARY } from '../../core/calendar/calendar.models';
import { AreaPoint } from '../../shared/charts/area-chart';
import { forecastFor, paceToGoal, projectionSeries } from '../../core/calendar/forecast';
import { averagesFor } from '../../core/calendar/insights';
import { currentCardTheme, drawShareCard } from '../../core/export/share-card';
import { Sheet, buildXlsx, downloadBlob } from '../../core/export/xlsx';
import { I18n, TPipe } from '../../core/i18n/i18n';
import { SettingsStore } from '../../core/settings/settings-store';
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
import { ProgressRing } from '../../shared/charts/progress-ring';
import { CountUp } from '../../shared/count-up';
import { Delta } from '../../shared/delta/delta';
import { Icon } from '../../shared/icon/icon';
import { MoneyPipe } from '../../shared/money/money-pipe';

type PresetId = 'month' | 'previous' | '3m' | '6m' | 'year' | 'all' | 'custom';

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'previous', label: 'Last month' },
  { id: '3m', label: 'Last 3 months' },
  { id: '6m', label: 'Last 6 months' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
];

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
  ],
  templateUrl: './stats.html',
})
export class Stats {
  private readonly api = inject(CalendarApi);
  private readonly settings = inject(SettingsStore);
  private readonly i18n = inject(I18n);

  protected readonly presets = PRESETS;
  protected readonly preset = signal<PresetId>('month');
  protected readonly customFrom = signal(monthBounds(todayKey()).from);
  protected readonly customTo = signal(monthBounds(todayKey()).to);

  protected readonly summary = signal<DaysResponse>(EMPTY_SUMMARY);
  /** The same length of time immediately before the range, for the deltas. */
  protected readonly previous = signal<DaysResponse>(EMPTY_SUMMARY);
  protected readonly goal = signal<number | null>(null);
  protected readonly goalDraft = signal<number | null>(null);
  protected readonly editingGoal = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

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
    this.api.goal().subscribe({
      next: (response) => {
        this.goal.set(response.monthly_goal);
        this.goalDraft.set(response.monthly_goal);
      },
      error: () => undefined,
    });

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
  }

  // ==== Goal ====

  protected readonly goalProgress = computed(() => {
    const goal = this.goal();

    if (goal === null || goal <= 0) return null;

    const earned = this.summary().total_earned;

    return {
      goal,
      earned,
      percent: Math.min(100, (earned / goal) * 100),
      remaining: Math.max(0, goal - earned),
      reached: earned >= goal,
    };
  });

  protected saveGoal(): void {
    const value = this.goalDraft();

    this.api.setGoal(value && value > 0 ? value : null).subscribe({
      next: (response) => {
        this.goal.set(response.monthly_goal);
        this.editingGoal.set(false);
      },
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

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

  protected readonly pace = computed(() => paceToGoal(this.forecast(), this.goal()));

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

function shiftMonth(anchor: { year: number; month: number }, delta: number): string {
  const shifted = addMonths(anchor, delta);

  return `${shifted.year}-${`${shifted.month}`.padStart(2, '0')}-01`;
}
