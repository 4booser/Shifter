import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { apiErrorMessage } from '../../core/auth/api-error';
import { CalendarApi } from '../../core/calendar/calendar-api';
import { currentMonth, fromKey, todayKey } from '../../core/calendar/calendar-date';
import { DaysResponse, EMPTY_SUMMARY } from '../../core/calendar/calendar.models';
import { forecastFor } from '../../core/calendar/forecast';
import {
  averagesFor,
  bestDay,
  bestWeek,
  change,
  countShifts,
  longestStreak,
  restDays,
} from '../../core/calendar/insights';
import { I18n, TPipe } from '../../core/i18n/i18n';
import { Heatmap } from '../../shared/charts/heatmap';
import { CountUp } from '../../shared/count-up';
import { Delta } from '../../shared/delta/delta';
import { Icon } from '../../shared/icon/icon';
import { MoneyPipe } from '../../shared/money/money-pipe';

/** Earned by hours worked in the year — the badge at the top of the page. */
const TIERS: { hours: number; name: string; emoji: string }[] = [
  { hours: 1800, name: 'Legend of the floor', emoji: '👑' },
  { hours: 1200, name: 'Iron shift', emoji: '🔥' },
  { hours: 800, name: 'Backbone of the place', emoji: '💪' },
  { hours: 400, name: 'Steady hand', emoji: '⚓️' },
  { hours: 150, name: 'Getting the rhythm', emoji: '🎯' },
  { hours: 0, name: 'Just getting started', emoji: '🌱' },
];

/**
 * The year in review. Music apps do this well because they pick a handful of
 * superlatives and give each one a whole card. Two halves here: what actually
 * happened, and — where the year is still running — where it is heading.
 */
@Component({
  selector: 'app-wrapped',
  imports: [RouterLink, TPipe, MoneyPipe, DecimalPipe, CountUp, Delta, Icon, Heatmap],
  templateUrl: './wrapped.html',
})
export class Wrapped {
  private readonly api = inject(CalendarApi);
  private readonly i18n = inject(I18n);

  /** Dates and month names follow the chosen language, not the build's. */
  private readonly locale = computed(() => this.i18n.lang());

  protected readonly year = signal(currentMonth().year);
  protected readonly summary = signal<DaysResponse>(EMPTY_SUMMARY);
  /** The same year before it, so every figure can say which way it moved. */
  protected readonly previous = signal<DaysResponse>(EMPTY_SUMMARY);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const year = this.year();

      this.loading.set(true);

