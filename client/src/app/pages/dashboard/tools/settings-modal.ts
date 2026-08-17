import { Component, inject, input, output } from '@angular/core';
import { TPipe } from '../../../core/i18n/i18n';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Icon } from '../../../shared/icon/icon';

import { LANGS } from '../../../core/i18n/i18n';
import { Reminders } from '../../../core/offline/reminders';
import {
  ACCENT_PRESETS,
  CURRENCY_PRESETS,
  CalendarView,
  Density,
  Language,
  SettingsStore,
  ThemeMode,
} from '../../../core/settings/settings-store';
import { Modal } from '../../../shared/modal/modal';

@Component({
  selector: 'app-settings-modal',
  imports: [TPipe, FormsModule, Modal, RouterLink, Icon],
  templateUrl: './settings-modal.html',
})
export class SettingsModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly store = inject(SettingsStore);
  private readonly reminders = inject(Reminders);

  protected readonly accents = ACCENT_PRESETS;
  protected readonly langs = LANGS;
  protected readonly currencies = CURRENCY_PRESETS;
  protected readonly settings = this.store.settings;
  protected readonly notifyPermission = this.reminders.permission;

  protected readonly themes: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  protected readonly densities: { value: Density; label: string }[] = [
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'compact', label: 'Compact' },
  ];

  protected readonly views: { value: CalendarView; label: string }[] = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
  ];

  protected setLanguage(value: Language): void {
    this.store.update('language', value);
  }

  protected setTheme(value: ThemeMode): void {
    this.store.update('theme', value);
  }

  protected setAccent(value: string): void {
    this.store.update('accent', value);
  }

  protected setCurrency(value: string): void {
    this.store.update('currency', value);
  }

  protected setDensity(value: Density): void {
    this.store.update('density', value);
  }

  protected setView(value: CalendarView): void {
    this.store.update('view', value);
  }

  protected toggleCurrencyBefore(): void {
    this.store.update('currencyBefore', !this.settings().currencyBefore);
  }

  protected toggleMondayFirst(): void {
    this.store.update('mondayFirst', !this.settings().mondayFirst);
  }

  protected toggleEarnings(): void {
    this.store.update('showEarningsInCells', !this.settings().showEarningsInCells);
  }

  protected toggle(
    key:
      | 'showShiftNamesInCells'
      | 'highlightWeekends'
      | 'reduceMotion'
      | 'confirmBulk'
      | 'hideAmounts'
      | 'glass'
      | 'remindUnclosed'
      | 'compactSidebar'
      | 'notifyUnclosed',
  ): void {
    this.store.update(key, !this.settings()[key]);
  }

  protected setRoundness(value: number): void {
    this.store.update('roundness', value);
  }

  /**
   * Turning it on has to ask the browser first: a switch that silently does
   * nothing because permission was never granted is worse than no switch.
   */
  protected async toggleNotifications(): Promise<void> {
    if (this.settings().notifyUnclosed) {
      this.store.update('notifyUnclosed', false);

      return;
    }

    const result = await this.reminders.request();

    if (result === 'granted') this.store.update('notifyUnclosed', true);
  }

  protected setNotifyAt(value: string): void {
    this.store.update('notifyAt', value);
  }

  protected setMotion(value: number): void {
    this.store.update('motionSpeed', value);
  }

  protected setFontScale(value: number): void {
    this.store.update('fontScale', value);
  }

  protected reset(): void {
    this.store.reset();
  }

  protected close(): void {
    this.closed.emit();
  }
}
