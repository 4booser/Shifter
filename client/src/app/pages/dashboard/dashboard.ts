import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TPipe } from '../../core/i18n/i18n';
import { Router } from '@angular/router';

import { apiErrorMessage } from '../../core/auth/api-error';
import { Auth } from '../../core/auth/auth';
import { CurrentUser } from '../../core/auth/auth.models';
import { CalendarStore } from '../../core/calendar/calendar-store';
import { SettingsStore } from '../../core/settings/settings-store';
import { MonthGrid } from './calendar/month-grid';
import { DayPanel } from './day-panel/day-panel';
import { Sidebar } from './sidebar/sidebar';
import { SettingsModal } from './tools/settings-modal';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'app-dashboard',
  imports: [TPipe, MonthGrid, DayPanel, Sidebar, SettingsModal, Icon, RouterLink],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly store = inject(CalendarStore);
  protected readonly appearance = inject(SettingsStore);

  protected readonly user = signal<CurrentUser | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly storeError = this.store.error;
  protected readonly unclosed = this.store.unclosedDays;
  protected readonly remind = this.appearance.remindUnclosed;
  protected readonly dismissedReminder = signal(false);
  protected readonly settingsOpen = signal(false);

  constructor() {
    // Proves the stored token is accepted by the API, not merely present.
    this.auth.me().subscribe({
      next: (user) => this.user.set(user),
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  /** Opens the oldest unclosed day, which is the one most likely forgotten. */
  protected openUnclosed(): void {
    const days = this.unclosed();

    if (days.length > 0) this.store.select(days[days.length - 1].date);
  }

  protected togglePrivacy(): void {
    this.appearance.update('hideAmounts', !this.appearance.hideAmounts());
  }

  protected dismiss(): void {
    this.store.clearError();
  }

  protected logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
