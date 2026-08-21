import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TPipe } from '../../../core/i18n/i18n';
import {
  addMonths,
  currentMonth,
  keysBetween,
  monthBounds,
  todayKey,
} from '../../../core/calendar/calendar-date';
import { CalendarStore, schemeColourFor } from '../../../core/calendar/calendar-store';
import { MARK_COLOURS } from '../../../core/calendar/calendar.models';
import { ColourScheme, SettingsStore } from '../../../core/settings/settings-store';
import { Modal } from '../../../shared/modal/modal';

/** How far a scheme is laid down in one go. */
type SchemeScope = 'month' | 'ahead' | 'range';

/**
 * Saved ways of colouring a calendar. Two shapes, because people describe their
 * week in two different ways: some by weekday — "weekends green" — and some by
 * rotation, where 2/2 or 4/2 has nothing to do with which weekday it lands on
 * and everything to do with counting days from a start.
 *
 * A scheme is one or the other. Both at once would need a rule about which wins
 * and there is no answer to that anyone would remember.
 */
@Component({
  selector: 'app-scheme-modal',
  imports: [TPipe, FormsModule, Modal],
  templateUrl: './scheme-modal.html',
})
export class SchemeModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly store = inject(CalendarStore);
  private readonly settings = inject(SettingsStore);

  protected readonly colours = MARK_COLOURS;
  protected readonly schemes = this.settings.colourSchemes;
  protected readonly saving = this.store.saving;

  // ==== The scheme being edited ====

  protected readonly editingId = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly kind = signal<'weekday' | 'cycle'>('weekday');
  protected readonly byWeekday = signal<Partial<Record<number, string>>>({});
  protected readonly cycle = signal<(string | null)[]>([null, null, null, null]);
  protected readonly cycleFrom = signal(todayKey());

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

  protected readonly valid = computed(() => {
    if (this.name().trim().length === 0) return false;

    return this.kind() === 'weekday'
      ? Object.keys(this.byWeekday()).length > 0
      : this.cycle().some((colour) => colour !== null);
  });

  constructor() {
    effect(() => {
      if (this.open()) return;

      // Reset on close, so the next open starts on a new scheme rather than
      // half-way through the last one.
      this.editingId.set(null);
    });
  }

  protected startNew(): void {
    this.editingId.set(null);
    this.name.set('');
    this.kind.set('weekday');
    this.byWeekday.set({});
    this.cycle.set([null, null, null, null]);
    this.cycleFrom.set(todayKey());
  }

  protected edit(scheme: ColourScheme): void {
    this.editingId.set(scheme.id);
    this.name.set(scheme.name);
    this.kind.set(scheme.kind);
    this.byWeekday.set({ ...scheme.byWeekday });
    this.cycle.set([...scheme.cycle]);
    this.cycleFrom.set(scheme.cycleFrom);
  }

  protected remove(id: string): void {
    this.settings.deleteScheme(id);

    if (this.editingId() === id) this.startNew();
  }

  /** Clicking the colour already on a weekday clears that weekday. */
  protected setWeekday(day: number, colour: string): void {
    this.byWeekday.update((current) => {
      const next = { ...current };

      if (next[day] === colour) delete next[day];
      else next[day] = colour;

      return next;
    });
  }

  protected setCycleDay(index: number, colour: string): void {
    this.cycle.update((current) =>
      current.map((value, position) =>
        position === index ? (value === colour ? null : colour) : value,
      ),
    );
  }

  protected setCycleLength(length: number): void {
    const clamped = Math.max(2, Math.min(31, Math.round(length)));

    this.cycle.update((current) =>
      Array.from({ length: clamped }, (_, index) => current[index] ?? null),
    );
  }

  protected save(): void {
    if (!this.valid()) return;

    const scheme: ColourScheme = {
      // Time-based rather than a counter: schemes live in one browser, and a
      // counter would collide with itself after a reset.
      id: this.editingId() ?? `scheme-${Date.now()}`,
      name: this.name().trim(),
      kind: this.kind(),
      byWeekday: this.byWeekday(),
      cycle: this.cycle(),
      cycleFrom: this.cycleFrom(),
    };

    this.settings.saveScheme(scheme);
    this.editingId.set(scheme.id);
  }

  // ==== Laying it down ====

  protected readonly scope = signal<SchemeScope>('month');
  protected readonly months = signal(3);
  protected readonly from = signal(todayKey());
  protected readonly until = signal(todayKey());

  protected readonly scopes: { value: SchemeScope; label: string }[] = [
    { value: 'month', label: 'This month' },
    { value: 'ahead', label: 'Months ahead' },
    { value: 'range', label: 'Chosen dates' },
  ];

  protected readonly dates = computed(() => {
    const scope = this.scope();

    if (scope === 'month') {
      const { year, month } = this.store.month();
      const bounds = monthBounds(`${year}-${`${month}`.padStart(2, '0')}-01`);

      return keysBetween(bounds.from, bounds.to);
    }

    if (scope === 'ahead') {
      const target = addMonths(currentMonth(), this.months() - 1);
      const bounds = monthBounds(`${target.year}-${`${target.month}`.padStart(2, '0')}-01`);

      return keysBetween(todayKey(), bounds.to);
    }

    return this.until() < this.from() ? [] : keysBetween(this.from(), this.until());
  });

  /** The scheme currently in the form, whether or not it has been saved. */
  private readonly draft = computed<ColourScheme>(() => ({
    id: this.editingId() ?? 'draft',
    name: this.name(),
    kind: this.kind(),
    byWeekday: this.byWeekday(),
    cycle: this.cycle(),
    cycleFrom: this.cycleFrom(),
  }));

  /** How many of those days the scheme actually has something to say about. */
  protected readonly willPaint = computed(
    () =>
      this.dates().filter(
        (date) => schemeColourFor(this.draft(), date) !== undefined,
      ).length,
  );

  protected apply(): void {
    if (!this.valid() || this.willPaint() === 0) return;

    this.store.applyScheme(this.draft(), this.dates());
    this.closed.emit();
  }

  protected close(): void {
    this.closed.emit();
  }
}
