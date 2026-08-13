import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { apiErrorMessage } from '../../core/auth/api-error';
import { Auth } from '../../core/auth/auth';
import { CurrentUser } from '../../core/auth/auth.models';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
})
export class Home {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly user = signal<CurrentUser | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Proves the stored token is accepted by the API, not just present.
    this.auth.me().subscribe({
      next: (user) => this.user.set(user),
      error: (error: unknown) => this.error.set(apiErrorMessage(error)),
    });
  }

  protected logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
