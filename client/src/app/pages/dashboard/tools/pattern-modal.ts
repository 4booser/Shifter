import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TPipe } from '../../../core/i18n/i18n';
import {
  addMonths,
  currentMonth,
  keysBetween,
  monthBounds,
  shiftDays,
  todayKey,
} from '../../../core/calendar/calendar-date';
import { CalendarStore } from '../../../core/calendar/calendar-store';
import { SettingsStore } from '../../../core/settings/settings-store';
import { Modal } from '../../../shared/modal/modal';

/**
 * Which shift belongs on which weekday. This is the shape most people actually
 * describe when asked what they work — "Tuesdays and Thursdays at the bar,
 * Saturdays at the café" — and the one the rota generator could not express:
 * it repeats a run of days on and days off, which says nothing about *which*
 * shift lands where.
 *
 * With a pattern set, the calendar's paint mode stops needing a template
 * picked first: clicking a day places whatever belongs on that weekday.
 */
/** Which stretch of calendar the pattern is poured over. */
export type PaintScope = 'month' | 'ahead' | 'range';

@Component({
  selector: 'app-pattern-modal',
  imports: [TPipe, FormsModule, Modal],
  templateUrl: './pattern-modal.html',
})
export class PatternModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly store = inject(CalendarStore);
  private readonly settings = inject(SettingsStore);

  protected readonly templates = this.store.templates;
  protected readonly hasPattern = this.settings.hasWeekdayPattern;
  protected readonly saving = this.store.saving;

  /**
   * Monday-first or Sunday-first as the person has it elsewhere, but the values
   * stay the numbers Date#getDay uses, so nothing downstream has to know which
   * way the list was ordered.
   */
  protected readonly weekdays = computed(() => {
    const labels = [
      { day: 1, label: 'Monday' },
      { day: 2, label: 'Tuesday' },
      { day: 3, label: 'Wednesday' },
      { day: 4, label: 'Thursday' },
      { day: 5, label: 'Friday' },
      { day: 6, label: 'Saturday' },
      { day: 0, label: 'Sunday' },
    ];

    return this.settings.mondayFirst() ? labels : [labels[6], ...labels.slice(0, 6)];
  });

  protected shiftFor(weekday: number): number | null {
    return this.settings.weekdayShifts()[weekday] ?? null;
  }

  protected setShift(weekday: number, value: string): void {
    this.settings.setWeekdayShift(weekday, value === '' ? null : Number(value));
  }

  protected clear(): void {
    this.settings.clearWeekdayShifts();
  }

  /** Turns painting on and gets out of the way, which is what people want next. */
  protected startPainting(): void {
    this.store.togglePatternBrush();
    this.closed.emit();
  }

  // ==== Filling a stretch at once ====

  /**
   * Clicking every working day is right when the weeks differ. When they do
   * not — the same five days, month after month — it is forty clicks to say
   * something the pattern already knows, so the pattern can be poured over a
   * stretch instead.
   */
  protected readonly scope = signal<PaintScope>('month');
  protected readonly from = signal(todayKey());
  protected readonly months = signal(3);

  protected readonly scopes: { value: PaintScope; label: string }[] = [
    { value: 'month', label: 'This month' },
    { value: 'ahead', label: 'Months ahead' },
    { value: 'range', label: 'Chosen dates' },
  ];

  protected readonly until = signal(shiftDays(todayKey(), 30));

  protected readonly dates = computed(() => {
    const scope = this.scope();

    if (scope === 'month') {
      const { year, month } = this.store.month();
      const bounds = monthBounds(`${year}-${`${month}`.padStart(2, '0')}-01`);

      return keysBetween(bounds.from, bounds.to);
    }

    // From today to the end of the last month asked for, rather than a count of
    // days: "three months ahead" means whole months, not ninety days.
    if (scope === 'ahead') {
      const target = addMonths(currentMonth(), this.months() - 1);
      const bounds = monthBounds(`${target.year}-${`${target.month}`.padStart(2, '0')}-01`);

      return keysBetween(todayKey(), bounds.to);
    }

    const from = this.from();
    const to = this.until();

    return to < from ? [] : keysBetween(from, to);
  });

  /** How many of those dates the pattern actually has something for. */
  protected readonly willPlace = computed(
    () => this.dates().filter((key) => this.store.patternTemplateFor(key) !== null).length,
  );

  protected fill(): void {
    const dates = this.dates();

    if (dates.length === 0 || this.willPlace() === 0) return;

    this.store.paintPattern(dates);
    this.closed.emit();
  }

  protected close(): void {
    this.closed.emit();
  }
}
