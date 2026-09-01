'use client';

import { useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { EMPLOYER_CHIPS, PendingReview, WORKER_CHIPS, reviewApi } from '@/lib/api/gigs';
import { useI18n } from '@/lib/i18n';
import { pushToast } from '@/lib/toast';
import { Alert } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';

/** ★★★★☆ 4.6 · 12 — the standing, wherever a person or venue appears. */
export function Stars({ rating, count, small = false }: { rating: number | null; count: number; small?: boolean }) {
  if (rating === null || count === 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-0.5 whitespace-nowrap font-semibold tabular ${small ? 'text-[0.72rem]' : 'text-[0.8rem]'}`}
      title={`${rating} / 5`}
    >
      <span className="text-warn" aria-hidden>
        {'★'.repeat(Math.round(rating))}
        <span className="opacity-30">{'★'.repeat(5 - Math.round(rating))}</span>
      </span>
      {rating} · {count}
    </span>
  );
}

/**
 * The debt collector, in the friendliest sense: after a worked shift both
 * sides owe each other a verdict, and this banner keeps offering until
 * every one is settled.
 */
export function PendingReviews({ onChanged }: { onChanged?: () => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [current, setCurrent] = useState<PendingReview | null>(null);

  const refresh = () => void reviewApi.pending().then(setPending).catch(() => setPending([]));

  useEffect(refresh, []);

  if (pending.length === 0) return null;

  return (
    <>
      <div className="card reveal flex flex-wrap items-center gap-2 border-warn/40 bg-(--warn-soft) p-3">
        <span className="text-[1.2rem]" aria-hidden>⭐</span>
        <p className="min-w-0 flex-1 text-[0.9rem]">
          <b>{t('A shift happened — rate it.')}</b>{' '}
          <span className="text-muted">
            {pending[0].by_employer ? t('How was') : t('How was working at')} <b>{pending[0].target_name}</b> («{pending[0].listing_title}»)?
          </span>
        </p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCurrent(pending[0])}>
          {t('Rate')}
        </button>
        {pending.length > 1 && <span className="chip">+{pending.length - 1}</span>}
      </div>

      {current !== null && (
        <ReviewModal
          pending={current}
          onClose={() => setCurrent(null)}
          onDone={() => {
            setCurrent(null);
            refresh();
            onChanged?.();
            pushToast({ icon: '⭐', title: t('Thank you'), text: t('The review is on their card now.') });
          }}
        />
      )}
    </>
  );
}

function ReviewModal({ pending, onClose, onDone }: { pending: PendingReview; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(5);
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vocabulary = pending.by_employer ? WORKER_CHIPS : EMPLOYER_CHIPS;

  const send = async () => {
    setBusy(true);
    setError(null);

    try {
      await reviewApi.send(pending.listing_id, {
        target_user_id: pending.target_user_id,
        rating,
        chips,
        text: text.trim() === '' ? null : text.trim(),
      });
      onDone();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`${t('Rate')}: ${pending.target_name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="field-hint">«{pending.listing_title}» · {pending.date.slice(8)}.{pending.date.slice(5, 7)}</p>
        {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

        <div className="flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star} / 5`}
              className={`text-[2.1rem] leading-none transition-transform hover:scale-110 ${star <= rating ? 'text-warn' : 'text-faint opacity-40'}`}
              onClick={() => setRating(star)}
            >
              ★
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-1.5">
          {vocabulary.map((chip) => (
            <button
              key={chip}
              type="button"
              className={`chip ${chips.includes(chip) ? 'chip-accent' : ''}`}
              onClick={() =>
                setChips((current) =>
                  current.includes(chip) ? current.filter((entry) => entry !== chip) : [...current, chip],
                )
              }
            >
              {t(`chip-${chip}`)}
            </button>
          ))}
        </div>

        <textarea
          className="field-input min-h-16 w-full"
          maxLength={300}
          placeholder={t('A line for the next person (optional)')}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />

        <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void send()}>
          {t('Send the review')}
        </button>
      </div>
    </Modal>
  );
}
