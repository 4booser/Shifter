import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { TPipe } from '../../core/i18n/i18n';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/auth/api-error';
import { Auth } from '../../core/auth/auth';
import { GoogleSignIn } from '../../core/auth/google-signin';
import { SettingsStore } from '../../core/settings/settings-store';
import { validationMessage } from '../../core/forms/validation-message';

@Component({
  selector: 'app-login',
  imports: [TPipe, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly google = inject(GoogleSignIn);
  private readonly settings = inject(SettingsStore);

  protected readonly googleHost =
    viewChild<ElementRef<HTMLElement>>('googleButton');

  protected readonly googleAvailable = this.google.clientId;
  /** Set when Google gave no name and we have to ask for one. */
  protected readonly needsName = signal<string | null>(null);
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');

  // Only "required" here: length and charset rules belong to registration, and
  // applying them would reject existing accounts created under older rules.
  protected readonly form = inject(FormBuilder).nonNullable.group({
    login: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly fieldError = validationMessage;

  constructor() {
    this.google.loadConfig();

    effect(() => {
      const host = this.googleHost()?.nativeElement;

      if (host === undefined || this.googleAvailable() === null) return;

      void this.google.render(
        host,
        (credential) => this.withGoogle(credential),
        this.settings.settings().theme === 'dark',
      );
    });
  }

  /** One call: an unknown Google account is created, a known one signs in. */
  protected withGoogle(credential: string, names?: boolean): void {
    this.pending.set(true);
    this.error.set(null);

    const payload = names
      ? {
          first_name: this.firstName().trim(),
          last_name: this.lastName().trim() || null,
        }
      : undefined;

    this.google.signIn(credential, payload).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl()),
      error: (error: unknown) => {
        this.pending.set(false);

        const message = apiErrorMessage(error);

        // The server only asks for a name when Google's profile had none.
        if (message.includes('First name')) {
          this.needsName.set(credential);

          return;
        }

        this.error.set(message);
      },
    });
  }

  protected submitName(): void {
    const credential = this.needsName();

    if (credential !== null && this.firstName().trim() !== '') {
      this.withGoogle(credential, true);
    }
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