      forkJoin({
        current: this.api.days(`${year}-01-01`, `${year}-12-31`),
        previous: this.api.days(`${year - 1}-01-01`, `${year - 1}-12-31`),
      }).subscribe({
        next: ({ current, previous }) => {
          this.summary.set(current);
          this.previous.set(previous);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.loading.set(false);
        },
      });
    });
  }

  protected readonly days = computed(() => this.summary().days);

  /** Minutes, because "7 080 minutes" lands harder than "118 hours". */
  protected readonly minutes = computed(() => Math.round(this.summary().hours * 60));

  protected readonly totalShifts = computed(() => countShifts(this.days()));

  protected readonly averages = computed(() => averagesFor(this.summary()));
  protected readonly before = computed(() => averagesFor(this.previous()));

  protected readonly hasData = computed(() => this.days().length > 0);
  protected readonly hasPrevious = computed(() => this.previous().days_worked > 0);

  // ==== Where the year is heading ====

  protected readonly isCurrentYear = computed(() => this.year() === currentMonth().year);

  protected readonly forecast = computed(() =>
    forecastFor(this.days(), `${this.year()}-01-01`, `${this.year()}-12-31`),
  );

  /** Only meaningful while the year is still running. */
  protected readonly live = computed(() => this.isCurrentYear() && this.forecast().live);

  /** Hours keep pace with money: the same run rate applied to the same days. */
  protected readonly projectedHours = computed(() => {
    const forecast = this.forecast();

    if (forecast.elapsed === 0) return this.summary().hours;

    return (this.summary().hours / forecast.elapsed) * (forecast.elapsed + forecast.remaining);
  });

  protected readonly projectedMinutes = computed(() => Math.round(this.projectedHours() * 60));

  /** Still to come: the projection minus what is already in the bank. */
  protected readonly stillAhead = computed(() =>
    Math.max(0, this.forecast().projected - this.forecast().earnedSoFar),
  );

  protected readonly monthsLeft = computed(() =>
    Math.max(0, 12 - (currentMonth().month - 1) - 1),
  );

  /** A full year at today's pace — what next year looks like if nothing changes. */
  protected readonly nextYearPace = computed(() => this.forecast().perDay * 365);

  protected readonly tier = computed(() => {
    const hours = this.live() ? this.projectedHours() : this.summary().hours;

    return TIERS.find((tier) => hours >= tier.hours) ?? TIERS[TIERS.length - 1];
  });

  // ==== Comparisons against last year ====

  protected readonly hoursChange = computed(() =>
    change(this.summary().hours, this.previous().hours),
  );
  protected readonly earnedChange = computed(() =>
    change(this.summary().total_earned, this.previous().total_earned),
  );
  protected readonly perDayChange = computed(() =>
    change(this.averages().perDay, this.before().perDay),
  );
  protected readonly perHourChange = computed(() =>
    change(this.averages().perHour, this.before().perHour),
  );
  protected readonly perShiftChange = computed(() =>
    change(this.averages().perShift, this.before().perShift),
  );
  protected readonly tipsPerDayChange = computed(() =>
    change(this.averages().tipsPerDay, this.before().tipsPerDay),
  );
  protected readonly salesPerDayChange = computed(() =>
    change(this.averages().salesPerDay, this.before().salesPerDay),
  );
  protected readonly shiftsChange = computed(() =>
    change(this.totalShifts(), countShifts(this.previous().days)),
  );

  // ==== Superlatives ====

  /** The shift placed most often — the one that defines the year. */
  protected readonly favouriteShift = computed(() => {
    const counts = new Map<
      string,
      { name: string; count: number; hours: number; symbol: string | null }
    >();

    for (const day of this.days()) {
      for (const entry of day.shifts) {
        if (!entry.worked) continue;

        const bucket = counts.get(entry.name) ?? {
          name: entry.name,
          count: 0,
          hours: 0,
          symbol: entry.symbol,
        };

        bucket.count += 1;
        bucket.hours += entry.hours;
        counts.set(entry.name, bucket);
      }
    }

    return [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  });

  protected readonly topPlace = computed(
    () => [...this.summary().by_location].sort((a, b) => b.earned - a.earned)[0] ?? null,
  );

  protected readonly topSale = computed(() => {
    const counts = new Map<string, { name: string; quantity: number; earned: number }>();

    for (const day of this.days()) {
      for (const entry of day.sales) {
        const bucket = counts.get(entry.name) ?? { name: entry.name, quantity: 0, earned: 0 };

        bucket.quantity += entry.quantity;
        bucket.earned += entry.earned;
        counts.set(entry.name, bucket);
      }
    }

    return [...counts.values()].sort((a, b) => b.quantity - a.quantity)[0] ?? null;
  });

  protected readonly busiestMonth = computed(() => {
    const totals = new Array(12).fill(0) as number[];

    for (const day of this.days()) totals[Number(day.date.slice(5, 7)) - 1] += day.earned;

    const best = totals.indexOf(Math.max(...totals));

    if (totals[best] === 0) return null;

    return {
      label: new Intl.DateTimeFormat(this.locale(), { month: 'long' }).format(
        new Date(this.year(), best, 1),
      ),
      earned: totals[best],
    };
  });

  /** Twelve bars of the year, scaled to the biggest month. */
  protected readonly monthBars = computed(() => {
    const totals = new Array(12).fill(0) as number[];

    for (const day of this.days()) totals[Number(day.date.slice(5, 7)) - 1] += day.earned;

    const peak = Math.max(...totals, 1);
    const initial = new Intl.DateTimeFormat(this.locale(), { month: 'narrow' });
    const full = new Intl.DateTimeFormat(this.locale(), { month: 'long' });

    return totals.map((value, index) => ({
      label: initial.format(new Date(this.year(), index, 1)),
      title: full.format(new Date(this.year(), index, 1)),
      value,
      // Floor of 2% so an empty month still shows a seat for its bar.
      height: Math.max(2, (value / peak) * 100),
      peak: value === peak && value > 0,
    }));
  });

  /** Which weekday carried the year. */
  protected readonly favouriteWeekday = computed(() => {
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const totals = new Array(7).fill(0) as number[];

    for (const day of this.days()) {
      if (!day.shifts.some((entry) => entry.worked)) continue;

      totals[(fromKey(day.date).getDay() + 6) % 7] += 1;
    }

    const best = totals.indexOf(Math.max(...totals));

    return totals[best] === 0 ? null : { name: names[best], count: totals[best] };
  });

  /**
   * The year as one grid, a cell a day. `favouriteWeekday` already names the
   * best day of the week, but a name cannot show a fortnight off in February or
   * a run of doubles in December — the shape of the year is the thing the page
   * is for, and it was the one thing it never drew.
   */
  protected readonly heatValues = computed(
    () => new Map(this.days().map((day) => [day.date, day.earned])),
  );

  protected readonly yearFrom = computed(() => `${this.year()}-01-01`);
  protected readonly yearTo = computed(() => `${this.year()}-12-31`);

  /**
   * All seven weekdays by what they earned, not just the winner. A Saturday
   * worth twice a Tuesday is the argument for asking for Saturdays, and that
   * only reads as a row you can compare across.
   */
  protected readonly weekdayRhythm = computed(() => {
    const totals = new Array(7).fill(0) as number[];

    for (const day of this.days()) totals[(fromKey(day.date).getDay() + 6) % 7] += day.earned;

    const peak = Math.max(...totals, 1);
    const names = new Intl.DateTimeFormat(this.locale(), { weekday: 'short' });

    return totals.map((value, index) => ({
      // 2026-01-05 was a Monday, so index 0 lands on Monday in every locale.
      label: names.format(new Date(2026, 0, 5 + index)),
      value,
      share: Math.max(2, (value / peak) * 100),
      peak: value === peak && value > 0,
    }));
  });

  /** Nights are anything starting at or after 20:00 — the hospitality shape. */
  protected readonly nightShare = computed(() => {
    let nights = 0;
    let all = 0;

    for (const day of this.days()) {
      for (const entry of day.shifts) {
        if (!entry.worked) continue;

        all += 1;

        const hour = Number(entry.start_time.slice(0, 2));

        if (hour >= 20 || hour < 5) nights += 1;
      }
    }

    return all === 0 ? 0 : (nights / all) * 100;
  });

  protected readonly earliestStart = computed(() => {
    let earliest: string | null = null;

    for (const day of this.days()) {
      for (const entry of day.shifts) {
        if (!entry.worked) continue;
        if (earliest === null || entry.start_time < earliest) earliest = entry.start_time;
      }
    }

    return earliest;
  });

  protected readonly best = computed(() => {
    const day = bestDay(this.days());

    return day === null ? null : { ...day, label: this.dayLabel(day.date) };
  });

  protected readonly week = computed(() => {
    const span = bestWeek(this.days());

    return span === null
      ? null
      : { ...span, label: `${this.dayLabel(span.from)} — ${this.dayLabel(span.to)}` };
  });

  protected readonly streak = computed(() => {
    const run = longestStreak(this.days());

    return run === null
      ? null
      : { ...run, label: `${this.dayLabel(run.from)} — ${this.dayLabel(run.to)}` };
  });

  /** Rest counts only up to today; December is not time off yet. */
  protected readonly rest = computed(() => {
    const year = this.year();
    const end = this.isCurrentYear() ? todayKey() : `${year}-12-31`;

    return restDays(this.days(), `${year}-01-01`, end);
  });

  /** Forty-hour weeks, the yardstick people compare a job against. */
  protected readonly fullTimeWeeks = computed(() => this.summary().hours / 40);

  /** Formats the count-up frames that are plain numbers rather than money. */
  protected readonly plain = (value: number): string =>
    Math.round(value).toLocaleString(this.locale());

  private dayLabel(key: string): string {
    return new Intl.DateTimeFormat(this.locale(), {
      day: 'numeric',
      month: 'short',
    }).format(fromKey(key));
  }

  protected shiftYear(delta: number): void {
    this.year.update((year) => year + delta);
  }
}
