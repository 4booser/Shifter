'use client';

import { useEffect, useState } from 'react';

import { accountApi, CardSettings } from '@/lib/api/auth';
import { apiErrorMessage } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { pushToast } from '@/lib/toast';
import { Alert } from '@/components/ui/bits';

/**
 * The link to somebody's own record.
 *
 * Off, and it stays off until it is asked for: a work history is not a thing
 * to publish on somebody's behalf, however useful it would be to them. What it
 * shows is two more switches — where you worked and what you were paid are
 * exactly the two answers somebody might not want a stranger to have.
 *
 * Turning it off drops the link rather than hiding the page, which is worth
 * saying out loud on the screen: people reasonably assume a switch hides
 * something, and this one revokes it.
 */
export function CardSection() {
  const { t } = useI18n();

  const [state, setState] = useState<CardSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void accountApi.card().then(setState).catch(() => setState(null));
  }, []);

  if (state === null) return null;

  const link =
    state.slug === null
      ? null
      : `${typeof window === 'undefined' ? 'https://www.shifter.ink' : window.location.origin}/c/${state.slug}`;

  const save = (next: { on: boolean; show_places: boolean; show_money: boolean }) => {
    setBusy(true);
    setError(null);

    void accountApi
      .setCard(next)
      .then(setState)
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setBusy(false));
  };

  const share = async () => {
    if (link === null) return;

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'Shifter', url: link });

        return;
      } catch {
        // Cancelled — fall through to the clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      pushToast({ icon: '🔗', title: link });
    }
  };

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1 text-[0.98rem] font-bold">🔗 {t('A link to your record')}</h2>
      <p className="field-hint mb-3">
        {t('A page anybody can open without an account — for a manager who is not going to make one.')}
      </p>

      {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      <label className="flex items-center gap-2 text-[0.95rem] font-semibold">
        <input
          type="checkbox"
          checked={state.on}
          disabled={busy}
          onChange={(event) =>
            save({
              on: event.target.checked,
              show_places: state.show_places,
              show_money: state.show_money,
            })
          }
        />
        {t('Publish the link')}
      </label>

      {state.on && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="field-input min-w-0 flex-1 truncate !py-2 !text-[0.85rem]">{link}</code>
            <button type="button" className="btn btn-primary" onClick={() => void share()}>
              {copied ? `✓ ${t('copied')}` : t('Share')}
            </button>
            {link !== null && (
              <a className="btn btn-quiet" href={link} target="_blank" rel="noreferrer">
                {t('Open')}
              </a>
            )}
          </div>

          <p className="field-hint mt-2">
            {t('It shows months, shifts and hours. These two add more:')}
          </p>

          <label className="flex items-center gap-2 py-0.5 text-[0.95rem]">
            <input
              type="checkbox"
              checked={state.show_places}
              disabled={busy}
              onChange={(event) =>
                save({ on: true, show_places: event.target.checked, show_money: state.show_money })
              }
            />
            {t('Name the places')}
          </label>

          <label className="flex items-center gap-2 py-0.5 text-[0.95rem]">
            <input
              type="checkbox"
              checked={state.show_money}
              disabled={busy}
              onChange={(event) =>
                save({ on: true, show_places: state.show_places, show_money: event.target.checked })
              }
            />
            {t('Show the money')}
          </label>
        </>
      )}

      <p className="field-hint mt-3">
        {t('Switching it off does not hide the page — it destroys the link. Anybody you sent it to loses it, and switching back on makes a new one.')}
      </p>
    </section>
  );
}
