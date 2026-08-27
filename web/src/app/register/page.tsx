'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import {
  ALLOWED_CHARS,
  LOGIN_MAX_LENGTH,
  LOGIN_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  authApi,
} from '@/lib/api/auth';
import { apiErrorMessage } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { AuthCard } from '@/components/auth/auth-card';
import { GoogleButton } from '@/components/auth/google-button';
import { Alert } from '@/components/ui/bits';

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [form, setForm] = useState({ login: '', password: '', first_name: '', last_name: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the checks in RegisterHandler so the user sees them immediately.
  const problem = (() => {
    if (form.login.length > 0 && (form.login.length < LOGIN_MIN_LENGTH || form.login.length > LOGIN_MAX_LENGTH)) {
      return t('Login must be 4–20 characters.');
    }

    if (form.login.length > 0 && !ALLOWED_CHARS.test(form.login)) {
      return t('Only letters, digits and @ . _ -');
    }

    if (
      form.password.length > 0 &&
      (form.password.length < PASSWORD_MIN_LENGTH || form.password.length > PASSWORD_MAX_LENGTH)
    ) {
      return t('Password must be 8–20 characters.');
    }

    return null;
  })();

  const ready =
    problem === null &&
    form.login.length >= LOGIN_MIN_LENGTH &&
    form.password.length >= PASSWORD_MIN_LENGTH &&
    form.first_name.trim() !== '' &&
    form.last_name.trim() !== '';

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (pending || !ready) return;

    setPending(true);
    setError(null);

    try {
      await authApi.register({
        ...form,
        last_name: form.last_name.trim() || null,
        // The invite that brought them, if any: read at submit so a refresh
        // on the way through the form cannot lose it.
        referral: new URLSearchParams(window.location.search).get('ref'),
      });
      router.replace('/dashboard');
    } catch (caught) {
      setError(apiErrorMessage(caught));
      setPending(false);
    }
  };

  const google = async (credential: string) => {
    try {
      await authApi.googleSignIn(credential);
      router.replace('/dashboard');
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  };

  const bind = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  return (
    <AuthCard title={t('Create an account')} subtitle={t('Your shifts, counted properly.')}>
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        {error && <Alert>{error}</Alert>}
        {problem && <Alert kind="info">{problem}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t('First name')}</span>
            <input className="field-input" type="text" maxLength={60} {...bind('first_name')} />
          </label>
          <label>
            <span className="field-label">{t('Last name')}</span>
            <input className="field-input" type="text" maxLength={60} {...bind('last_name')} />
          </label>
        </div>

        <label>
          <span className="field-label">{t('Login')}</span>
          <input className="field-input" type="text" autoComplete="username" {...bind('login')} />
        </label>

        <label>
          <span className="field-label">{t('Password')}</span>
          <input
            className="field-input"
            type="password"
            autoComplete="new-password"
            {...bind('password')}
          />
          <span className="field-hint mt-1 block">{t('At least 8 characters.')}</span>
        </label>

        <button type="submit" className="btn btn-primary mt-1 w-full" disabled={pending || !ready}>
          {pending ? t('Creating…') : t('Create account')}
        </button>

        <GoogleButton onCredential={google} />

        <p className="text-center text-[0.85rem] text-muted">
          {t('Already have an account?')}{' '}
          <Link href="/login" className="font-semibold text-(--accent) hover:underline">
            {t('Sign in')}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
