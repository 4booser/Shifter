'use client';

import { useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { Gig, KnownWorker, inviteApi } from '@/lib/api/gigs';
import { useI18n } from '@/lib/i18n';
import { pluralWord } from '@/lib/i18n/plural';
import { pushToast } from '@/lib/toast';
import { Alert } from '@/components/ui/bits';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { Stars } from '@/components/gigs/reviews';

/**
 * The shortcut every venue actually wants: skip the board, call the person
 * who already worked out. It only invites — the person still answers for
 * themselves, so nobody is booked behind their back.
 */
export function CallBack({ gig, onClose }: { gig: Gig; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [known, setKnown] = useState<KnownWorker[] | null>(null);
  const [invited, setInvited] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void inviteApi.known().then(setKnown).catch(() => setKnown([]));
  }, []);

  const call = (worker: KnownWorker) => {
    void inviteApi
      .invite(gig.id, worker.user_id)
      .then(() => {
        setInvited((current) => new Set(current).add(worker.user_id));
        pushToast({ icon: '👋', title: t('Called back'), text: `${worker.name} — ${t('a push is on its way')}` });
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  return (
    <Modal open title={`${t('Call somebody back')} — ${gig.title}`} onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

        {known === null && <p className="field-hint">{t('Loading…')}</p>}
        {known !== null && known.length === 0 && (
          <p className="field-hint">
            {t('Nobody has worked with you through the board yet — take somebody once, and they show up here.')}
          </p>
        )}

        {(known ?? []).map((worker) => (
          <div key={worker.user_id} className="flex items-center gap-2.5 rounded-(--radius) border border-border bg-surface p-2.5">
            <Avatar kind={worker.avatar_kind} data={worker.avatar_data} name={worker.name} size={36} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[0.9rem] leading-tight">{worker.name || t('Somebody')}</b>
              <span className="field-hint flex items-center gap-1.5">
                {worker.times_worked} {pluralWord(lang, 'shifts', worker.times_worked)} ·{' '}
                {new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(`${worker.last_worked}T00:00:00`))}
                <Stars rating={worker.rating} count={worker.rating_count} small />
              </span>
            </span>
            <button
              type="button"
              className={`btn btn-sm whitespace-nowrap ${invited.has(worker.user_id) ? '!border-good !text-good-read' : 'btn-primary'}`}
              disabled={invited.has(worker.user_id)}
              onClick={() => call(worker)}
            >
              {invited.has(worker.user_id) ? `✓ ${t('Called')}` : t('Call back')}
            </button>
          </div>
        ))}

        <p className="field-hint">{t('An invite is a nudge, not a booking — they still answer on the board.')}</p>
      </div>
    </Modal>
  );
}
