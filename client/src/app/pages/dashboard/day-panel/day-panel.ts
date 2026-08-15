import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { formatDayLabel } from '../../../core/calendar/calendar-date';
import { CalendarStore } from '../../../core/calendar/calendar-store';
import { NOTE_MAX_LENGTH } from '../../../core/calendar/calendar.models';
import { Icon } from '../../../shared/icon/icon';

/** Round numbers people actually get tipped, so the keyboard stays shut. */
const TIP_STEPS = [50, 100, 200, 500, 1000];

/** One, a few, a handful, a busy night. */
const QUANTITY_STEPS = [1, 3, 5, 10];

@Component({
  selector: 'app-day-panel',
  imports: [FormsModule, DecimalPipe, Icon],
  templateUrl: './day-panel.html',
})
export class DayPanel {
  private readonly store = inject(CalendarStore);

  protected readonly noteMaxLength = NOTE_MAX_LENGTH;
  protected readonly tipSteps = TIP_STEPS;
  protected readonly quantitySteps = QUANTITY_STEPS;

  protected readonly positions = this.store.positions;
  protected readonly templates = this.store.templates;
  protected readonly saving = this.store.saving;
  protected readonly day = this.store.selectedDay;

  protected readonly label = computed(() => {
    const key = this.store.selectedDate();

    return key === null ? null : formatDayLabel(key);
  });

  /** Draft state, so typing does not fire a request on every keystroke. */
  protected readonly quantities = signal<Record<number, number>>({});
  protected readonly tips = signal<number | null>(null);
  protected readonly note = signal<string>('');

  protected readonly shifts = computed(() => this.day()?.shifts ?? []);

  /** Draft of the worked flags, keyed by shift id. */
  protected readonly worked = signal<Record<number, boolean>>({});

  /** What the sales entered so far are worth, before saving. */
  protected readonly draftSales = computed(() => {
    const byId = new Map(this.positions().map((position) => [position.id, position]));
    let total = 0;

    for (const [id, quantity] of Object.entries(this.quantities())) {
      const position = byId.get(Number(id));

      if (position === undefined) continue;

      total += quantity * position.price * ((position.percentage ?? 0) / 100);
    }

    return total;
  });

  protected readonly dirty = computed(() => {
    const saved = this.day();
    const savedQuantities: Record<number, number> = {};

    for (const entry of saved?.sales ?? []) savedQuantities[entry.sales_id] = entry.quantity;

    const savedWorked: Record<number, boolean> = {};

    for (const entry of saved?.shifts ?? []) savedWorked[entry.shift_id] = entry.worked;

    const currentWorked = Object.fromEntries(
      (saved?.shifts ?? []).map((entry) => [entry.shift_id, this.isWorked(entry.shift_id)]),
    );

    const current = Object.fromEntries(
      Object.entries(this.quantities()).filter(([, quantity]) => quantity > 0),
    );

    return (
      JSON.stringify(currentWorked) !== JSON.stringify(savedWorked) ||
      JSON.stringify(current) !== JSON.stringify(savedQuantities) ||
      (this.tips() ?? null) !== (saved?.tips ?? null) ||
      this.note() !== (saved?.note ?? '')
    );
  });

  /** Which date the draft belongs to, so a reload cannot be mistaken for one. */
  private loadedFor: string | null = null;

  constructor() {
    // Only a change of date refills the inputs. Keying off the day object
    // instead would wipe whatever the user is typing every time an unrelated
    // save lands and the store hands out a new day map.
    effect(() => {
      const key = this.store.selectedDate();
      const day = this.day();

      if (key === this.loadedFor) return;

      this.loadedFor = key;

      const quantities: Record<number, number> = {};

      for (const entry of day?.sales ?? []) quantities[entry.sales_id] = entry.quantity;

      const worked: Record<number, boolean> = {};

      for (const entry of day?.shifts ?? []) worked[entry.shift_id] = entry.worked;

      this.quantities.set(quantities);
      this.worked.set(worked);
      this.tips.set(day?.tips ?? null);
      this.note.set(day?.note ?? '');
    });

    // Shifts can be painted onto the open day from the calendar, so the flags
    // have to pick up arrivals without clobbering the rest of the draft.
    effect(() => {
      const entries = this.day()?.shifts ?? [];

      this.worked.update((current) => {
        const next = { ...current };
        let changed = false;

        for (const entry of entries) {
          if (!(entry.shift_id in next)) {
            next[entry.shift_id] = entry.worked;
            changed = true;
          }
        }

        return changed ? next : current;
      });
    });
  }

  protected isWorked(shiftId: number): boolean {
    return this.worked()[shiftId] ?? false;
  }

  protected toggleWorked(shiftId: number): void {
    this.worked.update((current) => ({
      ...current,
      [shiftId]: !(current[shiftId] ?? false),
    }));
  }

  protected quantityOf(salesId: number): number {
    return this.quantities()[salesId] ?? 0;
  }

  protected setQuantity(salesId: number, value: number): void {
    this.quantities.update((current) => ({
      ...current,
      [salesId]: Number.isFinite(value) && value > 0 ? Math.floor(value) : 0,
    }));
  }

  protected bumpQuantity(salesId: number, by: number): void {
    this.setQuantity(salesId, this.quantityOf(salesId) + by);
  }

  protected bumpTips(by: number): void {
    this.tips.set((this.tips() ?? 0) + by);
  }

  protected clearTips(): void {
    this.tips.set(null);
  }

  protected save(): void {
    const key = this.store.selectedDate();

    if (key === null) return;

    this.store.saveDay(key, {
      shifts: (this.day()?.shifts ?? []).map((entry) => ({
        shift_id: entry.shift_id,
        worked: this.isWorked(entry.shift_id),
      })),
      // Zero quantities are dropped rather than stored as empty rows.
      sales: Object.entries(this.quantities())
        .map(([salesId, quantity]) => ({ sales_id: Number(salesId), quantity }))
        .filter((entry) => entry.quantity > 0),
      tips: this.tips(),
      note: this.note().trim() === '' ? null : this.note(),
    });
  }
}
