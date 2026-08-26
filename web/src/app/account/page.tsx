'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Profile, accountApi, authApi } from '@/lib/api/auth';
import { api, apiErrorMessage, readSession } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/fx';
import { Shell } from '@/components/layout/shell';
import { GoogleButton } from '@/components/auth/google-button';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

export default function AccountPage() {
  return (
    <Shell>
      <Account />
    </Shell>
  );
}

/**
 * Everything about the account rather than the calendar: who you are, how you
 * sign in, and the two irreversible buttons behind a typed confirmation.
 */
function Account() {
  const revealHost = useReveal<HTMLDivElement>();
  const router = useRouter();
  const { t, lang } = useI18n();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [confirmLogin, setConfirmLogin] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  useEffect(() => {
    void accountApi
      .get()
      .then((data) => {
        setProfile(data);
        setFirstName(data.first_name);
        setLastName(data.last_name ?? '');
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  }, []);

  const run = async (call: Promise<Profile>, message: string, after?: () => void) => {
    setBusy(true);
    setError(null);
    setSaved(null);

    try {
      setProfile(await call);
      setSaved(t(message));
      after?.();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const needsPassword = profile?.has_password === false;
  const passwordsMatch = newPassword.length > 0 && newPassword === repeatPassword;
  const canDelete = profile !== null && confirmLogin === profile.login;

  const memberSince =
    profile === null
      ? ''
      : new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long' }).format(new Date(profile.created_at));

  return (
    <div ref={revealHost} className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-[1.3rem] font-bold tracking-tight">{t('Account')}</h1>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {saved && <Alert kind="good" onDismiss={() => setSaved(null)}>{saved}</Alert>}

      {profile !== null && (
        <>
          {/* ==== Who you are ==== */}
          <section className="card reveal p-4">
            <h2 className="mb-1 text-[0.98rem] font-bold">{t('Who you are')}</h2>
            <p className="field-hint mb-3">
              {t('Signing in as')} <strong>{profile.login}</strong> · {t('Member since')} {memberSince}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="field-label">{t('First name')}</span>
                <input className="field-input" maxLength={60} value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </label>
              <label>
                <span className="field-label">{t('Last name')}</span>
                <input className="field-input" maxLength={60} value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </label>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || firstName.trim() === ''}
                onClick={() => void run(accountApi.update(firstName.trim(), lastName.trim() || null), 'Saved')}
              >
                {t('Save')}
              </button>
            </div>
          </section>

          {/* ==== Password ==== */}
          <section className="card reveal p-4">
            <h2 className="mb-2 text-[0.98rem] font-bold">{t(needsPassword ? 'Set a password' : 'Change password')}</h2>

            {needsPassword ? (
              <p className="field-hint mb-2">{t('You sign in with Google. Add a password to get in without it.')}</p>
            ) : (
              <label className="mb-3 block">
                <span className="field-label">{t('Current password')}</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  className="field-input"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="field-label">{t('New password')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="field-input"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>
              <label>
                <span className="field-label">{t('Repeat it')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="field-input"
                  value={repeatPassword}
                  onChange={(event) => setRepeatPassword(event.target.value)}
                />
              </label>
            </div>
            <p className="field-hint mt-1">{t('At least 8 characters.')}</p>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !passwordsMatch || newPassword.length < 8}
                onClick={() =>
                  void run(
                    accountApi.changePassword(profile.has_password ? currentPassword : null, newPassword),
                    'Password changed. Other devices have been signed out.',
                    () => {
                      setCurrentPassword('');
                      setNewPassword('');
                      setRepeatPassword('');
                    },
                  )
                }
              >
                {t('Save')}
              </button>
            </div>
          </section>

          {/* ==== Sessions and Google ==== */}
          <section className="card reveal p-4">
            <h2 className="mb-2 text-[0.98rem] font-bold">{t('Sessions and sign-in')}</h2>

            <div className="mb-3 flex items-center gap-2 text-[0.9rem]">
              <span className="text-muted">Google:</span>
              {profile.google_linked ? (
                <>
                  <span className="chip border-good/40 text-good">{t('Connected')}</span>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={busy || !profile.has_password}
                    title={profile.has_password ? undefined : t('Set a password first, or Google is the only way in.')}
                    onClick={() => void run(accountApi.unlinkGoogle(), 'Google disconnected')}
                  >
                    {t('Disconnect')}
                  </button>
                </>
              ) : (
                <span className="chip">{t('Not connected')}</span>
              )}
            </div>

            {!profile.google_linked && (
              <div className="mb-3">
                <GoogleButton onCredential={(credential) => void run(accountApi.linkGoogle(credential), 'Google connected')} />
              </div>
            )}

            <button
              type="button"
              className="btn w-full"
              disabled={busy}
              onClick={() => {
                setBusy(true);

                void authApi
                  .logoutEverywhere()
                  .then(() => router.replace('/login'))
                  .catch((caught) => {
                    setError(apiErrorMessage(caught));
                    setBusy(false);
                  });
              }}
            >
              <Icon name="logout" size={14} />
              {t('Sign out everywhere')}
            </button>
          </section>

          <FeedSection />

          <ExportSection />

          {/* ==== Danger ==== */}
          <section className="card reveal border-danger/40 p-4">
            <h2 className="mb-1 text-[0.98rem] font-bold text-danger">{t('Delete the account')}</h2>
            <p className="field-hint mb-3">{t('Everything goes: days, shifts, places, history. There is no way back.')}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="field-label">{t('Type your login to confirm')}</span>
                <input className="field-input" value={confirmLogin} placeholder={profile.login} onChange={(event) => setConfirmLogin(event.target.value)} />
              </label>
              {profile.has_password && (
                <label>
                  <span className="field-label">{t('Password')}</span>
                  <input
                    type="password"
                    className="field-input"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="btn btn-danger border-danger/40"
                disabled={busy || !canDelete}
                onClick={() => {
                  setBusy(true);
                  setError(null);

                  void accountApi
                    .remove(profile.has_password ? deletePassword : null, confirmLogin)
                    .then(() => {
                      authApi.logout();
                      router.replace('/login');
                    })
                    .catch((caught) => {
                      setError(apiErrorMessage(caught));
                      setBusy(false);
                    });
                }}
              >
                <Icon name="trash" size={14} />
                {t('Delete for good')}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * The calendar-subscription block: one secret URL that Google or Apple
 * Calendar polls on its own. Money never travels through it, only names and
 * times — a subscribed calendar gets shared far more casually than a login.
 */
function FeedSection() {
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void api<{ token: string | null }>('/shifter/v1/feed')
      .then((response) => setToken(response.token))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  const url = token === null ? null : `${location.origin}/feed/${token}.ics`;

  const rotate = () =>
    void api<{ token: string }>('/shifter/v1/feed', { method: 'POST' }).then((response) =>
      setToken(response.token),
    );

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1 text-[0.98rem] font-bold">{t('Calendar subscription')}</h2>
      <p className="field-hint mb-3">
        {t('Your shifts appear in Google or Apple Calendar by themselves. Times and names travel; money never does.')}
      </p>

      {url === null ? (
        <button type="button" className="btn btn-primary" onClick={rotate}>
          {t('Turn the feed on')}
        </button>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <input readOnly className="field-input flex-1 !text-[0.78rem] tabular" value={url} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Icon name={copied ? 'check' : 'copy'} size={13} />
            </button>
          </div>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                if (window.confirm(t('A new link locks the old one out. Calendars subscribed to it stop updating.'))) rotate();
              }}
            >
              {t('New link')}
            </button>
            <button
              type="button"
              className="btn btn-sm text-danger"
              onClick={() => {
                if (window.confirm(t('Turn the feed off? Subscribed calendars go stale.'))) {
                  void api('/shifter/v1/feed', { method: 'DELETE' }).then(() => setToken(null));
                }
              }}
            >
              {t('Turn off')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** The walk-out button: the whole account as one ZIP, no questions asked. */
function ExportSection() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);

    try {
      const response = await fetch('/shifter/v1/account/export', {
        headers: { Authorization: `Bearer ${readSession()?.access_token ?? ''}` },
      });

      if (!response.ok) return;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `shifter-export-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1 text-[0.98rem] font-bold">{t('Your data')}</h2>
      <p className="field-hint mb-3">
        {t('One archive with everything: every day as JSON, the ledger as CSV. Yours to keep, any day.')}
      </p>
      <button type="button" className="btn" disabled={busy} onClick={() => void download()}>
        <Icon name="download" size={14} />
        {busy ? '…' : t('Download everything')}
      </button>
    </section>
  );
}
