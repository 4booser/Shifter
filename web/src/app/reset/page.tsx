'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { passwordApi } from '@/lib/api/auth';
import { useI18n } from '@/lib/i18n';

export default function ResetPage() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}

/**
 * Two doors behind one address: without a token it asks where to send the
 * letter, with one it takes the new password. The "sent" screen says the
 * same thing whether or not the address is known — the server refuses to
 * enumerate accounts, and the page must not undo that.
 */
function Reset() {
  const { t } = useI18n();
  const params = useSearchParams();
  const token = params.get('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setError(null);

    try {
      await passwordApi.forgot(email.trim());
      setSent(true);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);

    try {
      await passwordApi.reset(token ?? '', password);
      setDone(true);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-(--bg) p-4">
      <div className="card w-full max-w-sm p-6">
        <p className="mb-4 flex items-center gap-2 text-[1.05rem] font-extrabold">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-(--accent) text-white">S</span>
          Shifter
        </p>

        {error !== null && <p className="mb-3 text-[0.88rem] text-danger-read">{error}</p>}

        {done ? (
          <>
            <h1 className="mb-1 text-[1.1rem] font-bold">{t('Password changed')}</h1>
            <p className="field-hint mb-4">{t('Sign in with the new one.')}</p>
            <Link href="/login" className="btn btn-primary w-full">
              {t('Sign in')}
            </Link>
          </>
        ) : token !== null ? (
          <>
            <h1 className="mb-1 text-[1.1rem] font-bold">{t('New password')}</h1>
            <p className="field-hint mb-3">{t('At least 8 characters. The link works once.')}</p>
            <input
              type="password"
              className="field-input mb-3 w-full"
              placeholder={t('New password')}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && password.length >= 8 && void finish()}
            />
            <button type="button" className="btn btn-primary w-full" disabled={busy || password.length < 8} onClick={() => void finish()}>
              {t('Save the password')}
            </button>
          </>
        ) : sent ? (
          <>
            <h1 className="mb-1 text-[1.1rem] font-bold">{t('Check the letter')}</h1>
            <p className="field-hint mb-4">
              {t('If that address belongs to an account, a link is on its way. It lives an hour and works once.')}
            </p>
            <Link href="/login" className="btn w-full">
              {t('Back to sign in')}
            </Link>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-[1.1rem] font-bold">{t('Forgot the password?')}</h1>
            <p className="field-hint mb-3">{t('Enter the address from your account and we will send a link.')}</p>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              className="field-input mb-3 w-full"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && email.includes('@') && void ask()}
            />
            <button type="button" className="btn btn-primary w-full" disabled={busy || !email.includes('@')} onClick={() => void ask()}>
              {t('Send the link')}
            </button>
            <Link href="/login" className="mt-3 block text-center text-[0.85rem] font-semibold text-(--accent-read)">
              {t('Back to sign in')}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
