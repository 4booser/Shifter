'use client';

import { useState } from 'react';

import { useI18n } from '@/lib/i18n';
import { useMono } from '@/lib/mono/store';
import { Alert } from '@/components/ui/bits';

/**
 * Connecting the bank, and saying plainly where the token lives.
 *
 * The token reads somebody's entire statement, so the connect screen owes them
 * the exact truth: it goes from this browser to api.monobank.ua directly, the
 * Shifter server never sees it — and it is kept in this browser's storage,
 * which is not a phone's keychain, and that difference is stated rather than
 * papered over.
 */
export function BankConnect() {
  const { t } = useI18n();

  const connect = useMono((state) => state.connect);

  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<'refused' | 'failed' | null>(null);

  return (
    <section className="card reveal p-4">
      <h1 className="mb-1 text-[1.1rem] font-bold">{t('Connect monobank')}</h1>

      <p className="mb-3 text-[0.9rem] text-muted">
        {t('A read-only token from')}{' '}
        <a
          className="text-(--accent)"
          href="https://api.monobank.ua/"
          target="_blank"
          rel="noreferrer noopener"
        >
          api.monobank.ua
        </a>
        {'. '}
        {t('It goes from this browser straight to the bank — the Shifter server never sees it.')}
      </p>

      <div className="flex gap-2">
        <input
          className="field-input flex-1 font-mono !text-[0.82rem]"
          placeholder="u…"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || token.trim() === ''}
          onClick={() => {
            setBusy(true);
            setOutcome(null);

            void connect(token).then((result) => {
              setBusy(false);

              if (result !== 'ok') setOutcome(result);
            });
          }}
        >
          {t('Connect')}
        </button>
      </div>

      {outcome === 'refused' && (
        <Alert kind="error">{t('The bank refused this token. Check it was copied whole.')}</Alert>
      )}
      {outcome === 'failed' && (
        <Alert kind="error">{t('Could not reach the bank. Try again in a minute.')}</Alert>
      )}

      {/* Looking costs nothing: the demo draws a statement in this browser
          and involves no bank, which is the whole pitch of it. */}
      <button
        type="button"
        className="btn btn-quiet mt-3"
        onClick={() => useMono.getState().enterDemo()}
      >
        {t('Look around on an example')}
      </button>
      <p className="field-hint mt-1">
        {t('Ninety made-up days, drawn right here. No bank involved, nothing saved.')}
      </p>

      {/* The honest paragraph. Browser storage is not a keychain, and the
          person deciding whether to paste a bank token here is entitled to
          that sentence before they do it, not after. */}
      <div className="mt-4 flex flex-col gap-1.5 text-[0.82rem] text-muted">
        <p>— {t('The safest home for the statement is the phone app — there the token lives in the keychain. Pasting it here works too; it will not leave this browser.')}</p>
        <p>— {t('The token can only read. Nobody can move money with it.')}</p>
        <p>— {t('It is stored in this browser, not on our server. A browser is less protected than a phone’s keychain — on a shared computer, do not connect.')}</p>
        <p>— {t('One tap at api.monobank.ua revokes it; the button here erases it together with everything downloaded.')}</p>
      </div>
    </section>
  );
}
