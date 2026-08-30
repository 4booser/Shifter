import { create } from 'zustand';

import { api, onAuthLost, Session, sessionStore, setSession } from '@/lib/api';

interface SessionState {
  /** null = signed out; undefined = still reading the keychain. */
  session: Session | null | undefined;
  hydrate: () => Promise<void>;
  signIn: (login: string, password: string) => Promise<'ok' | { ticket: string }>;
  /** The second half of a two-factor sign-in: six digits, or eight from the backup sheet. */
  completeTwoFactor: (ticket: string, code: string) => Promise<void>;
  register: (login: string, password: string, firstName: string, lastName: string) => Promise<void>;
  signOut: () => void;
}

export const useSession = create<SessionState>((set) => ({
  session: undefined,

  hydrate: async () => {
    onAuthLost(() => set({ session: null }));
    const stored = await sessionStore.load();

    setSession(stored);
    set({ session: stored });
  },

  signIn: async (login, password) => {
    const response = await api<Session & { two_factor_required?: boolean; ticket?: string }>(
      '/shifter/v1/auth/user/login',
      { body: { login, password } },
    );

    // The password held; the ticket is the claim check for the code screen.
    if (response.two_factor_required === true && response.ticket !== undefined)
      return { ticket: response.ticket };

    setSession(response);
    set({ session: response });

    return 'ok';
  },

  completeTwoFactor: async (ticket, code) => {
    const response = await api<Session>('/shifter/v1/auth/user/login/2fa', {
      body: { ticket, code: code.trim() },
    });

    setSession(response);
    set({ session: response });
  },

  register: async (login, password, firstName, lastName) => {
    const response = await api<Session>('/shifter/v1/auth/user/register', {
      body: { login, password, first_name: firstName, last_name: lastName },
    });

    setSession(response);
    set({ session: response });
  },

  signOut: () => {
    setSession(null);
    set({ session: null });
  },
}));
