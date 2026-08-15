import { DecimalPipe } from '@angular/common';
import { TPipe } from '../../../core/i18n/i18n';
import { Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { CalendarStore } from '../../../core/calendar/calendar-store';
import { SalesPosition } from '../../../core/calendar/calendar.models';
import { validationMessage } from '../../../core/forms/validation-message';
import { Modal } from '../../../shared/modal/modal';

@Component({
  selector: 'app-sales-modal',
  imports: [TPipe, ReactiveFormsModule, Modal, DecimalPipe],
  templateUrl: './sales-modal.html',
})
export class SalesModal {
  readonly open = input.required<boolean>();
  /** Null creates; a position edits it in place. */
  readonly editing = input<SalesPosition | null>(null);
  readonly closed = output<void>();

  private readonly store = inject(CalendarStore);
  private readonly builder = inject(FormBuilder);

  protected readonly fieldError = validationMessage;

  protected readonly title = computed(() =>
    this.editing() === null ? 'New sales position' : 'Edit position',
  );

  protected readonly form = this.builder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    price: [0, [Validators.required, Validators.min(0)]],
    // A share of the price, so 750 instead of 7.5 has to be rejected here as
    // well as on the server.
    percentage: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;

      const position = this.editing();

      this.form.reset(
        position === null
          ? { name: '', price: 0, percentage: 0 }
          : {
              name: position.name,
              price: position.price,
              percentage: position.percentage ?? 0,
            },
      );
    });
  }

  /** Shows what one unit is worth before anything is saved. */
  protected get perUnit(): number {
    const { price, percentage } = this.form.getRawValue();

    return (price * percentage) / 100;
  }

  protected close(): void {
    this.closed.emit();
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();

      return;
    }

    this.store.savePosition(
      this.form.getRawValue(),
      this.editing()?.id ?? null,
      () => this.closed.emit(),
    );
  }
}
