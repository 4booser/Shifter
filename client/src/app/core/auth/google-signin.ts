import { HttpClient } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { AuthResponse } from './auth.models';
import { AUTH_API } from './auth';
import { TokenStorage } from './token-storage';

/** The slice of Google Identity Services this app uses. */
interface GoogleAccounts {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

const SCRIPT = 'https://accounts.google.com/gsi/client';

@Service()
export class GoogleSignIn {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(TokenStorage);

  /** Null until the server says whether it is configured. */
  readonly clientId = signal<string | null>(null);
  readonly ready = signal(false);

  private loading: Promise<void> | null = null;

  /**
   * Asks the server for the client id rather than baking one into the bundle:
   * the same build then works against any deployment, and an unconfigured
   * server simply reports none and the button stays hidden.
   */
  loadConfig(): void {
    this.http
      .get<{ client_id: string | null }>(`${AUTH_API}/google/config`)
      .subscribe({
        next: (response) => {
          const id = response.client_id?.trim();

          if (id) this.clientId.set(id);
        },
        error: () => this.clientId.set(null),
      });
  }

  /** Loads Google's script once and draws its button into the given element. */
  async render(
    host: HTMLElement,
    onCredential: (credential: string) => void,
    dark: boolean,
  ): Promise<void> {
    const clientId = this.clientId();

    if (clientId === null) return;

    await this.loadScript();

    const google = window.google;

    if (google === undefined) return;

    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => onCredential(response.credential),
    });

    google.accounts.id.renderButton(host, {
      type: 'standard',
      theme: dark ? 'filled_black' : 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: host.clientWidth || 320,
    });

    this.ready.set(true);
  }

  /**
   * Exchanges the Google credential for a Shifter session. Names are only sent
   * on the retry, when Google's profile had none and the person typed them.
   */
  signIn(
    credential: string,
    names?: { first_name: string; last_name: string | null },
  ): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${AUTH_API}/google`, {
        credential,
        first_name: names?.first_name ?? null,
        last_name: names?.last_name ?? null,
      })
      .pipe(tap((response) => this.storage.save(response)));
  }

  /**
   * Attaches the picked Google account to the one already signed in. Uses the
   * same credential the sign-in button produces; only the endpoint differs.
   */
  link(credential: string): Observable<unknown> {
    return this.http.post('/shifter/v1/account/google', { credential });
  }

  private loadScript(): Promise<void> {
    this.loading ??= new Promise<void>((resolve, reject) => {
      if (window.google !== undefined) {
        resolve();

        return;
      }

      const script = document.createElement('script');

      script.src = SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Google sign-in failed to load.'));

      document.head.appendChild(script);
    });

    return this.loading;
  }
}
