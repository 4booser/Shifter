'use client';

import { api, AuthResponse, clearSession, readSession, saveSession } from './http';

const AUTH = '/shifter/v1/auth';

export interface CurrentUser {
  id: number;
  login: string;
}

/** What the rule says should have been put aside by now. */
export interface TipJarState {
  /** The share, as a percent. Zero means the rule is off. */
  percent: number;
  goal: number;
  /** Tips earned since the rule started. */
  tips_since: number;
  /** The share of them: what should be in the jar. */
  saved: number;
  days: number;
  from: string | null;
  /** When the goal is reached at this pace, where that can be said at all. */
  reaches: string | null;
}

/** Mirrors ProfileDto. */
export interface Profile {
  email: string | null;
  avatar_kind: string | null;
  avatar_data: string | null;
  contact_phone: string | null;
  contact_telegram: string | null;
  id: number;
  login: string;
  first_name: string;
  last_name: string | null;
  has_password: boolean;
  google_linked: boolean;
  created_at: string;
  monthly_goal: number | null;
  /** Rest between shifts this person counts as enough, in hours. */
  rest_hours: number;
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
    /** Whoever's invite link brought them here; the server ignores unknown ones. */
    referral?: string | null;
  }): Promise<void> {
    saveSession(await api<AuthResponse>(`${AUTH}/user/register`, { body: request }));
  },

  async login(request: { login: string; password: string }): Promise<string | null> {
    const response = await api<AuthResponse | { two_factor_required: true; ticket: string }>(
      `${AUTH}/user/login`,
      { body: request },
    );

    // The password held but a code stands in the way: hand the ticket back
    // instead of a session, and the form asks its second question.
    if ('two_factor_required' in response) return response.ticket;

    saveSession(response);

    return null;
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
  /** The second half of a two-factor sign-in. */
  async loginSecondFactor(ticket: string, code: string): Promise<void> {
    saveSession(await api<AuthResponse>(`${AUTH}/user/login/2fa`, { body: { ticket, code } }));
  },

  twoFactorSetup: () => api<{ secret: string; otpauth_url: string }>(`${AUTH}/2fa/setup`, { method: 'POST', body: {} }),
  twoFactorEnable: (code: string) => api<{ backup_codes: string[] }>(`${AUTH}/2fa/enable`, { body: { code } }),
  twoFactorDisable: (code: string) => api<void>(`${AUTH}/2fa/disable`, { body: { code } }),

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

export const passwordApi = {
  /** Always resolves: the server refuses to say whether the address is known. */
  forgot: (email: string) =>
    api<{ dev_token?: string }>('/shifter/v1/auth/password/forgot', { body: { email } }),
  reset: (token: string, password: string) =>
    api<void>('/shifter/v1/auth/password/reset', { body: { token, password } }),
};

/** What the public card shows. `slug` is read-only: the server mints it. */
export interface CardSettings {
  on: boolean;
  show_places: boolean;
  show_money: boolean;
  slug: string | null;
}

export const accountApi = {
  card: () => api<CardSettings>('/shifter/v1/account/card'),
  setCard: (body: { on: boolean; show_places: boolean; show_money: boolean }) =>
    api<CardSettings>('/shifter/v1/account/card', { method: 'PUT', body }),
  referral: () => api<{ code: string; invited: number }>('/shifter/v1/account/referral'),
  setEmail: (email: string | null) =>
    api<{ email: string | null }>('/shifter/v1/account/avatar/email', { method: 'PUT', body: { email } }),
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
  /**
   * A share of tips put aside on paper. Nothing is moved — the app has no
   * business touching anybody's account.
   */
  tipJar: () => api<TipJarState>('/shifter/v1/auth/tip-jar'),
  setTipJar: (percent: number, goal: number) =>
    api<{ percent: number; goal: number }>('/shifter/v1/auth/tip-jar', {
      method: 'PUT',
      body: { percent, goal },
    }),
  /** The rest between shifts to be told about. Eleven is the EU daily rule. */
  setRest: (rest_hours: number) =>
    api<{ rest_hours: number }>('/shifter/v1/auth/rest', { method: 'PUT', body: { rest_hours } }),
  remove: (password: string | null, confirm_login: string) =>
    api<void>('/shifter/v1/account', { method: 'DELETE', body: { password, confirm_login } }),
};
