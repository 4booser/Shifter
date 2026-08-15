import { Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { CalendarStore } from '../../../core/calendar/calendar-store';
import {
  SALARY_PERIODS,
  EMOJI_GROUPS,
  SalaryPeriod,
  ShiftTemplate,
} from '../../../core/calendar/calendar.models';
import { validationMessage } from '../../../core/forms/validation-message';
import { Modal } from '../../../shared/modal/modal';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const DEFAULTS = {
  name: '',
  symbol: '',
  start_time: '09:00',
  end_time: '18:00',
  salary_period: 'hour' as SalaryPeriod,
  salary_amount: null as number | null,
  location_id: null as number | null,
};

@Component({
  selector: 'app-shift-modal',
  imports: [ReactiveFormsModule, Modal],
  templateUrl: './shift-modal.html',
})
export class ShiftModal {
  readonly open = input.required<boolean>();
  /** Null creates; a template edits it in place. */
  readonly editing = input<ShiftTemplate | null>(null);
  readonly closed = output<void>();

  private readonly store = inject(CalendarStore);
  private readonly builder = inject(FormBuilder);

  protected readonly periods = SALARY_PERIODS;
  protected readonly locations = this.store.locations;
  protected readonly emojiGroups = EMOJI_GROUPS;
  protected readonly fieldError = validationMessage;

  protected pickEmoji(emoji: string): void {
    this.form.controls.symbol.setValue(emoji);
  }

  protected readonly title = computed(() =>
    this.editing() === null ? 'New shift' : 'Edit shift',
  );

  protected readonly form = this.builder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(40)]],
    symbol: ['', [Validators.maxLength(8)]],
    start_time: ['09:00', [Validators.required, Validators.pattern(TIME_PATTERN)]],
    end_time: ['18:00', [Validators.required, Validators.pattern(TIME_PATTERN)]],
    salary_period: ['hour' as SalaryPeriod, [Validators.required]],
    salary_amount: [null as number | null, [Validators.min(0)]],
    location_id: [null as number | null],
  });

  constructor() {
    // Refills whenever the dialog opens, so a cancelled edit leaves nothing
    // behind for the next one.
    effect(() => {
      if (!this.open()) return;

      const template = this.editing();

      this.form.reset(
        template === null
          ? DEFAULTS
          : {
              name: template.name,
              symbol: template.symbol ?? '',
              start_time: template.start_time,
              end_time: template.end_time,
              salary_period: template.salary_period,
              salary_amount: template.salary_amount,
              location_id: template.location_id,
            },
      );
    });
  }

  protected pickPeriod(period: SalaryPeriod): void {
    this.form.controls.salary_period.setValue(period);
  }

  /** Weekly and monthly wages are paid per period, not per shift worked. */
  protected get periodHint(): string {
    switch (this.form.controls.salary_period.value) {
      case 'hour':
        return 'Multiplied by the hours of every shift you work.';
      case 'day':
        return 'A flat amount for each day this shift is on.';
      case 'week':
        return 'Counted once per week, however many shifts fall in it.';
      default:
        return 'Counted once per month, however many shifts fall in it.';
    }
  }

  protected close(): void {
    this.closed.emit();
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();

      return;
    }

    const value = this.form.getRawValue();

    this.store.saveShift(
      {
        name: value.name,
        // A blank input means no symbol, not an empty character.
        symbol: value.symbol === '' ? null : value.symbol,
        start_time: value.start_time,
        end_time: value.end_time,
        salary_period: value.salary_period,
        salary_amount: value.salary_amount,
        location_id: value.location_id,
      },
      this.editing()?.id ?? null,
      () => this.closed.emit(),
    );
  }
}
