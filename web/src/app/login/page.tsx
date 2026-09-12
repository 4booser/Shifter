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
  const [peeking, setPeeking] = useState(false);
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

  /*
   * Looking costs nothing.
   *
   * The bank tab has had this for months and it is the only reason anybody
   * can see that page without handing over a token; the rest of the
   * application had no such door, so the only way to find out what it does
   * was to register and type in a month of one's own work first.
   */
  const [showing, setShowing] = useState(false);

  const show = async () => {
    if (showing || pending) return;

    setShowing(true);
    setError(null);

    try {
      await authApi.demo();
      router.replace('/dashboard');
    } catch (fault) {
      setError(apiErrorMessage(fault));
      setShowing(false);
    }
  };

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
            className="field-input text-center !text-[1.3rem] tracking-[0.4em] tabular"
            inputMode="numeric"
            autoFocus
            aria-label={t('Two-factor code')}
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
          <span className="relative block">
            <input
              className="field-input !pr-16"
              type={peeking ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {password !== '' && (
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[0.78rem] font-semibold text-muted hover:text-ink"
                onClick={() => setPeeking((was) => !was)}
              >
                {peeking ? t('Hide') : t('Show')}
              </button>
            )}
          </span>
        </label>

        <button type="submit" className="btn btn-primary mt-1 w-full" disabled={pending}>
          {pending ? t('Signing in…') : t('Sign in')}
        </button>

        <GoogleButton onCredential={google} />

        <button type="button" className="btn w-full" onClick={() => void show()} disabled={showing}>
          {showing ? t('Setting the example up…') : t('Look around on an example')}
        </button>
        <p className="-mt-1 text-center text-[0.8rem] text-muted">
          {t('Half a year of invented work, yours for two days. Nothing to fill in.')}
        </p>

        <p className="text-center text-[0.85rem] text-muted">
          {t('No account yet?')}{' '}
          <Link href="/register" className="font-semibold text-(--accent-read) hover:underline">
            {t('Create one')}
          </Link>
        </p>
        <p className="text-center text-[0.82rem]">
          <Link href="/reset" className="text-muted hover:text-(--accent-read) hover:underline">
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
