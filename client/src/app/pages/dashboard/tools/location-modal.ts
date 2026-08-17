import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { TPipe } from '../../../core/i18n/i18n';
import { FormsModule } from '@angular/forms';

import { CalendarStore } from '../../../core/calendar/calendar-store';
import {
  PAY_PERIODS,
  PayPeriodKind,
  WorkLocation,
} from '../../../core/calendar/calendar.models';
import { ACCENT_PRESETS } from '../../../core/settings/settings-store';
import { I18n } from '../../../core/i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { Modal } from '../../../shared/modal/modal';

@Component({
  selector: 'app-location-modal',
  imports: [TPipe, FormsModule, Modal, Icon],
  templateUrl: './location-modal.html',
})
export class LocationModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly store = inject(CalendarStore);
  private readonly i18n = inject(I18n);

  protected readonly periods = PAY_PERIODS;
  protected readonly colours = ACCENT_PRESETS;
  protected readonly locations = this.store.locations;
  protected readonly archived = this.store.archivedLocations;

  protected readonly editing = signal<WorkLocation | null>(null);
  protected readonly name = signal('');
  protected readonly address = signal('');
  protected readonly colour = signal('#1F3A5F');
  protected readonly period = signal<PayPeriodKind>('monthly');
  protected readonly payDay = signal(1);
  protected readonly anchor = signal('');
  protected readonly overtimeHours = signal(40);
  protected readonly overtimeMultiplier = signal(1.5);
  protected readonly tipOutTips = signal(0);
  protected readonly tipOutSales = signal(0);
  protected readonly mealDeduction = signal(0);

  protected readonly title = computed(() =>
    this.editing() === null ? 'New place of work' : 'Edit place',
  );

  /** Only the rolling periods need a reference date; the rest use a day number. */
  protected readonly needsAnchor = computed(
    () => this.period() === 'biweekly' || this.period() === 'weekly',
  );

  protected readonly needsPayDay = computed(() => this.period() === 'monthly');

  protected readonly taxPercent = signal(0);
  protected readonly taxTips = signal(false);
  protected readonly holidayPercent = signal(0);
  protected readonly currency = signal('');

  constructor() {
    effect(() => {
      if (!this.open()) return;

      this.reset();
    });
  }

  protected edit(location: WorkLocation): void {
    this.editing.set(location);
    this.name.set(location.name);
    this.address.set(location.address ?? '');
    this.colour.set(location.colour);
    this.period.set(location.pay_period);
    this.payDay.set(location.pay_day);
    this.anchor.set(location.pay_anchor);
    this.overtimeHours.set(location.overtime_weekly_hours);
    this.overtimeMultiplier.set(location.overtime_multiplier);
    this.tipOutTips.set(location.tip_out_of_tips_percent);
    this.tipOutSales.set(location.tip_out_of_sales_percent);
    this.mealDeduction.set(location.meal_deduction);
    this.taxPercent.set(location.tax_percent);
    this.taxTips.set(location.tax_tips);
    this.holidayPercent.set(location.holiday_percent);
    this.currency.set(location.currency);
  }

  protected remove(location: WorkLocation): void {
    if (window.confirm(`${location.name} — ${this.deletePrompt}`)) {
      this.store.deleteLocation(location.id);
    }
  }

  protected get deletePrompt(): string {
    return this.i18n.t('Delete this? It cannot be undone.');
  }

  protected archive(location: WorkLocation, archived: boolean): void {
    this.store.archiveLocation(location.id, archived);
  }

  protected submit(): void {
    if (this.name().trim() === '') return;

    this.store.saveLocation(
      {
        name: this.name(),
        address: this.address().trim() === '' ? null : this.address(),
        colour: this.colour(),
        pay_period: this.period(),
        pay_day: this.needsPayDay() ? this.payDay() : 1,
        pay_anchor: this.needsAnchor() && this.anchor() !== '' ? this.anchor() : null,
        overtime_weekly_hours: this.overtimeHours(),
        overtime_multiplier: this.overtimeMultiplier(),
        tip_out_of_tips_percent: this.tipOutTips(),
        tip_out_of_sales_percent: this.tipOutSales(),
        meal_deduction: this.mealDeduction(),
        tax_percent: this.taxPercent(),
        tax_tips: this.taxTips(),
        holiday_percent: this.holidayPercent(),
        currency: this.currency().trim() === '' ? null : this.currency().trim().toUpperCase(),
      },
      this.editing()?.id ?? null,
      () => this.reset(),
    );
  }

  protected close(): void {
    this.closed.emit();
  }

  private reset(): void {
    this.taxPercent.set(0);
    this.taxTips.set(false);
    this.holidayPercent.set(0);
    this.currency.set('');
    this.editing.set(null);
    this.name.set('');
    this.address.set('');
    this.colour.set('#1F3A5F');
    this.period.set('monthly');
    this.payDay.set(1);
    this.anchor.set(new Date().toISOString().slice(0, 10));
    this.overtimeHours.set(40);
    this.overtimeMultiplier.set(1.5);
    this.tipOutTips.set(0);
    this.tipOutSales.set(0);
    this.mealDeduction.set(0);
  }
}
