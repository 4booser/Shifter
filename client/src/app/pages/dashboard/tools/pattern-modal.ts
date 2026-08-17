import { Component, computed, inject, input, output } from '@angular/core';

import { TPipe } from '../../../core/i18n/i18n';
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
@Component({
  selector: 'app-pattern-modal',
  imports: [TPipe, Modal],
  templateUrl: './pattern-modal.html',
})
export class PatternModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly store = inject(CalendarStore);
  private readonly settings = inject(SettingsStore);

  protected readonly templates = this.store.templates;
  protected readonly hasPattern = this.settings.hasWeekdayPattern;

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

  protected close(): void {
    this.closed.emit();
  }
}
