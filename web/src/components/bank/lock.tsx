'use client';

import { useEffect, useState } from 'react';

import { accountApi, authApi } from '@/lib/api/auth';
import { useI18n } from '@/lib/i18n';
import { Alert } from '@/components/ui/bits';

/**
 * The bank tab's own lock.
 *
 * What the calendar holds is how much somebody earns. What this tab holds is
 * where they were, what they bought and how much they have — a different
 * order of thing, worth its own door even on a machine where the app itself
 * is signed in.
 *
 * The browser has no Face ID, but it has the account password, and asking for
 * it once a session is the honest equivalent. Nothing new is stored: the
 * check is the same login call the front door uses, and the only thing kept
 * is a session flag that evaporates with the tab.
 */

const KEY = 'shifter.bank.lock';
const OPENED = 'shifter.bank.opened';

export const bankLockEnabled = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
};

export const setBankLock = (on: boolean): void => {
  try {
    if (on) window.localStorage.setItem(KEY, 'on');
    else window.localStorage.removeItem(KEY);

    window.sessionStorage.removeItem(OPENED);
  } catch {
    // Storage refusing is the lock refusing to exist, not a crash.
  }
};

export function BankLock({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking');
  const [login, setLogin] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    if (!bankLockEnabled() || window.sessionStorage.getItem(OPENED) === 'yes') {
      setState('open');

      return;
    }

    setState('locked');

    void accountApi.get().then((profile) => setLogin(profile.login)).catch(() => undefined);
  }, []);

  if (state === 'checking') return null;

  if (state === 'open') return <>{children}</>;

  return (
    <section className="card reveal mx-auto max-w-md p-4">
      <h2 className="mb-1 text-[1.05rem] font-bold">{t('The bank tab is locked')}</h2>
      <p className="field-hint mb-3">
        {t('Where you were and what you bought is a different order of private than a rota. The account password opens it for this session.')}
      </p>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();

          if (login === null || password === '') return;

          setBusy(true);
          setWrong(false);

          // The same call the front door makes. Nothing new to store and no
          // second password to invent — a wrong guess fails exactly as a
          // wrong login does, rate limit included.
          void authApi
            .login({ login, password })
            .then(() => {
              window.sessionStorage.setItem(OPENED, 'yes');
              setState('open');
            })
            .catch(() => setWrong(true))
            .finally(() => setBusy(false));
        }}
      >
        <input
          type="password"
          className="field-input flex-1"
          placeholder={t('Account password')}
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || password === ''}>
          {t('Open')}
        </button>
      </form>

      {wrong && <Alert kind="error">{t('That is not the password.')}</Alert>}
    </section>
  );
}
