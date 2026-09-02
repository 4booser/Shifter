'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { readSession } from '@/lib/api/http';
import { apiErrorMessage } from '@/lib/api/http';
import { teamApi } from '@/lib/api/team';
import { useI18n } from '@/lib/i18n';

export default function JoinPage() {
  return (
    <Suspense>
      <Join />
    </Suspense>
  );
}

/**
 * The invite link a code becomes: shifter.ink/join?code=ABCDEF. Signed out,
 * it routes through login and comes back; signed in, one button joins. A
 * pinned QR of this URL on the staff-room wall replaces dictating six
 * letters to each new colleague.
 */
function Join() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();

  const code = (params.get('code') ?? '').toUpperCase().slice(0, 12);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (readSession() === null) {
      router.replace(`/login?returnUrl=${encodeURIComponent(`/join?code=${code}`)}`);

      return;
    }

    setReady(true);
  }, [router, code]);

  if (!ready) return null;

  const join = () => {
    setBusy(true);
    setError(null);

    teamApi
      .join(code, name.trim() === '' ? null : name.trim())
      .then(() => router.replace('/schedule'))
      .catch((caught) => {
        setError(apiErrorMessage(caught));
        setBusy(false);
      });
  };

  return (
    <div className="auth-scene grid min-h-dvh place-items-center px-4 py-10">
      <div className="card rise glow w-full max-w-sm p-7 text-center">
        <span className="text-[2.4rem]">🤝</span>
        <h1 className="mt-2 text-[1.3rem] font-bold tracking-tight">{t('You are invited to a crew')}</h1>
        <p className="field-hint mb-4 mt-1">
          {t('Code')}: <strong className="tabular tracking-widest">{code || '—'}</strong>
        </p>

        <label className="mb-3 block text-left">
          <span className="field-label">{t('Name the crew sees (optional)')}</span>
          <input
            className="field-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
          />
        </label>

        {error !== null && <p className="mb-2 text-[0.85rem] text-danger-read">{error}</p>}

        <button type="button" className="btn btn-primary w-full" disabled={busy || code.length < 4} onClick={join}>
          {busy ? '…' : t('Join the crew')}
        </button>

        <button type="button" className="btn btn-quiet mt-2 w-full" onClick={() => router.replace('/dashboard')}>
          {t('Not now')}
        </button>
      </div>
    </div>
  );
}
