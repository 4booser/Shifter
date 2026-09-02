'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { Handover, plannerApi, StopItem } from '@/lib/api/team';
import { todayKey } from '@/lib/calendar/calendar-date';
import { useI18n } from '@/lib/i18n';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

/**
 * The handover.
 *
 * Everything the shift going home knows currently reaches the shift coming in
 * through a guest, half an hour in: the burrata ran out at eight, the grinder
 * makes a noise, there is a table of twenty at nine. One note per crew per day,
 * because a chat scrolls and a handover has to be the thing you read once and
 * act on — and it carries a name, because a handover with nobody's name on it
 * is a rumour.
 *
 * The stop list is deliberately not attached to a day. "Мартини закончился" is
 * true until somebody says it is not, and a list that resets at midnight is a
 * list nobody trusts.
 */
export function HandoverPanel({ teamId }: { teamId: number }) {
  const { t, n } = useI18n();

  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState<Handover | null>(null);
  const [stops, setStops] = useState<StopItem[]>([]);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<'stop' | 'broken' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void plannerApi
      .handover(teamId, date)
      .then((answer) => {
        setNote(answer.note);
        setStops(answer.stops);
        setDraft(answer.note.text);
      })
      .catch(() => {
        setNote(null);
        setStops([]);
      });
  }, [teamId, date]);

  useEffect(refresh, [refresh]);

  const save = () => {
    setError(null);

    void plannerApi
      .writeHandover(teamId, date, draft)
      .then((saved) => {
        setNote(saved);
        setEditing(false);
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const raise = () => {
    if (adding === null || name.trim() === '') return;

    setError(null);

    void plannerApi
      .raiseStop(teamId, adding, name.trim())
      .then((next) => {
        setStops(next);
        setName('');
        setAdding(null);
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const clear = (id: number) => {
    void plannerApi
      .clearStop(teamId, id)
      .then(setStops)
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  return (
    <section className="card reveal p-4">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[0.98rem] font-bold">{t('Handover')}</h2>
          <p className="field-hint">
            {t('What the shift going home knows and the one coming in does not.')}
          </p>
        </div>
        <input
          type="date"
          className="field-input !w-auto"
          aria-label={t('Which day')}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            className="field-input min-h-24"
            maxLength={1000}
            placeholder={t('Kitchen out of burrata since eight. Grinder makes a noise. Table of twenty at nine.')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setDraft(note?.text ?? '');
                setEditing(false);
              }}
            >
              {t('Cancel')}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>
              {t('Leave it for the next shift')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="w-full rounded-(--radius) border border-border px-3 py-2.5 text-left"
          onClick={() => setEditing(true)}
        >
          {note !== null && note.text !== '' ? (
            <>
              <span className="block whitespace-pre-wrap text-[0.9rem]">{note.text}</span>
              {note.by !== null && (
                <span className="field-hint mt-1 block">
                  {note.by} · {note.updated_at?.slice(11, 16)}
                </span>
              )}
            </>
          ) : (
            <span className="field-hint">{t('Nothing left for this day. Write it now, before you forget.')}</span>
          )}
        </button>
      )}

      {/* ==== What the room is missing ==== */}
      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-[0.88rem] font-bold">{t('Out and broken')}</h3>
          <span className="flex gap-1.5">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => setAdding(adding === 'stop' ? null : 'stop')}
            >
              {t('Ran out')}
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => setAdding(adding === 'broken' ? null : 'broken')}
            >
              {t('Broken')}
            </button>
          </span>
        </div>

        {adding !== null && (
          <div className="mb-2 flex gap-2">
            <input
              className="field-input"
              maxLength={80}
              autoFocus
              aria-label={t(adding === 'stop' ? 'What ran out' : 'What is broken')}
              placeholder={t(adding === 'stop' ? 'Martini' : 'Coffee grinder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') raise();
              }}
            />
            <button type="button" className="btn btn-primary" disabled={name.trim() === ''} onClick={raise}>
              {t('Add')}
            </button>
          </div>
        )}

        {stops.length === 0 ? (
          <p className="field-hint">{t('Nothing missing. Long may it last.')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {stops.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-(--radius) border border-border px-3 py-1.5 text-[0.86rem]"
              >
                <span className={`chip ${item.kind === 'broken' ? 'chip-warn' : ''}`}>
                  {t(item.kind === 'broken' ? 'Broken' : 'Out')}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                {/* Three weeks broken is a different conversation from this
                    morning, and only the number says which. */}
                <span className="field-hint">
                  {item.raised_by}
                  {item.days > 0 && ` · ${n(item.days, 'days')}`}
                </span>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  aria-label={t(item.kind === 'broken' ? 'Fixed' : 'Back in stock')}
                  onClick={() => clear(item.id)}
                >
                  <Icon name="check" size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
