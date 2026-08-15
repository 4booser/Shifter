import { Component, computed, inject, signal } from '@angular/core';
import { TPipe } from '../../../core/i18n/i18n';

import {
  WEEKDAY_LABELS,
  todayKey,
  weekBounds,
  keysBetween as allKeys,
  WEEKDAY_LABELS_SUNDAY,
  keysBetween,
} from '../../../core/calendar/calendar-date';
import { CalendarStore } from '../../../core/calendar/calendar-store';
import { SettingsStore } from '../../../core/settings/settings-store';
import { Icon } from '../../../shared/icon/icon';
import { MoneyPipe } from '../../../shared/money/money-pipe';

@Component({
  selector: 'app-month-grid',
  imports: [TPipe, Icon, MoneyPipe],
  templateUrl: './month-grid.html',
})
export class MonthGrid {
  private readonly store = inject(CalendarStore);
  private readonly settings = inject(SettingsStore);

  protected readonly weekdays = computed(() =>
    this.settings.mondayFirst() ? WEEKDAY_LABELS : WEEKDAY_LABELS_SUNDAY,
  );
  protected readonly view = this.store.view;
  protected readonly yearMonths = this.store.yearMonths;
  protected readonly showEarnings = this.settings.showEarningsInCells;

  /** What the current week has earned so far — the number checked most often. */
  protected readonly weekEarned = computed(() => {
    const { from, to } = weekBounds(todayKey());
    const days = this.store.days();

    return allKeys(from, to).reduce(
      (total, key) => total + (days.get(key)?.earned ?? 0),
      0,
    );
  });

  protected earned(key: string): number {
    return this.store.days().get(key)?.earned ?? 0;
  }

  protected setView(value: 'week' | 'month' | 'year'): void {
    this.settings.update('view', value);
  }

  /** Jumping to a month from the year overview. */
  protected openMonth(month: number): void {
    this.settings.update('view', 'month');
    this.store.goToMonth(month);
  }
  protected readonly weeks = this.store.weeks;
  protected readonly label = this.store.label;
  protected readonly selected = this.store.selectedDate;
  protected readonly brush = this.store.brush;

  /** Where the drag started; null when no drag is in progress. */
  private readonly anchor = signal<string | null>(null);
  protected readonly dragging = signal<ReadonlySet<string>>(new Set());

  protected previous(): void {
    this.store.previous();
  }

  protected next(): void {
    this.store.next();
  }

  protected today(): void {
    this.store.today();
  }

  protected clearBrush(): void {
    this.store.clearBrush();
  }

  /**
   * A drag only makes sense with a template picked. Pointer capture is
   * deliberately not taken: the grid needs pointerenter on the other cells to
   * keep firing as the finger or cursor moves across them.
   */
  protected onPointerDown(key: string, event: PointerEvent): void {
    this.store.select(key);

    if (this.brush() === null) return;

    event.preventDefault();

    this.anchor.set(key);
    this.dragging.set(new Set([key]));
  }

  protected onPointerEnter(key: string): void {
    const from = this.anchor();

    if (from === null) return;

    this.dragging.set(new Set(keysBetween(from, key)));
  }

  /** Bound on the window so releasing outside the grid still commits. */
  protected onPointerUp(): void {
    const template = this.brush();
    const keys = [...this.dragging()];

    this.anchor.set(null);
    this.dragging.set(new Set());

    if (template === null || keys.length === 0) return;

    // Opt-in guard: a stray drag over a month is easy to do by accident.
    if (
      keys.length > 1 &&
      this.settings.confirmBulk() &&
      !window.confirm(`Apply "${template.name}" to ${keys.length} days?`)
    ) {
      return;
    }

    this.store.applyToDates(keys, template);
  }

  protected isDragged(key: string): boolean {
    return this.dragging().has(key);
  }

  /** Symbol plus name, so a cell says which shift and not merely that one exists. */
  protected marks(
    key: string,
  ): { symbol: string; name: string; worked: boolean; colour: string | null }[] {
    const day = this.store.days().get(key);

    if (day === undefined) return [];

    return day.shifts.map((entry) => ({
      symbol: entry.symbol ?? entry.name.slice(0, 1).toUpperCase() ?? '•',
      name: entry.name,
      worked: entry.worked,
      colour: entry.colour,
    }));
  }

  /** Planned hours matter too, so the cell shows whichever the day has. */
  protected hoursOf(key: string): number {
    const day = this.store.days().get(key);

    if (day === undefined) return 0;

    return day.shifts.reduce((total, entry) => total + entry.hours, 0);
  }


  /** Anything recorded beyond shifts: sales, tips or a note. */
  protected extras(key: string): boolean {
    const day = this.store.days().get(key);

    if (day === undefined) return false;

    return day.sales.length > 0 || (day.tips ?? 0) > 0 || !!day.note;
  }
}
