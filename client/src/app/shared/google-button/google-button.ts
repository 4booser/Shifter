import { Component, ElementRef, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { apiErrorMessage } from '../../core/auth/api-error';
import { GoogleSignIn } from '../../core/auth/google-signin';
import { TPipe } from '../../core/i18n/i18n';
import { SettingsStore } from '../../core/settings/settings-store';

/**
 * One button for both entry points. Signing in and signing up with Google are
 * the same action — pick an account — and the server decides which one it was,
 * so duplicating the flow across two pages would only let them drift apart.
 *
 * Renders nothing at all when the server has no client id configured, rather
 * than a button that fails when pressed.
 */
@Component({
  selector: 'app-google-button',
  imports: [TPipe, FormsModule],
  template: `
    @if (available() !== null) {
      <div class="google-block">
        <div #host class="google-button"></div>

        @if (blocked()) {
          <!-- Google refuses to draw its button on an origin the client was
               not told about, and says nothing at all about it. Without this
               the page just shows a gap, which is impossible to diagnose from
               the outside. -->
          <p class="alert is-quiet" role="status">
            {{ 'Google will not sign in from this address.' | t }}
            <small>
              {{ 'Add' | t }} <code>{{ origin }}</code>
              {{ 'to Authorized JavaScript origins in the Google console.' | t }}
            </small>
          </p>
        }

        <span class="or-line"><span>{{ 'or' | t }}</span></span>
      </div>
    }

    @if (error(); as text) {
      <p class="alert" role="alert">{{ text }}</p>
    }

    @if (needsName() !== null) {
      <!-- Google hides the name on some accounts; the account is already
           created at this point, so this asks rather than starts over. -->
      <div class="name-prompt">
        <p class="field-hint">{{ 'Google did not share a name — add one to finish.' | t }}</p>

        <label class="field">
          <span class="field-label">{{ 'First name' | t }}</span>
          <input
            type="text"
            autocomplete="given-name"
            [ngModel]="firstName()"
            (ngModelChange)="firstName.set($event)"
            [ngModelOptions]="{ standalone: true }"
          />
        </label>

        <label class="field">
          <span class="field-label">{{ 'Last name' | t }}</span>
          <input
            type="text"
            autocomplete="family-name"
            [ngModel]="lastName()"
            (ngModelChange)="lastName.set($event)"
            [ngModelOptions]="{ standalone: true }"
          />
        </label>

        <button
          type="button"
          class="submit"
          [disabled]="pending() || firstName().trim() === ''"
          (click)="submitName()"
        >
          {{ 'Continue' | t }}
        </button>
      </div>
    }
  `,
})
export class GoogleButton {
  /** Where to land afterwards; the caller knows, this component does not. */
  readonly returnUrl = input('/dashboard');

  private readonly google = inject(GoogleSignIn);
  private readonly settings = inject(SettingsStore);
  private readonly router = inject(Router);

  private readonly host = viewChild<ElementRef<HTMLElement>>('host');

  protected readonly available = this.google.clientId;
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  /** True when Google declined to render, which it does without complaint. */
  protected readonly blocked = signal(false);

  /** Shown in that message, so the value to paste is on screen. */
  protected readonly origin = location.origin;

  /** Holds the credential while the missing name is being typed in. */
  protected readonly needsName = signal<string | null>(null);
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');

  constructor() {
    this.google.loadConfig();

    effect(() => {
      const element = this.host()?.nativeElement;

      if (element === undefined || this.available() === null) return;

      void this.google.render(
        element,
        (credential) => this.signIn(credential),
        this.settings.settings().theme === 'dark',
      );

      // The script resolves happily and then draws nothing when the origin is
      // unregistered, so the only way to notice is to look afterwards.
      setTimeout(() => this.blocked.set(element.childElementCount === 0), 2500);
    });
  }

  private signIn(credential: string, withNames = false): void {
    this.pending.set(true);
    this.error.set(null);

    const names = withNames
      ? { first_name: this.firstName().trim(), last_name: this.lastName().trim() || null }
      : undefined;

    this.google.signIn(credential, names).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl()),
      error: (error: unknown) => {
        this.pending.set(false);

        const message = apiErrorMessage(error);

        // The server asks for a name only when Google's profile carried none.
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
      this.signIn(credential, true);
    }
  }
}
