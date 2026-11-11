'use client';

import { useI18n } from '@/lib/i18n';
import { SaveState } from '@/lib/roster/save-queue';
import { Icon } from '@/components/ui/icon';

/**
 * Where the saves stand, floating with the page, since a phone is usually
 * scrolled well past the top. It floats over whatever is there, the people
 * among them, so it takes no press but its own Try again, and once saved it
 * fades rather than sit on a name until the page is reloaded.
 */
export function SaveLine({ state, failure, onRetry }: { state: SaveState; failure: string | null; onRetry: () => void }) {
  const { t } = useI18n();

  return (
    <div className="pointer-events-none sticky top-16 z-20 -mb-3 h-0 self-end pr-2 pt-2">
      {state === 'failed' && (
        <span role="alert" className="card inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.8rem] text-danger-read">
          {t('Not saved')}
          <button type="button" title={failure ?? undefined} className="pointer-events-auto underline underline-offset-2" onClick={onRetry}>
            {t('Try again')}
          </button>
        </span>
      )}

      {(state === 'saving' || state === 'saved') && (
        <span
          role="status"
          className={`card inline-flex items-center gap-1 px-2.5 py-1 text-[0.8rem] text-muted ${state === 'saved' ? 'fade-away' : ''}`}
          title={t('Changes save on their own')}
        >
          <Icon name="check" size={12} className={state === 'saved' ? 'text-good-read' : ''} />
          {t(state === 'saved' ? 'Saved' : 'Saving…')}
        </span>
      )}
    </div>
  );
}
