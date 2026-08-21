import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/auth/api-error';
import { CalendarApi } from '../../core/calendar/calendar-api';
import { addMonths, currentMonth, todayKey } from '../../core/calendar/calendar-date';
import { PayPeriodRow, Reconciliation } from '../../core/calendar/calendar.models';
import { I18n, TPipe } from '../../core/i18n/i18n';
import { PayoutModal, PayoutPrefill } from '../dashboard/tools/payout-modal';
import { Icon } from '../../shared/icon/icon';
import { MoneyPipe } from '../../shared/money/money-pipe';

/** How far back the calendar looks by default. */
const MONTHS_BACK = 6;

/**
 * When money is due, from whom, and whether it arrived in full.
 *
 * Two places on different cycles is already more than anyone tracks reliably
 * in their head, which is exactly how a place that quietly pays a bit short
 * every month goes unnoticed for a year. Everything here is derived from data
 * the app already had — the point is putting it in one place.
 */
@Component({
  selector: 'app-payouts',
  imports: [DecimalPipe, RouterLink, TPipe, MoneyPipe, Icon, PayoutModal],
  templateUrl: './payouts.html',
})
export class Payouts {
  private readonly api = inject(CalendarApi);
  private readonly i18n = inject(I18n);

  protected readonly data = signal<Reconciliation | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** How many months back the view covers; forward always reaches next month. */
  protected readonly monthsBack = signal(MONTHS_BACK);

  /**
   * Recording a payment used to mean leaving this page, finding the button in
   * the calendar's sidebar and retyping the period and amount this page was
   * already showing. It is the one action the page exists to provoke, so it
   * belongs on the row that provokes it.
   */
  protected readonly payoutOpen = signal(false);
  protected readonly prefill = signal<PayoutPrefill | null>(null);

  protected recordPayment(row: PayPeriodRow): void {
    this.prefill.set({
      locationId: row.location_id,
      from: row.period_from,
      to: row.period_to,
      expected: row.expected,
      stream: row.stream,
    });

    this.payoutOpen.set(true);
  }

  /**
   * Bumped to refetch. The load lives in an effect keyed on the range, and a
   * payment recorded here changes the answer without changing the range.
   */
  private readonly reloadToken = signal(0);

  protected reload(): void {
    this.reloadToken.update((value) => value + 1);
  }

  constructor() {
    effect(() => {
      const back = this.monthsBack();

      this.reloadToken();
      const now = currentMonth();
      const start = addMonths(now, -back);

      this.loading.set(true);

      this.api
        .schedule(
          `${start.year}-${`${start.month}`.padStart(2, '0')}-01`,
          // One month ahead, so a period being worked right now shows up as
          // something to expect rather than disappearing off the end.
          this.endOfNextMonth(),
        )
        .subscribe({
          next: (response) => {
            this.data.set(response);
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.error.set(apiErrorMessage(error));
            this.loading.set(false);
          },
        });
    });
  }

  private endOfNextMonth(): string {
    const next = addMonths(currentMonth(), 2);
    const last = new Date(next.year, next.month - 1, 0);

    return `${last.getFullYear()}-${`${last.getMonth() + 1}`.padStart(2, '0')}-${`${last.getDate()}`.padStart(2, '0')}`;
  }

  protected readonly periods = computed(() => this.data()?.periods ?? []);
  protected readonly shortfalls = computed(() => this.data()?.shortfalls ?? []);

  /** Still to come, and the part of it that is already late. */
  protected readonly awaited = computed(() => this.data()?.awaited ?? 0);
  protected readonly overdue = computed(() => this.data()?.overdue ?? 0);

  /** What has gone missing in total — the number worth arguing about. */
  protected readonly missing = computed(() =>
    this.periods()
      .filter((row) => row.status === 'short')
      .reduce((total, row) => total + (row.expected - row.paid), 0),
  );

  protected readonly upcoming = computed(() =>
    this.periods()
      .filter((row) => row.status === 'due' || row.status === 'overdue' || row.status === 'open')
      .sort((a, b) => a.due_on.localeCompare(b.due_on)),
  );

  protected readonly settled = computed(() =>
    this.periods().filter(
      (row) => row.status === 'paid' || row.status === 'short' || row.status === 'over',
    ),
  );

  protected label(key: string): string {
    return new Intl.DateTimeFormat(this.i18n.lang(), {
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${key}T00:00:00`));
  }

  /** "in 3 days" / "5 days late", because a bare date needs mental arithmetic. */
  protected relative(row: PayPeriodRow): string {
    if (row.days_late > 0) {
      return `${row.days_late} ${this.i18n.t('days late')}`;
    }

    const days = Math.round(
      (new Date(`${row.due_on}T00:00:00`).getTime()
        - new Date(`${todayKey()}T00:00:00`).getTime())
        / 86_400_000,
    );

    if (days === 0) return this.i18n.t('today');
    if (days < 0) return this.label(row.due_on);

    return `${this.i18n.t('in')} ${days} ${this.i18n.t('days')}`;
  }

  /**
   * The badge for a row, or null where there is nothing to distinguish. Tested
   * for the two split values rather than against 'all', so a server that has
   * not been updated yet — where the field is simply absent — reads as one
   * payment rather than badging every row as a wage.
   */
  protected splitLabel(row: PayPeriodRow): string | null {
    if (row.stream === 'commission') return 'Commission';

    return row.stream === 'wage' ? 'Wage' : null;
  }

  protected statusLabel(status: PayPeriodRow['status']): string {
    switch (status) {
      case 'open':
        return 'Being worked';
      case 'due':
        return 'Expected';
      case 'overdue':
        return 'Late';
      case 'paid':
        return 'Settled';
      case 'short':
        return 'Underpaid';
      default:
        return 'Overpaid';
    }
  }

  protected more(): void {
    this.monthsBack.update((months) => months + 6);
  }
}
