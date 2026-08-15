import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CalendarStore } from '../../../core/calendar/calendar-store';
import { Icon } from '../../../shared/icon/icon';
import { Modal } from '../../../shared/modal/modal';

@Component({
  selector: 'app-payout-modal',
  imports: [FormsModule, Modal, DecimalPipe, Icon],
  templateUrl: './payout-modal.html',
})
export class PayoutModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly store = inject(CalendarStore);

  protected readonly summary = this.store.summary;
  protected readonly payouts = this.store.payouts;

  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly amount = signal<number | null>(null);
  protected readonly received = signal('');
  protected readonly note = signal('');

  /** How this payment compares with what the range worked out to. */
  protected readonly difference = computed(() => {
    const amount = this.amount();

    return amount === null ? null : amount - this.summary().total_earned;
  });

  constructor() {
    // Defaults to the period on screen, which is what is being reconciled.
    effect(() => {
      if (!this.open()) return;

      const range = this.store.summaryRangeValue();

      this.from.set(range.from);
      this.to.set(range.to);
      this.received.set(new Date().toISOString().slice(0, 10));
      this.amount.set(null);
      this.note.set('');
    });
  }

  protected close(): void {
    this.closed.emit();
  }

  protected remove(id: number): void {
    this.store.deletePayout(id);
  }

  protected submit(): void {
    const amount = this.amount();

    if (amount === null || this.from() === '' || this.to() === '') return;

    this.store.createPayout(
      {
        period_from: this.from(),
        period_to: this.to(),
        amount,
        received_on: this.received(),
        note: this.note().trim() === '' ? null : this.note(),
      },
      () => this.closed.emit(),
    );
  }
}
