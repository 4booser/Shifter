'use client';

import { useCallback, useEffect, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { apiErrorMessage, readSession } from '@/lib/api/http';
import { todayKey } from '@/lib/calendar/calendar-date';
import { Expense, ExpenseKind, ExpenseRule } from '@/lib/calendar/models';
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
  const [rules, setRules] = useState<ExpenseRule[]>([]);
  const [standing, setStanding] = useState(false);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [kind, setKind] = useState<ExpenseKind>('transport');
  const [date, setDate] = useState(todayKey());
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Null while unknown, false where the server has no reader behind it. No
  // key, no button — and the form beside it is unaffected either way.
  const [canRead, setCanRead] = useState<boolean | null>(null);
  const [reading, setReading] = useState(false);

  const refresh = useCallback(() => {
    void calendarApi
      .expenses(from, to)
      .then(setRows)
      .catch(() => setRows([]));

    void calendarApi
      .expenseRules()
      .then(setRules)
      .catch(() => setRules([]));
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

  // Kept apart, because one is what happened and the other is what a rule
  // says will. Adding them and calling the sum "spent" would be the app
  // reporting a prediction as a receipt.
  const total = rows.reduce((sum, row) => (row.expected ? sum : sum + row.amount), 0);
  const coming = rows.reduce((sum, row) => (row.expected ? sum + row.amount : sum), 0);

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
          {/* The receipt is in a pocket exactly when the expense is worth
              asking about. Two days later nobody remembers it at all. */}
          {canRead !== false && (
            <label className="btn btn-sm w-full cursor-pointer justify-center">
              {reading ? t('Reading…') : `📷 ${t('Photograph the receipt')}`}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={reading}
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  event.target.value = '';

                  if (file === undefined) return;

                  setReading(true);
                  setError(null);

                  const body = new FormData();

                  body.append('photo', file);

                  void fetch(`/shifter/v1/import/receipt?today=${todayKey()}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${readSession()?.access_token ?? ''}` },
                    body,
                  })
                    .then(async (response) => {
                      if (response.status === 404) {
                        setCanRead(false);

                        return;
                      }

                      if (!response.ok) {
                        // The form keeps whatever is in it. A reader that
                        // fails by emptying the form is worse than no reader:
                        // somebody came here to record a number and would have
                        // to start again.
                        setError(t('Could not read the receipt. Type it in instead.'));

                        return;
                      }

                      const read = (await response.json()) as {
                        amount: number | null;
                        date: string | null;
                        merchant: string | null;
                      };

                      // Only what was actually read. A blank left blank is a
                      // question; a blank filled with a guess is an answer.
                      if (read.amount !== null) setAmount(read.amount);
                      if (read.date !== null) setDate(read.date);
                      if (read.merchant !== null && note.trim() === '') setNote(read.merchant);
                    })
                    .catch(() => setError(t('Could not read the receipt. Type it in instead.')))
                    .finally(() => setReading(false));
                }}
              />
            </label>
          )}

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
                inputMode="decimal"
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

      <StandingCosts
        rules={rules}
        open={standing}
        onToggle={() => setStanding((was) => !was)}
        onChanged={() => {
          refresh();
          onChanged?.();
        }}
      />

      {rows.length === 0 ? (
        !open && <p className="field-hint">{t('Nothing recorded for this stretch.')}</p>
      ) : (
        <>
          <p className="mb-2 text-[1.3rem] font-extrabold tracking-tight text-danger">
            −<Money value={total} />
            <span className="field-hint ml-2 font-normal">
              {n(rows.filter((row) => !row.expected).length, 'expenses')}
              {coming > 0 && (
                <>
                  {' · '}
                  {t('and')} <Money value={coming} /> {t('expected')}
                </>
              )}
            </span>
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
                {/* An estimate never mixes with a fact: the ones nobody has
                    confirmed say so, rather than sitting in the total as
                    though somebody had. */}
                {row.expected && <span className="chip">{t('expected')}</span>}
                <Money value={row.amount} className={row.expected ? 'text-muted' : 'font-semibold'} />
                {row.expected && row.rule_id !== null ? (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    title={t('Not this time')}
                    onClick={() => {
                      void calendarApi
                        .skipExpense(row.rule_id!, row.date, true)
                        .then(() => {
                          refresh();
                          onChanged?.();
                        })
                        .catch((caught) => setError(apiErrorMessage(caught)));
                    }}
                  >
                    {t('Not this time')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    aria-label={t('Delete')}
                    onClick={() => remove(row.id)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * The costs that come round.
 *
 * A travel pass, a locker, the monthly whip-round. They are not recorded
 * because recording something is what you do while thinking about it, and the
 * nature of a standing cost is that you are not — it leaves, and it is noticed
 * at the end of the month when the number does not add up.
 *
 * Folded away by default: this is a list somebody sets up once and then wants
 * to stop seeing, which is the whole point of it.
 */
function StandingCosts({
  rules,
  open,
  onToggle,
  onChanged,
}: {
  rules: ExpenseRule[];
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const places = useCalendar((state) => state.locations).filter((place) => !place.archived);

  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<ExpenseKind>('transport');
  const [period, setPeriod] = useState<'month' | 'week'>('month');
  const [day, setDay] = useState(5);
  const [weekday, setWeekday] = useState(0);
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monthly = rules.reduce((sum, rule) => sum + rule.monthly, 0);

  const add = () => {
    if (amount === null || amount <= 0 || note.trim() === '') return;

    setError(null);

    void calendarApi
      .createExpenseRule({
        amount,
        kind,
        note: note.trim(),
        period,
        day_of_month: day,
        weekday,
        starts_on: todayKey(),
        ends_on: null,
        location_id: placeId,
      })
      .then(() => {
        setAmount(null);
        setNote('');
        onChanged();
      })
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  return (
    <div className="mb-3 rounded-(--radius) border border-border p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={onToggle}
      >
        <span className="text-[0.88rem] font-semibold">{t('Every month, without asking')}</span>
        <span className="field-hint">
          {rules.length === 0
            ? t('none yet')
            : (
              <>
                {rules.length} · <Money value={monthly} /> {t('a month')}
              </>
            )}
        </span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

          {rules.map((rule) => (
            <div key={rule.id} className="flex flex-wrap items-center gap-2 text-[0.85rem]">
              <span className="min-w-0 flex-1 truncate">{rule.note}</span>
              <span className="field-hint tabular">
                {rule.period === 'week'
                  ? t('every week')
                  : `${t('every')} ${rule.day_of_month}${t('th')}`}
                {rule.next !== null && ` · ${t('next')} ${rule.next.slice(8)}.${rule.next.slice(5, 7)}`}
              </span>
              <Money value={rule.amount} className="font-semibold" />
              <button
                type="button"
                className="btn btn-quiet btn-sm text-danger"
                aria-label={t('Stop it')}
                onClick={() => {
                  void calendarApi
                    .deleteExpenseRule(rule.id)
                    .then(onChanged)
                    .catch((caught) => setError(apiErrorMessage(caught)));
                }}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <input
              className="field-input"
              placeholder={t('Travel pass, locker, kitty…')}
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <input
              type="number"
              inputMode="decimal"
              min={0}
              className="field-input"
              placeholder={t('How much')}
              value={amount ?? ''}
              onChange={(event) =>
                setAmount(event.target.value === '' ? null : Number(event.target.value))
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`btn btn-sm ${period === 'month' ? 'btn-primary' : 'btn-quiet'}`}
              onClick={() => setPeriod('month')}
            >
              {t('Monthly')}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${period === 'week' ? 'btn-primary' : 'btn-quiet'}`}
              onClick={() => setPeriod('week')}
            >
              {t('Weekly')}
            </button>

            {period === 'month' ? (
              <label className="flex items-center gap-2">
                <span className="field-hint">{t('on the')}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={28}
                  className="field-input w-16"
                  value={day}
                  onChange={(event) => setDay(Number(event.target.value))}
                />
              </label>
            ) : (
              <select
                className="field-input w-auto"
                value={weekday}
                onChange={(event) => setWeekday(Number(event.target.value))}
              >
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name, index) => (
                  <option key={name} value={index}>
                    {t(name)}
                  </option>
                ))}
              </select>
            )}

            <select
              className="field-input w-auto"
              value={kind}
              onChange={(event) => setKind(event.target.value as ExpenseKind)}
            >
              {KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>

            <select
              className="field-input w-auto"
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

            <button
              type="button"
              className="btn btn-primary btn-sm ml-auto"
              disabled={amount === null || amount <= 0 || note.trim() === ''}
              onClick={add}
            >
              {t('Add')}
            </button>
          </div>

          <p className="field-hint">
            {t('It shows up on its day marked as expected. Confirm it, correct it, or skip a month — the rule stays either way.')}
          </p>
        </div>
      )}
    </div>
  );
}
