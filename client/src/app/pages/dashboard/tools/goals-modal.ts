import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { apiErrorMessage } from '../../../core/auth/api-error';
import { CalendarApi } from '../../../core/calendar/calendar-api';
import { Goal, GoalPeriod } from '../../../core/calendar/calendar.models';
import { I18n, TPipe } from '../../../core/i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { MoneyPipe } from '../../../shared/money/money-pipe';
import { Modal } from '../../../shared/modal/modal';

/**
 * Add, change and remove the amounts to aim for.
 *
 * A goal is a period plus an amount, and either standing — every month, every
 * day — or pinned to one period that is going to be different from the rest.
 * Both live in the same list because they are the same idea.
 */
@Component({
  selector: 'app-goals-modal',
  imports: [TPipe, FormsModule, Modal, Icon, MoneyPipe],
  templateUrl: './goals-modal.html',
})
export class GoalsModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();
  /** Fires when the list changed, so the page behind can refresh its meter. */
  readonly saved = output<void>();

  private readonly api = inject(CalendarApi);
  private readonly i18n = inject(I18n);

  protected readonly periods: { value: GoalPeriod; label: string }[] = [
    { value: 'day', label: 'A day' },
    { value: 'week', label: 'A week' },
    { value: 'month', label: 'A month' },
    { value: 'year', label: 'A year' },
  ];

  protected readonly goals = signal<Goal[]>([]);
  protected readonly error = signal<string | null>(null);

  protected readonly period = signal<GoalPeriod>('month');
  protected readonly dated = signal(false);
  protected readonly anchor = signal('');
  protected readonly amount = signal<number | null>(null);
  protected readonly note = signal('');

  protected readonly canSave = computed(() => {
    const amount = this.amount();

    if (amount === null || amount <= 0) return false;

    return !this.dated() || this.anchor() !== '';
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;

      this.reset();
      this.load();
    });
  }

  protected close(): void {
    this.closed.emit();
  }

  /** Names the stretch a goal covers, for the list. */
  protected scopeLabel(goal: Goal): string {
    const every: Record<GoalPeriod, string> = {
      day: 'Every day',
      week: 'Every week',
      month: 'Every month',
      year: 'Every year',
    };

    if (goal.anchor === null) return every[goal.period];

    // A pinned goal names its own period rather than repeating the rule.
    return `${goal.current_from} — ${goal.current_to}`;
  }

  protected edit(goal: Goal): void {
    this.period.set(goal.period);
    this.dated.set(goal.anchor !== null);
    this.anchor.set(goal.anchor ?? this.anchor());
    this.amount.set(goal.amount);
    this.note.set(goal.note ?? '');
  }

  protected remove(goal: Goal): void {
    if (!window.confirm(`${goal.amount} — ${this.i18n.t('Delete this? It cannot be undone.')}`)) {
      return;
    }

    this.api.deleteGoal(goal.id).subscribe({
      next: () => {
        this.load();
        this.saved.emit();
      },
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  protected submit(): void {
    const amount = this.amount();

    if (amount === null || amount <= 0) return;

    this.api
      .saveGoal({
        period: this.period(),
        amount,
        anchor: this.dated() ? this.anchor() : null,
        note: this.note().trim() === '' ? null : this.note().trim(),
      })
      .subscribe({
        next: () => {
          this.reset();
          this.load();
          this.saved.emit();
        },
        error: (error: unknown) => this.error.set(apiErrorMessage(error)),
      });
  }

  private load(): void {
    this.api.goals().subscribe({
      next: (goals) => this.goals.set(goals),
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  private reset(): void {
    this.error.set(null);
    this.period.set('month');
    this.dated.set(false);
    this.anchor.set(new Date().toISOString().slice(0, 10));
    this.amount.set(null);
    this.note.set('');
  }
}
