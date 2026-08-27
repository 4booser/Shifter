'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { Rota, RotaEntry, Swap, swapApi } from '@/lib/api/team';
import { useI18n } from '@/lib/i18n';
import { pushToast } from '@/lib/toast';
import { Alert } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';
import { TimeAgo } from '@/components/ui/time-ago';

/**
 * Swaps, from the rota page: what is waiting for an answer, and the button
 * that starts a new trade. A cover asks somebody to take a shift; a swap
 * asks them to trade one — different promise, its own panel.
 */
export function SwapsPanel({ teamId, rota, onChanged }: { teamId: number; rota: Rota; onChanged: () => void }) {
  const { t, lang } = useI18n();
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [proposing, setProposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void swapApi.list(teamId).then(setSwaps).catch(() => setSwaps([]));
  }, [teamId]);

  useEffect(refresh, [refresh]);

  const pending = swaps.filter((swap) => swap.status === 'pending');
  const day = (key: string) =>
    new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(
      new Date(`${key}T00:00:00`),
    );

  const answer = (swap: Swap, accept: boolean) => {
    const call = accept ? swapApi.accept(teamId, swap.id) : swapApi.withdraw(teamId, swap.id);

    void call
      .then(() => {
        refresh();
        onChanged();
        pushToast({
          icon: accept ? '🤝' : '✋',
          title: accept ? t('Swapped') : t('Answered'),
          text: accept ? t('Place the shift you took on your calendar.') : undefined,
        });
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  return (
    <section className="card reveal p-3">
      <header className="mb-2 flex items-center gap-2">
        <h2 className="text-[0.95rem] font-bold">🤝 {t('Swaps')}</h2>
        {pending.length > 0 && <span className="chip">{pending.length}</span>}
        <button type="button" className="btn btn-sm ml-auto" onClick={() => setProposing(true)}>
          {t('Offer a swap')}
        </button>
      </header>

      {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {pending.length === 0 ? (
        <p className="field-hint">{t('Nothing waiting. Offer a trade and it appears here for both of you.')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {pending.map((swap) => (
            <li key={swap.id} className="flex flex-wrap items-center gap-2 rounded-(--radius) border border-border p-2 text-[0.85rem]">
              <span className="min-w-0 flex-1">
                <b>{swap.mine ? t('You') : swap.proposer_name}</b>: {day(swap.proposer_date)} «{swap.proposer_shift}»
                {' ⇄ '}
                <b>{swap.mine ? swap.target_name : t('you')}</b>: {day(swap.target_date)} «{swap.target_shift}»
                {swap.note !== null && <span className="field-hint block">«{swap.note}»</span>}
              </span>
              <TimeAgo iso={swap.created_at} />
              {swap.mine ? (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => answer(swap, false)}>
                  {t('Withdraw')}
                </button>
              ) : (
                <span className="flex gap-1.5">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => answer(swap, true)}>
                    {t('Agree')}
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => answer(swap, false)}>
                    {t('Decline')}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {proposing && (
        <ProposeModal
          teamId={teamId}
          rota={rota}
          onClose={() => setProposing(false)}
          onDone={() => {
            setProposing(false);
            refresh();
            pushToast({ icon: '🤝', title: t('Offer sent'), text: t('They decide now.') });
          }}
        />
      )}
    </section>
  );
}

function ProposeModal({
  teamId,
  rota,
  onClose,
  onDone,
}: {
  teamId: number;
  rota: Rota;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, lang } = useI18n();
  const [mine, setMine] = useState<number | null>(null);
  const [theirs, setTheirs] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const you = rota.members.find((member) => member.is_you) ?? null;
  const names = useMemo(
    () => new Map(rota.members.map((member) => [member.member_id, member.display_name])),
    [rota.members],
  );

  // Only what is still ahead: trading yesterday helps nobody.
  const today = new Date().toISOString().slice(0, 10);
  const ahead = rota.entries.filter((entry) => entry.date >= today && !entry.worked);
  const ours = ahead.filter((entry) => entry.member_id === you?.member_id);
  const others = ahead.filter((entry) => entry.member_id !== you?.member_id);

  const label = (entry: RotaEntry) =>
    `${new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${entry.date}T00:00:00`))} · ${entry.shift_name} ${entry.start_time.slice(0, 5)}–${entry.end_time.slice(0, 5)}`;

  const send = async () => {
    if (mine === null || theirs === null) return;

    setBusy(true);
    setError(null);

    try {
      await swapApi.propose(teamId, {
        my_day_shift_id: mine,
        their_day_shift_id: theirs,
        note: note.trim() === '' ? null : note.trim(),
      });
      onDone();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={t('Offer a swap')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error !== null && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

        <label>
          <span className="field-label">{t('I give')}</span>
          <select
            className="field-input w-full"
            value={mine ?? ''}
            onChange={(event) => setMine(Number(event.target.value) || null)}
          >
            <option value="">{t('pick one of your shifts')}</option>
            {ours.map((entry) => (
              <option key={entry.day_shift_id} value={entry.day_shift_id}>
                {label(entry)}
              </option>
            ))}
          </select>
          {ours.length === 0 && <p className="field-hint mt-1">{t('You have nothing planned ahead to trade.')}</p>}
        </label>

        <label>
          <span className="field-label">{t('I take')}</span>
          <select
            className="field-input w-full"
            value={theirs ?? ''}
            onChange={(event) => setTheirs(Number(event.target.value) || null)}
          >
            <option value="">{t('pick a colleague’s shift')}</option>
            {others.map((entry) => (
              <option key={entry.day_shift_id} value={entry.day_shift_id}>
                {names.get(entry.member_id) ?? '—'} · {label(entry)}
              </option>
            ))}
          </select>
          {others.length === 0 && <p className="field-hint mt-1">{t('Nobody else has a shift ahead in this window.')}</p>}
        </label>

        <label>
          <span className="field-label">{t('A word to them')}</span>
          <input
            className="field-input w-full"
            maxLength={200}
            placeholder={t('поменяемся? у меня в пятницу поезд')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <p className="field-hint">
          {t('When they agree, both shifts leave both calendars and each of you places the one you took — at your own rate.')}
        </p>

        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={busy || mine === null || theirs === null}
          onClick={() => void send()}
        >
          {t('Send the offer')}
        </button>
      </div>
    </Modal>
  );
}
