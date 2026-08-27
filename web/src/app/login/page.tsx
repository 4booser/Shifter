'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';

import { authApi } from '@/lib/api/auth';
import { apiErrorMessage } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { AuthCard } from '@/components/auth/auth-card';
import { GoogleButton } from '@/components/auth/google-button';
import { Alert } from '@/components/ui/bits';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Only same-site paths, so a crafted returnUrl cannot bounce users off-site. */
  const returnUrl = (() => {
    const target = params.get('returnUrl');

    if (!target || !target.startsWith('/') || target.startsWith('//')) return '/dashboard';

    return target;
  })();

  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (pending || login === '' || password === '') return;

    setPending(true);
    setError(null);

    try {
      const challenge = await authApi.login({ login, password });

      if (challenge !== null) {
        // Right password; the account wants its code now.
        setTicket(challenge);
        setPending(false);

        return;
      }

      router.replace(returnUrl);
    } catch (caught) {
      setError(apiErrorMessage(caught));
      setPending(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();

    if (pending || ticket === null || code.trim() === '') return;

    setPending(true);
    setError(null);

    try {
      await authApi.loginSecondFactor(ticket, code.trim());
      router.replace(returnUrl);
    } catch (caught) {
      setError(apiErrorMessage(caught));
      setPending(false);
    }
  };

  const google = async (credential: string) => {
    try {
      await authApi.googleSignIn(credential);
      router.replace(returnUrl);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  };

  return (
    <AuthCard title={t('Sign in')} subtitle={t('Welcome back to Shifter.')}>
      {ticket !== null ? (
        <form onSubmit={submitCode} className="flex flex-col gap-3.5" noValidate>
          {error && <Alert>{error}</Alert>}

          <p className="field-hint">{t('Enter the six digits from your authenticator, or an eight-digit backup code.')}</p>

          <input
            className="field-input text-center text-[1.3rem] tracking-[0.4em] tabular"
            inputMode="numeric"
            autoFocus
            maxLength={8}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          />

          <button type="submit" className="btn btn-primary w-full" disabled={pending || code.length < 6}>
            {pending ? t('Signing in…') : t('Confirm')}
          </button>

          <button type="button" className="btn btn-quiet w-full" onClick={() => { setTicket(null); setCode(''); }}>
            {t('Back')}
          </button>
        </form>
      ) : (
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        {error && <Alert>{error}</Alert>}

        <label>
          <span className="field-label">{t('Login')}</span>
          <input
            className="field-input"
            type="text"
            autoComplete="username"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
        </label>

        <label>
          <span className="field-label">{t('Password')}</span>
          <input
            className="field-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button type="submit" className="btn btn-primary mt-1 w-full" disabled={pending}>
          {pending ? t('Signing in…') : t('Sign in')}
        </button>

        <GoogleButton onCredential={google} />

        <p className="text-center text-[0.85rem] text-muted">
          {t('No account yet?')}{' '}
          <Link href="/register" className="font-semibold text-(--accent) hover:underline">
            {t('Create one')}
          </Link>
        </p>
        <p className="text-center text-[0.82rem]">
          <Link href="/reset" className="text-muted hover:text-(--accent) hover:underline">
            {t('Forgot the password?')}
          </Link>
        </p>
      </form>
      )}
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
