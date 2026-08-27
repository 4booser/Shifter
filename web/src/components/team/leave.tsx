'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { Leave, plannerApi } from '@/lib/api/team';
import { todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

/**
 * Asking for time off, and answering it.
 *
 * Deliberately separate from "I cannot work Tuesday". Blocking a day obliges
 * nobody; a fortnight in July needs a yes or a no, and the state that matters
 * most is the one in between — which is why waiting requests sit at the top and
 * say so, rather than being one grey row among the answered ones.
 */
export function LeavePanel({ teamId, onChanged }: { teamId: number; onChanged?: () => void }) {
  const { t, n } = useI18n();
  const [requests, setRequests] = useState<Leave[]>([]);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void plannerApi
      .leave(teamId)
      .then(setRequests)
      .catch(() => setRequests([]));
  }, [teamId]);

  useEffect(refresh, [refresh]);

  const run = (work: Promise<Leave[]>) => {
    setError(null);

    void work
      .then((next) => {
        setRequests(next);
        onChanged?.();
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const ask = () => {
    if (from === '' || to === '') return;

    setError(null);

    void plannerApi
      .requestLeave(teamId, from, to, reason.trim() === '' ? null : reason.trim())
      .then((next) => {
        setRequests(next);
        setOpen(false);
        setReason('');
        onChanged?.();
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const waiting = requests.filter((entry) => entry.status === 'pending');
  const answered = requests.filter((entry) => entry.status !== 'pending');

  return (
    <section className="card reveal p-4">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[0.98rem] font-bold">{t('Time off')}</h2>
        <button type="button" className="btn btn-sm" onClick={() => setOpen((was) => !was)}>
          {t(open ? 'Cancel' : 'Ask for days off')}
        </button>
      </header>

      {error && <Alert>{error}</Alert>}

      {open && (
        <div className="mb-3 flex flex-col gap-2.5 rounded-(--radius) border border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">{t('From')}</span>
              <input
                type="date"
                className="field-input"
                min={todayKey()}
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  // A single day is the common ask, and picking the same date
                  // twice is a chore nobody should be given.
                  if (to === '' || to < event.target.value) setTo(event.target.value);
                }}
              />
            </label>
            <label>
              <span className="field-label">{t('To')}</span>
              <input
                type="date"
                className="field-input"
                min={from === '' ? todayKey() : from}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>

          <label>
            <span className="field-label">{t('Why, if you want to say')}</span>
            <input
              className="field-input"
              maxLength={200}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="btn btn-primary self-end"
            disabled={from === '' || to === ''}
            onClick={ask}
          >
            {t('Send the request')}
          </button>
        </div>
      )}

      {requests.length === 0 && !open && (
        <p className="field-hint">{t('Nothing asked for yet.')}</p>
      )}

      <ul className="flex flex-col gap-1.5">
        {[...waiting, ...answered].map((entry) => (
          <li
            key={entry.id}
            className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-(--radius) border px-3 py-2 ${
              entry.status === 'pending'
                ? 'border-warn/40'
                : entry.status === 'approved'
                  ? 'border-good/30'
                  : 'border-border'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5 text-[0.88rem] font-medium">
                {entry.mine ? t('You') : entry.user_name}
                <span
                  className={`chip ${
                    entry.status === 'pending'
                      ? 'border-warn/40 text-warn'
                      : entry.status === 'approved'
                        ? 'border-good/40 text-good'
                        : 'text-muted'
                  }`}
                >
                  {t(
                    entry.status === 'pending'
                      ? 'Waiting'
                      : entry.status === 'approved'
                        ? 'Approved'
                        : 'Declined',
                  )}
                </span>
              </span>
              <span className="field-hint tabular">
                {entry.from === entry.to ? entry.from : `${entry.from} — ${entry.to}`} ·{' '}
                {n(entry.days, 'days')}
                {entry.reason !== null && ` · ${entry.reason}`}
              </span>
              {entry.decided_by !== null && (
                <span className="field-hint">
                  {entry.decided_by} · {entry.decided_on}
                  {entry.decision_note !== null && ` · ${entry.decision_note}`}
                </span>
              )}
            </span>

            {entry.can_decide && (
              <span className="flex gap-1.5">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => run(plannerApi.decideLeave(teamId, entry.id, true, null))}
                >
                  {t('Approve')}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => run(plannerApi.decideLeave(teamId, entry.id, false, null))}
                >
                  {t('Decline')}
                </button>
              </span>
            )}

            {entry.mine && (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                aria-label={t('Withdraw')}
                title={t('Withdraw')}
                onClick={() => run(plannerApi.withdrawLeave(teamId, entry.id))}
              >
                <Icon name="close" size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
