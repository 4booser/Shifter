import { create } from 'zustand';

import { api, onAuthLost, Session, sessionStore, setSession } from '@/lib/api';

interface SessionState {
  /** null = signed out; undefined = still reading the keychain. */
  session: Session | null | undefined;
  hydrate: () => Promise<void>;
  signIn: (login: string, password: string) => Promise<'ok' | 'two-factor'>;
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
    const response = await api<Session & { two_factor_required?: boolean }>(
      '/shifter/v1/auth/user/login',
      { body: { login, password } },
    );

    if (response.two_factor_required === true) return 'two-factor';

    setSession(response);
    set({ session: response });

    return 'ok';
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
