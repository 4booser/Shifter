'use client';

import { api, AuthResponse, clearSession, readSession, saveSession } from './http';

const AUTH = '/shifter/v1/auth';

export interface CurrentUser {
  id: number;
  login: string;
}

/** Mirrors ProfileDto. */
export interface Profile {
  id: number;
  login: string;
  first_name: string;
  last_name: string | null;
  has_password: boolean;
  google_linked: boolean;
  created_at: string;
  monthly_goal: number | null;
}

/**
 * Constraints enforced by RegisterHandler, mirrored so the form can reject bad
 * input before a round trip; the server remains the authority.
 */
export const LOGIN_MIN_LENGTH = 4;
export const LOGIN_MAX_LENGTH = 20;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 20;
export const ALLOWED_CHARS = /^[a-zA-Z0-9@._-]+$/;

export const authApi = {
  async register(request: {
    login: string;
    password: string;
    first_name: string;
    last_name: string | null;
  }): Promise<void> {
    saveSession(await api<AuthResponse>(`${AUTH}/user/register`, { body: request }));
  },

  async login(request: { login: string; password: string }): Promise<void> {
    saveSession(await api<AuthResponse>(`${AUTH}/user/login`, { body: request }));
  },

  async googleSignIn(
    credential: string,
    names?: { first_name: string; last_name: string | null },
  ): Promise<void> {
    saveSession(
      await api<AuthResponse>(`${AUTH}/google`, {
        body: {
          credential,
          first_name: names?.first_name ?? null,
          last_name: names?.last_name ?? null,
        },
      }),
    );
  },

  googleConfig: () => api<{ client_id: string | null }>(`${AUTH}/google/config`),

  me: () => api<CurrentUser>(`${AUTH}/me`),

  /**
   * Revokes the refresh token server-side, then clears the session. The local
   * clear happens either way: a failed call must not leave someone stuck
   * signed in on a shared machine.
   */
  logout(): void {
    const session = readSession();

    if (session !== null) {
      void api(`${AUTH}/logout`, { body: { refresh_token: session.refresh_token } }).catch(
        () => undefined,
      );
    }

    clearSession();
  },

  async logoutEverywhere(): Promise<void> {
    await api<{ revoked: number }>(`${AUTH}/logout/all`, { method: 'POST', body: {} });
    clearSession();
  },
};

export const accountApi = {
  get: () => api<Profile>('/shifter/v1/account'),
  update: (first_name: string, last_name: string | null) =>
    api<Profile>('/shifter/v1/account', { method: 'PUT', body: { first_name, last_name } }),
  changePassword: (current_password: string | null, new_password: string) =>
    api<Profile>('/shifter/v1/account/password', {
      method: 'PUT',
      body: { current_password, new_password },
    }),
  linkGoogle: (credential: string) =>
    api<Profile>('/shifter/v1/account/google', { body: { credential } }),
  unlinkGoogle: () => api<Profile>('/shifter/v1/account/google', { method: 'DELETE' }),
  remove: (password: string | null, confirm_login: string) =>
    api<void>('/shifter/v1/account', { method: 'DELETE', body: { password, confirm_login } }),
};
