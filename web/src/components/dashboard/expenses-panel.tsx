'use client';

import { useCallback, useEffect, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import { todayKey } from '@/lib/calendar/calendar-date';
import { Expense, ExpenseKind } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { useCalendar } from '@/lib/store/calendar';
import { Alert, Money } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

/**
 * What the work cost, as opposed to what the venue took off somebody.
 *
 * It lives on the payouts page rather than on a day because that is where
 * people think about money leaving and arriving in the same breath — and
 * because it must never look like part of the day's earnings. Nothing here is
 * subtracted from anything: take-home is what arrived, and a taxi home happened
 * after that.
 */
const KINDS: { value: ExpenseKind; label: string }[] = [
  { value: 'transport', label: 'Getting there' },
  { value: 'uniform', label: 'Uniform' },
  { value: 'tools', label: 'Tools' },
  { value: 'food', label: 'Food at work' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Something else' },
];

export function ExpensesPanel({
  from,
  to,
  onChanged,
}: {
  from: string;
  to: string;
  onChanged?: () => void;
}) {
  const { t, n } = useI18n();
  const places = useCalendar((state) => state.locations).filter((place) => !place.archived);

  const [rows, setRows] = useState<Expense[]>([]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [kind, setKind] = useState<ExpenseKind>('transport');
  const [date, setDate] = useState(todayKey());
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void calendarApi
      .expenses(from, to)
      .then(setRows)
      .catch(() => setRows([]));
  }, [from, to]);

  useEffect(refresh, [refresh]);

  const add = () => {
    if (amount === null || amount <= 0) return;

    setError(null);

    void calendarApi
      .createExpense({
        date,
        amount,
        kind,
        note: note.trim() === '' ? null : note.trim(),
        location_id: placeId,
      })
      .then(() => {
        setAmount(null);
        setNote('');
        setOpen(false);
        refresh();
        onChanged?.();
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const remove = (id: number) => {
    void calendarApi
      .deleteExpense(id)
      .then(() => {
        refresh();
        onChanged?.();
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <section className="card reveal p-4">
      <header className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[0.98rem] font-bold">{t('What the work cost')}</h2>
          <p className="field-hint">
            {t('Never taken off your earnings — this is money that left afterwards.')}
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setOpen((was) => !was)}>
          {t(open ? 'Cancel' : 'Add')}
        </button>
      </header>

      {error && <Alert>{error}</Alert>}

      {open && (
        <div className="mb-3 flex flex-col gap-2.5 rounded-(--radius) border border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`btn btn-sm ${kind === option.value ? 'btn-primary' : 'btn-quiet'}`}
                aria-pressed={kind === option.value}
                onClick={() => setKind(option.value)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">{t('How much')}</span>
              <input
                type="number"
                min={0}
                className="field-input"
                value={amount ?? ''}
                onChange={(event) =>
                  setAmount(event.target.value === '' ? null : Number(event.target.value))
                }
              />
            </label>
            <label>
              <span className="field-label">{t('When')}</span>
              <input
                type="date"
                className="field-input"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          </div>

          <label>
            <span className="field-label">{t('Which job made it necessary')}</span>
            <select
              className="field-input"
              value={placeId ?? ''}
              onChange={(event) =>
                setPlaceId(event.target.value === '' ? null : Number(event.target.value))
              }
            >
              <option value="">{t('The trade, not one job')}</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="field-label">{t('Note')}</span>
            <input
              className="field-input"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="btn btn-primary self-end"
            disabled={amount === null || amount <= 0}
            onClick={add}
          >
            {t('Record it')}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        !open && <p className="field-hint">{t('Nothing recorded for this stretch.')}</p>
      ) : (
        <>
          <p className="mb-2 text-[1.3rem] font-extrabold tracking-tight text-danger">
            −<Money value={total} />
            <span className="field-hint ml-2 font-normal">{n(rows.length, 'expenses')}</span>
          </p>

          <ul className="flex flex-col gap-1">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-(--radius) border border-border px-3 py-1.5 text-[0.85rem]"
              >
                <span className="tabular text-muted">{row.date}</span>
                <span className="chip">
                  {t(KINDS.find((option) => option.value === row.kind)?.label ?? 'Something else')}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {row.location_name ?? ''}
                  {row.note !== null && (row.location_name !== null ? ' · ' : '') + row.note}
                </span>
                <Money value={row.amount} className="font-semibold" />
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  aria-label={t('Delete')}
                  onClick={() => remove(row.id)}
                >
                  <Icon name="close" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
