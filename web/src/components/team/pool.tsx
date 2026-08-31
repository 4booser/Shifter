'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { Pool, plannerApi } from '@/lib/api/team';
import { todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { Alert, Money } from '@/components/ui/bits';

/**
 * The night's pool, entered once.
 *
 * Each person's share is already written on their own shift template, and each
 * of them currently types the pool in themselves — so by the morning five
 * people hold five slightly different numbers and an argument nobody can
 * settle, because there is nothing to settle it against.
 *
 * One number, entered by whoever counted the tin, and everybody's share falls
 * out of it. Who got what is visible to everyone who worked that shift: that is
 * not a hole in the privacy rules, it is the exact transparency a pool exists
 * for. A pool nobody can check is just a promise.
 */
export function PoolPanel({ teamId }: { teamId: number }) {
  const { t } = useI18n();

  const [date, setDate] = useState(todayKey());
  const [pool, setPool] = useState<Pool | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void plannerApi
      .pool(teamId, date)
      .then((answer) => {
        setPool(answer);
        setDraft(answer.amount === 0 ? '' : `${answer.amount}`);
      })
      .catch(() => setPool(null));
  }, [teamId, date]);

  useEffect(refresh, [refresh]);

  const save = () => {
    setError(null);

    void plannerApi
      .savePool(teamId, date, Number(draft.replace(',', '.')) || 0)
      .then((saved) => {
        setPool(saved);
        setEditing(false);
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  // Nobody on shift with a share means there is nothing to divide, and saying
  // so is more useful than drawing an empty table.
  const nobody = pool !== null && pool.shares.length === 0;

  return (
    <section className="card reveal p-4">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[0.98rem] font-bold">{t('The pool')}</h2>
          <p className="field-hint">
            {t('Counted once, split by the shares you already agreed.')}
          </p>
        </div>
        <input
          type="date"
          className="field-input w-auto"
          aria-label={t('Which day')}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className="field-label">{t('What the room took')}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              autoFocus
              className="field-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setDraft(pool?.amount === 0 ? '' : `${pool?.amount ?? ''}`);
              setEditing(false);
            }}
          >
            {t('Cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {t('That is the count')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-baseline gap-3 rounded-(--radius) border border-border px-3 py-2.5 text-left"
          onClick={() => setEditing(true)}
        >
          {pool !== null && pool.amount > 0 ? (
            <>
              <Money value={pool.amount} className="text-[1.5rem] font-extrabold" />
              {pool.entered_by !== null && (
                <span className="field-hint">
                  {t('counted by')} {pool.entered_by}
                </span>
              )}
            </>
          ) : (
            <span className="field-hint">
              {t('Nobody has counted it yet. Whoever holds the tin, put it in.')}
            </span>
          )}
        </button>
      )}

      {pool !== null && pool.amount > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          {nobody ? (
            <p className="field-hint">
              {t('Nobody on this day takes a share of the pool — their shifts say the tips are personal.')}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {pool.shares.map((share) => (
                  <li
                    key={share.user_id}
                    className={`flex flex-wrap items-baseline gap-x-2.5 rounded-(--radius) px-3 py-1.5 text-[0.88rem] ${
                      share.mine ? 'bg-(--accent-soft)' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {share.name}
                      {share.mine && <span className="field-hint"> · {t('you')}</span>}
                    </span>
                    <span className="field-hint tabular">{share.percent}%</span>
                    <Money value={share.amount} className="font-bold" />
                  </li>
                ))}
              </ul>

              {/* Not an error: a house often keeps a slice. But it should be
                  visible rather than quietly absorbed by the arithmetic. */}
              {pool.unallocated !== 0 && (
                <p className="field-hint mt-2">
                  {t('Not handed out:')} <Money value={pool.unallocated} />.{' '}
                  {t('Either the house keeps it, or somebody’s share is not set.')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
