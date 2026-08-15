import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TPipe } from '../../../core/i18n/i18n';
import { FormsModule } from '@angular/forms';

import { formatDayLabel, rotationKeys, todayKey } from '../../../core/calendar/calendar-date';
import { CalendarStore } from '../../../core/calendar/calendar-store';
import { Modal } from '../../../shared/modal/modal';

/** The shapes people actually name when asked what they work. */
const PRESETS = [
  { label: '2/2', on: 2, off: 2 },
  { label: '1/3', on: 1, off: 3 },
  { label: '5/2', on: 5, off: 2 },
  { label: '3/3', on: 3, off: 3 },
];

@Component({
  selector: 'app-rotation-modal',
  imports: [TPipe, FormsModule, Modal],
  templateUrl: './rotation-modal.html',
})
export class RotationModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly store = inject(CalendarStore);

  protected readonly presets = PRESETS;
  protected readonly templates = this.store.templates;
  protected readonly saving = this.store.saving;

  protected readonly templateId = signal<number | null>(null);
  protected readonly on = signal(2);
  protected readonly off = signal(2);
  protected readonly start = signal(todayKey());
  protected readonly span = signal(60);

  /** Recomputed live, so the count is visible before anything is written. */
  protected readonly dates = computed(() =>
    rotationKeys(this.start(), this.on(), this.off(), this.span()),
  );

  protected readonly preview = computed(() => {
    const keys = this.dates();

    if (keys.length === 0) return null;

    return {
      count: keys.length,
      first: formatDayLabel(keys[0]),
      last: formatDayLabel(keys[keys.length - 1]),
    };
  });

  protected readonly chosen = computed(() => {
    const id = this.templateId();

    return this.templates().find((template) => template.id === id) ?? null;
  });

  protected usePreset(on: number, off: number): void {
    this.on.set(on);
    this.off.set(off);
  }

  protected close(): void {
    this.closed.emit();
  }

  protected apply(): void {
    const template = this.chosen();
    const keys = this.dates();

    if (template === null || keys.length === 0) return;

    this.store.applyToDates(keys, template);
    this.closed.emit();
  }
}
