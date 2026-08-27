'use client';

import { useEffect, useState } from 'react';

import { accountApi } from '@/lib/api/auth';
import { useI18n } from '@/lib/i18n';
import { pluralWord } from '@/lib/i18n/plural';
import { pushToast } from '@/lib/toast';

/**
 * The invite link, and how many people came through it. A referral here is
 * a thank-you rather than a funnel: it counts arrivals and nothing about
 * them, and the link is minted only when somebody actually asks for one.
 */
export function ReferralSection() {
  const { t, lang } = useI18n();
  const [state, setState] = useState<{ code: string; invited: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void accountApi.referral().then(setState).catch(() => setState(null));
  }, []);

  if (state === null) return null;

  const link = `${typeof window === 'undefined' ? 'https://www.shifter.ink' : window.location.origin}/register?ref=${state.code}`;

  const share = async () => {
    const text = t('Shifter counts my shifts and my money. Try it:');

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'Shifter', text, url: link });

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
      <h2 className="mb-1 text-[0.98rem] font-bold">🤝 {t('Bring a colleague')}</h2>
      <p className="field-hint mb-3">
        {t('Your own link. Nothing about them ever reaches you — only the count.')}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <code className="field-input min-w-0 flex-1 truncate !py-2 text-[0.85rem]">{link}</code>
        <button type="button" className="btn btn-primary" onClick={() => void share()}>
          {copied ? `✓ ${t('copied')}` : t('Share')}
        </button>
      </div>

      <p className="mt-2 text-[0.9rem]">
        {state.invited === 0 ? (
          <span className="text-muted">{t('Nobody has come through it yet.')}</span>
        ) : (
          <>
            <b className="tabular">{state.invited}</b>{' '}
            <span className="text-muted">
              {pluralWord(lang, 'people', state.invited)} {t('arrived through your link')}
            </span>
          </>
        )}
      </p>
    </section>
  );
}
