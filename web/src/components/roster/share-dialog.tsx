'use client';

import { useState } from 'react';

import { useI18n } from '@/lib/i18n';
import { useArmed } from '@/lib/live/arm';
import { pushToast } from '@/lib/toast';
import { Icon } from '@/components/ui/icon';

/** The link, and what can be done to it. Both ways of ending it take a second press: the old address is sitting in a group chat and will not come back. */
export function ShareBody({
  slug,
  busy,
  onShare,
  onUnshare,
}: {
  slug: string | null;
  busy: boolean;
  onShare: () => void;
  onUnshare: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const renew = useArmed(onShare);
  const stop = useArmed(onUnshare);

  const url = slug === null ? '' : `${location.origin}/r/${slug}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      pushToast({ icon: '🔗', title: url });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.9rem]">{t('Anyone with the link sees the names and hours.')}</p>

      {slug === null ? (
        <button type="button" className="btn btn-primary self-start" disabled={busy} onClick={onShare}>
          <Icon name="link" size={14} />
          {t('Turn on the link')}
        </button>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              className="field-input min-w-0 flex-1 tabular"
              readOnly
              aria-label={t('The link')}
              value={url}
              onFocus={(event) => event.target.select()}
            />
            <button type="button" className="btn btn-primary" onClick={() => void copy()}>
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {t(copied ? 'Copied' : 'Copy')}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn btn-sm ${renew.armed ? 'btn-armed' : ''}`}
              disabled={busy}
              onClick={renew.press}
            >
              <Icon name="repeat" size={13} />
              {t(renew.armed ? 'Press again: the old link stops working' : 'Issue a new link')}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${stop.armed ? 'btn-armed' : ''}`}
              disabled={busy}
              onClick={stop.press}
            >
              <Icon name="ban" size={13} />
              {t(stop.armed ? 'Press again to turn it off' : 'Turn off')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
