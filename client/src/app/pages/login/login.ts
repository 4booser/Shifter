import { Component, inject, signal } from '@angular/core';
import { TPipe } from '../../core/i18n/i18n';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/auth/api-error';
import { Auth } from '../../core/auth/auth';
import { validationMessage } from '../../core/forms/validation-message';
import { GoogleButton } from '../../shared/google-button/google-button';

@Component({
  selector: 'app-login',
  imports: [TPipe, ReactiveFormsModule, FormsModule, RouterLink, GoogleButton],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  // Only "required" here: length and charset rules belong to registration, and
  // applying them would reject existing accounts created under older rules.
  protected readonly form = inject(FormBuilder).nonNullable.group({
    login: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly fieldError = validationMessage;

  /** Exposed for the Google button, which lands on the same place a form does. */
  protected returnPath(): string {
    return this.returnUrl();
  }

  protected submit(): void {
    if (this.pending()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();

      return;
    }

    this.pending.set(true);
    this.error.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl()),
      error: (error: unknown) => {
        this.pending.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  /** Only same-site paths, so a crafted returnUrl cannot bounce users off-site. */
  private returnUrl(): string {
    const target = this.route.snapshot.queryParamMap.get('returnUrl');

    if (!target || !target.startsWith('/') || target.startsWith('//')) return '/dashboard';

    return target;
  }
}
