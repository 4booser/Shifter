import { TPipe } from '../../../core/i18n/i18n';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CalendarStore } from '../../../core/calendar/calendar-store';
import { MoneyPipe } from '../../../shared/money/money-pipe';
import { Icon } from '../../../shared/icon/icon';
import { Modal } from '../../../shared/modal/modal';

/**
 * A period the payment is being recorded against, handed in from the payout
 * calendar. Without it the modal defaults to whatever range is on screen, which
 * is right when opening it cold and wrong when the question was "this place,
 * this period, is it paid".
 */
export interface PayoutPrefill {
  locationId: number | null;
  from: string;
  to: string;
  /** What the period worked out to; the amount to confirm or correct. */
  expected: number;
  /**
   * Which of the place's payments is being settled. Carried from the row so a
   * transfer recorded against the commission is not also read as having paid
   * the wage for the days the two happen to share.
   */
  stream: 'all' | 'wage' | 'commission';
}

@Component({
  selector: 'app-payout-modal',
  imports: [TPipe, FormsModule, Modal, Icon, MoneyPipe],
  templateUrl: './payout-modal.html',
})
export class PayoutModal {
  readonly open = input.required<boolean>();
  readonly prefill = input<PayoutPrefill | null>(null);
  readonly closed = output<void>();
  /** Fires only when a payment was actually recorded, so callers can reload. */
  readonly saved = output<void>();

  private readonly store = inject(CalendarStore);

  protected readonly summary = this.store.summary;
  protected readonly payouts = this.store.payouts;

  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly amount = signal<number | null>(null);
  protected readonly received = signal('');
  protected readonly note = signal('');
  /** Which place paid; needed for the payout calendar to reconcile it. */
  protected readonly locationId = signal<number | null>(null);
  protected readonly locations = this.store.locations;

  /** How this payment compares with what the range worked out to. */
  protected readonly difference = computed(() => {
    const amount = this.amount();

    return amount === null ? null : amount - this.summary().total_earned;
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;

      this.received.set(new Date().toISOString().slice(0, 10));
      this.note.set('');

      const asked = this.prefill();

      // Opened against a specific period: the amount is filled in with what was
      // calculated, because confirming a figure is a glance and typing it again
      // is a chore that also invites a typo.
      if (asked !== null) {
        this.from.set(asked.from);
        this.to.set(asked.to);
        this.amount.set(asked.expected === 0 ? null : round(asked.expected));
        this.locationId.set(asked.locationId);

        return;
      }

      // Otherwise the period on screen, which is what is being reconciled.
      const range = this.store.summaryRangeValue();

      this.from.set(range.from);
      this.to.set(range.to);
      this.amount.set(null);

      // One place means there is nothing to choose; more than one and the
      // payment has to say who it came from or it reconciles against nothing.
      const places = this.store.locations();

      this.locationId.set(places.length === 1 ? places[0].id : null);
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
        location_id: this.locationId(),
        stream: this.prefill()?.stream ?? 'all',
      },
      () => {
        this.saved.emit();
        this.closed.emit();
      },
    );
  }
}

/** Money to two places; the input is a number field and rejects long tails. */
const round = (value: number): number => Math.round(value * 100) / 100;
