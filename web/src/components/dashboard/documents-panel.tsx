'use client';

import { useCallback, useEffect, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import { formatDate, todayKey } from '@/lib/calendar/calendar-date';
import { DocumentKind, WorkDocument } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

/**
 * The papers without which somebody is not allowed on shift.
 *
 * An expired медкнижка is not a fine — it is being turned away from a shift you
 * were counting on. And people remember it on the day it is needed, which is
 * the one day it cannot be fixed. The app already knows when every shift is;
 * knowing when the paper runs out costs one date and buys a month's warning.
 *
 * A date and a name, and nothing else. A photograph of somebody's medical book
 * is exactly the kind of thing that should not sit on a server: the reminder
 * needs the expiry, and the document itself belongs in a pocket.
 */
const KINDS: { value: DocumentKind; label: string }[] = [
  { value: 'medical', label: 'Medical book' },
  { value: 'sanitary', label: 'Food hygiene' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'licence', label: 'Licence' },
  { value: 'permit', label: 'Work permit' },
  { value: 'other', label: 'Something else' },
];

export function DocumentsPanel() {
  const { t, n, lang } = useI18n();

  const [rows, setRows] = useState<WorkDocument[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [kind, setKind] = useState<DocumentKind>('medical');
  const [name, setName] = useState('');
  const [expires, setExpires] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void calendarApi
      .documents()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(refresh, [refresh]);

  const reset = () => {
    setOpen(false);
    setEditing(null);
    setKind('medical');
    setName('');
    setExpires('');
    setNote('');
  };

  const edit = (row: WorkDocument) => {
    setEditing(row.id);
    setKind(row.kind);
    setName(row.name);
    setExpires(row.expires_on);
    setNote(row.note ?? '');
    setOpen(true);
  };

  const save = () => {
    if (name.trim() === '' || expires === '') return;

    setError(null);

    void calendarApi
      .saveDocument(editing, {
        kind,
        name: name.trim(),
        expires_on: expires,
        note: note.trim() === '' ? null : note.trim(),
      })
      .then(() => {
        reset();
        refresh();
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const remove = (id: number) => {
    void calendarApi
      .deleteDocument(id)
      .then(refresh)
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const pressing = rows.filter((row) => row.state !== 'fine');

  return (
    <section className="card reveal p-4">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[0.98rem] font-bold">{t('Papers')}</h2>
          <p className="field-hint">
            {t('A medical book that ran out is a shift you are sent home from.')}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => (open ? reset() : setOpen(true))}
        >
          {t(open ? 'Cancel' : 'Add')}
        </button>
      </header>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {pressing.length > 0 && (
        <p
          className={`mb-2.5 rounded-(--radius) border px-3 py-2 text-[0.87rem] ${
            pressing.some((row) => row.state === 'expired')
              ? 'border-danger/40 bg-(--danger-soft) text-danger-read'
              : 'border-warn/40 text-warn-read'
          }`}
        >
          {pressing[0].state === 'expired'
            ? `${pressing[0].name} — ${t('has run out')}`
            : `${pressing[0].name} — ${t('runs out in')} ${n(pressing[0].days_left, 'days')}`}
        </p>
      )}

      {open && (
        <div className="mb-3 flex flex-col gap-2.5 rounded-(--radius) border border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`btn btn-sm ${kind === option.value ? 'btn-primary' : 'btn-quiet'}`}
                aria-pressed={kind === option.value}
                onClick={() => {
                  setKind(option.value);
                  if (name.trim() === '') setName(t(option.label));
                }}
              >
                {t(option.label)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">{t('What it is called')}</span>
              <input
                className="field-input"
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">{t('Good until')}</span>
              <input
                type="date"
                className="field-input"
                min={todayKey()}
                value={expires}
                onChange={(event) => setExpires(event.target.value)}
              />
            </label>
          </div>

          <label>
            <span className="field-label">{t('Where to renew it, or its number')}</span>
            <input
              className="field-input"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <p className="field-hint">
            {t('Only the date is kept. A photograph of your medical book belongs in your pocket, not on a server.')}
          </p>

          <button
            type="button"
            className="btn btn-primary self-end"
            disabled={name.trim() === '' || expires === ''}
            onClick={save}
          >
            {t(editing === null ? 'Record it' : 'Save')}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        !open && <p className="field-hint">{t('Nothing recorded yet.')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-(--radius) border px-3 py-2 text-[0.87rem] ${
                row.state === 'expired'
                  ? 'border-danger/40'
                  : row.state === 'urgent'
                    ? 'border-warn/40'
                    : 'border-border'
              }`}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
              <span className="tabular text-muted">{formatDate(row.expires_on, lang)}</span>
              <span
                className={`chip ${
                  row.state === 'expired'
                    ? 'border-danger/40 text-danger-read'
                    : row.state === 'urgent'
                      ? 'border-warn/40 text-warn-read'
                      : row.state === 'soon'
                        ? 'text-warn-read'
                        : 'text-muted'
                }`}
              >
                {row.days_left < 0
                  ? t('has run out')
                  : `${t('in')} ${n(row.days_left, 'days')}`}
              </span>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                aria-label={t('Edit')}
                onClick={() => edit(row)}
              >
                <Icon name="note" size={13} />
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                aria-label={t('Delete')}
                onClick={() => remove(row.id)}
              >
                <Icon name="trash" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
