'use client';

import { useEffect, useState } from 'react';

import { calendarApi } from '@/lib/api/calendar';
import { todayKey } from '@/lib/calendar/calendar-date';
import { apiErrorMessage } from '@/lib/api/http';
import { Goal, GoalPeriod } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { useMoney } from '@/lib/settings/money';
import { Alert, Money, Segmented } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';

const EVERY: Record<GoalPeriod, string> = {
  day: 'Every day',
  week: 'Every week',
  month: 'Every month',
  year: 'Every year',
};

/**
 * Amounts to aim for: standing — every month, every day — or pinned to one
 * period that is going to be different from the rest.
 */
export function GoalsModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const { format } = useMoney();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<GoalPeriod>('month');
  const [dated, setDated] = useState(false);
  const [anchor, setAnchor] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const load = () =>
    void calendarApi
      .goals()
      .then(setGoals)
      .catch((caught) => setError(apiErrorMessage(caught)));

  useEffect(() => {
    if (!open) return;

    setError(null);
    setPeriod('month');
    setDated(false);
    setAnchor(todayKey());
    setAmount(null);
    setNote('');
    load();
  }, [open]);

  const canSave = amount !== null && amount > 0 && (!dated || anchor !== '');

  const submit = async () => {
    if (!canSave || amount === null) return;

    try {
      await calendarApi.saveGoal({
        period,
        amount,
        anchor: dated ? anchor : null,
        note: note.trim() === '' ? null : note.trim(),
      });
      load();
      onSaved?.();
      setAmount(null);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  };

  const remove = async (goal: Goal) => {
    // Every other delete in the app names the thing in the reader's own
    // formatting; this one asked about a bare «40000».
    if (!window.confirm(`${format(goal.amount)} — ${t('Delete this? It cannot be undone.')}`)) return;

    try {
      await calendarApi.deleteGoal(goal.id);
      load();
      onSaved?.();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  };

  return (
    <Modal open={open} title={t('Goals')} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        {error && <Alert>{error}</Alert>}

        {goals.length > 0 && (
          <ul className="flex flex-col gap-1">
            {goals.map((goal) => (
              <li key={goal.id} className="flex items-center gap-2 rounded-(--radius) border border-border px-2.5 py-1.5">
                <span className="min-w-0 flex-1">
                  <Money value={goal.amount} className="text-[0.9rem] font-semibold" />
                  <span className="field-hint block">
                    {goal.anchor === null ? t(EVERY[goal.period]) : `${goal.current_from} — ${goal.current_to}`}
                    {goal.note ? ` · ${goal.note}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  aria-label={t('Edit')}
                  onClick={() => {
                    setPeriod(goal.period);
                    setDated(goal.anchor !== null);
                    setAnchor(goal.anchor ?? anchor);
                    setAmount(goal.amount);
                    setNote(goal.note ?? '');
                  }}
                >
                  <Icon name="brush" size={13} />
                </button>
                <button type="button" className="btn btn-quiet btn-sm btn-danger" aria-label={t('Delete')} onClick={() => void remove(goal)}>
                  <Icon name="trash" size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div>
          <span className="field-label">{t('How long it covers')}</span>
          <Segmented
            value={period}
            options={[
              { value: 'day', label: t('A day') },
              { value: 'week', label: t('A week') },
              { value: 'month', label: t('A month') },
              { value: 'year', label: t('A year') },
            ]}
            onChange={setPeriod}
          />
        </div>

        <div>
          <span className="field-label">{t('How often')}</span>
          <Segmented
            value={dated ? 'one' : 'every'}
            options={[
              { value: 'every', label: t('Every one') },
              { value: 'one', label: t('Just this one') },
            ]}
            onChange={(value) => setDated(value === 'one')}
          />
          <p className="field-hint mt-1">{t('A goal for one period beats the standing one for it.')}</p>
        </div>

        {dated && (
          <label>
            <span className="field-label">{t('Which one')}</span>
            <input type="date" className="field-input" value={anchor} onChange={(event) => setAnchor(event.target.value)} />
            <span className="field-hint mt-1 block">{t('Any date inside it will do.')}</span>
          </label>
        )}

        <label>
          <span className="field-label">{t('Amount')}</span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            step={500}
            className="field-input"
            value={amount ?? ''}
            onChange={(event) => setAmount(event.target.value === '' ? null : Number(event.target.value))}
          />
        </label>

        <label>
          <span className="field-label">{t('Note')}</span>
          <input
            className="field-input"
            maxLength={120}
            value={note}
            placeholder={t('Rent, holiday, a new bike')}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={() => void submit()}>
            {t('Save changes')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
