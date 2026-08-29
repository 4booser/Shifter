'use client';

import { useMemo, useState } from 'react';

import { Payout } from '@/lib/calendar/models';
import { catalogueActions } from '@/lib/store/calendar';
import { apiErrorMessage } from '@/lib/api/http';
import { useMoney } from '@/lib/settings/money';
import { useI18n } from '@/lib/i18n';
import { Alert } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';

/**
 * The ledger as rows: every recorded payment, each one fixable or removable.
 *
 * The reconciliation above answers «сходится ли». This section is for when
 * it does not because the records themselves went wrong — a sum mistyped, a
 * month attributed to the wrong place, or a ledger that went so crooked early
 * on that the honest fix is to wipe it and retype from the payslips. Deleting
 * everything is a real feature, asked for out loud with the word typed back,
 * because «начать с чистого листа» beats arguing with forty wrong rows.
 */
export function PayoutLedger({
  payouts,
  onEdit,
  onChanged,
}: {
  /** The rows for the page's own window, fetched by the page. */
  payouts: Payout[];
  onEdit: (payout: Payout) => void;
  onChanged: () => void;
}) {
  const { t, n } = useI18n();
  const { format } = useMoney();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => [...payouts].sort((a, b) => b.received_on.localeCompare(a.received_on)),
    [payouts],
  );

  const remove = (id: number) => {
    setError(null);

    void catalogueActions
      .deletePayout(id)
      .then(onChanged)
      .catch((caught) => setError(apiErrorMessage(caught)));
  };

  const wipe = () => {
    setBusy(true);
    setError(null);

    void catalogueActions
      .wipePayouts()
      .then(() => {
        setArmed(false);
        setWord('');
        onChanged();
      })
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setBusy(false));
  };

  // The word the person has to type back. Kept as the literal translated
  // word so the danger is asked for in the language it will be understood in.
  const requiredWord = t('WIPE');

  return (
    <section className="card reveal p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span>
          <span className="text-[0.98rem] font-bold">{t('Recorded payments')}</span>
          <span className="ml-2 text-[0.82rem] text-muted">{n(rows.length, 'entries')}</span>
        </span>
        <Icon name={open ? 'chevron-left' : 'chevron-right'} size={16} className='rotate-90' />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="field-hint">
            {t('Each row can be fixed or removed. The reconciliation above recalculates from whatever is left.')}
          </p>

          {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

          {rows.length === 0 && <p className="field-hint">{t('Nothing recorded in this stretch.')}</p>}

          <div className="flex flex-col divide-y divide-(--line)">
            {rows.map((payout) => (
              <div key={payout.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold tabular">{format(payout.amount)}</span>
                    <span className="text-[0.8rem] text-muted">
                      {payout.location_name ?? t('No place given')}
                    </span>
                    {payout.kind !== 'settlement' && (
                      <span className="chip text-[0.72rem]">{t(payout.kind)}</span>
                    )}
                  </div>
                  <div className="text-[0.78rem] text-muted">
                    {payout.period_from} — {payout.period_to} · {t('received')} {payout.received_on}
                    {payout.note !== null && ` · ${payout.note}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => onEdit(payout)}
                >
                  {t('Fix')}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm text-danger"
                  aria-label={t('Remove this payment')}
                  onClick={() => remove(payout.id)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>

          {rows.length > 0 && (
            <div className="rounded-lg border border-danger/40 p-3">
              <p className="text-[0.85rem] font-semibold text-danger">{t('Start the ledger over')}</p>
              <p className="field-hint mt-0.5">
                {t('Removes every recorded payment and every period verdict, everywhere — not just this stretch. Shifts and earnings stay. There is no undo.')}
              </p>

              {!armed ? (
                <button type="button" className="btn btn-sm mt-2" onClick={() => setArmed(true)}>
                  {t('I want to wipe all payments')}
                </button>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className="field-input w-40"
                    value={word}
                    placeholder={requiredWord}
                    aria-label={t('Type the word to confirm')}
                    onChange={(event) => setWord(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && word.trim().toUpperCase() === requiredWord) wipe();
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm text-danger"
                    disabled={busy || word.trim().toUpperCase() !== requiredWord}
                    onClick={wipe}
                  >
                    {busy ? '…' : t('Wipe them all')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => {
                      setArmed(false);
                      setWord('');
                    }}
                  >
                    {t('Cancel')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
