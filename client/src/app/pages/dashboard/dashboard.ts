import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { apiErrorMessage } from '../../core/auth/api-error';
import { Auth } from '../../core/auth/auth';
import { CurrentUser } from '../../core/auth/auth.models';
import { CalendarStore } from '../../core/calendar/calendar-store';
import { MonthGrid } from './calendar/month-grid';
import { DayPanel } from './day-panel/day-panel';
import { Sidebar } from './sidebar/sidebar';
import { SettingsModal } from './tools/settings-modal';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'app-dashboard',
  imports: [MonthGrid, DayPanel, Sidebar, SettingsModal, Icon],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly store = inject(CalendarStore);

  protected readonly user = signal<CurrentUser | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly storeError = this.store.error;
  protected readonly settingsOpen = signal(false);

  constructor() {
    // Proves the stored token is accepted by the API, not merely present.
    this.auth.me().subscribe({
      next: (user) => this.user.set(user),
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  protected dismiss(): void {
    this.store.clearError();
  }

  protected logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
