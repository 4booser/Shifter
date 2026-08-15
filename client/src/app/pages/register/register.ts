import { Component, inject, signal } from '@angular/core';
import { TPipe } from '../../core/i18n/i18n';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/auth/api-error';
import { Auth } from '../../core/auth/auth';
import {
  ALLOWED_CHARS,
  LOGIN_MAX_LENGTH,
  LOGIN_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../core/auth/auth.models';
import { validationMessage } from '../../core/forms/validation-message';

@Component({
  selector: 'app-register',
  imports: [TPipe, ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
})
export class Register {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  // Mirrors the checks in RegisterHandler so the user sees them immediately.
  // last_name is nullable on the DTO but the handler rejects it when blank.
  protected readonly form = inject(FormBuilder).nonNullable.group({
    login: [
      '',
      [
        Validators.required,
        Validators.minLength(LOGIN_MIN_LENGTH),
        Validators.maxLength(LOGIN_MAX_LENGTH),
        Validators.pattern(ALLOWED_CHARS),
      ],
    ],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(PASSWORD_MIN_LENGTH),
        Validators.maxLength(PASSWORD_MAX_LENGTH),
        Validators.pattern(ALLOWED_CHARS),
      ],
    ],
    first_name: ['', [Validators.required]],
    last_name: ['', [Validators.required]],
  });

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly fieldError = validationMessage;

  protected submit(): void {
    if (this.pending()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();

      return;
    }

    this.pending.set(true);
    this.error.set(null);

    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: (error: unknown) => {
        this.pending.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }
}
