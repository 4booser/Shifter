'use client';

import { useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n';
import { catalogueActions, summaryRange, useCalendar } from '@/lib/store/calendar';
import { Alert, Money } from '@/components/ui/bits';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';

/** A period the payment is being recorded against, handed in from a row. */
export interface PayoutPrefill {
  locationId: number | null;
  from: string;
  to: string;
  expected: number;
  stream: 'all' | 'wage' | 'commission';
}

export function PayoutModal({
  open,
  prefill,
  onClose,
  onSaved,
}: {
  open: boolean;
  prefill?: PayoutPrefill | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const summary = useCalendar((state) => state.summary);
  const payouts = useCalendar((state) => state.payouts);
  const allLocations = useCalendar((state) => state.locations);
  const locations = allLocations.filter((location) => !location.archived);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [received, setReceived] = useState('');
  const [note, setNote] = useState('');
  const [locationId, setLocationId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setReceived(new Date().toISOString().slice(0, 10));
    setNote('');

    // Opened against a specific period: the amount is filled in with what was
    // calculated — confirming a figure is a glance, retyping it invites a typo.
    if (prefill != null) {
      setFrom(prefill.from);
      setTo(prefill.to);
      setAmount(prefill.expected === 0 ? null : Math.round(prefill.expected * 100) / 100);
      setLocationId(prefill.locationId);

      return;
    }

    const range = summaryRange();

    setFrom(range.from);
    setTo(range.to);
    setAmount(null);
    setLocationId(locations.length === 1 ? locations[0].id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  const difference = amount === null ? null : amount - summary.total_earned;

  const submit = async () => {
    if (amount === null || from === '' || to === '') return;

    try {
      await catalogueActions.createPayout({
        period_from: from,
        period_to: to,
        amount,
        received_on: received,
        note: note.trim() === '' ? null : note,
        location_id: locationId,
        stream: prefill?.stream ?? 'all',
      });
      onSaved?.();
      onClose();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  };

  return (
    <Modal open={open} title={t('Record a payment')} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        {error && <Alert>{error}</Alert>}

        <p className="field-hint">{t('What the job actually paid, so it can be checked against the calculation.')}</p>

        <label>
          <span className="field-label">{t('Who paid it')}</span>
          <select
            className="field-input"
            value={locationId ?? ''}
            onChange={(event) => setLocationId(event.target.value === '' ? null : Number(event.target.value))}
          >
            <option value="">{t('Not attributed')}</option>
            {locations.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t('Period from')}</span>
            <input type="date" className="field-input" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            <span className="field-label">{t('Period to')}</span>
            <input type="date" className="field-input" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t('Amount received')}</span>
            <input
              type="number"
              min={0}
              className="field-input"
              value={amount ?? ''}
              onChange={(event) => setAmount(event.target.value === '' ? null : Number(event.target.value))}
            />
          </label>
          <label>
            <span className="field-label">{t('Received on')}</span>
            <input type="date" className="field-input" value={received} onChange={(event) => setReceived(event.target.value)} />
          </label>
        </div>

        {difference !== null && (
          <p className={`field-hint ${difference < 0 ? 'text-danger' : ''}`}>
            {t('Calculation for the period on screen:')} <Money value={summary.total_earned} />.{' '}
            {difference < 0 ? (
              <>
                {t('This payment is')} <strong><Money value={-difference} /> {t('short')}</strong>.
              </>
            ) : difference > 0 ? (
              <>
                {t('This payment is')} <strong><Money value={difference} /> {t('over')}</strong>.
              </>
            ) : (
              t('Matches exactly.')
            )}
          </p>
        )}

        <label>
          <span className="field-label">{t('Note')}</span>
          <input className="field-input" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        {payouts.length > 0 && (
          <div>
            <span className="field-label">{t('Recorded for this period')}</span>
            <ul className="flex flex-col gap-1">
              {payouts.map((payout) => (
                <li key={payout.id} className="flex items-center gap-2 rounded-(--radius) border border-border px-2.5 py-1.5 text-[0.85rem]">
                  <Money value={payout.amount} className="font-semibold" />
                  <span className="field-hint">{payout.received_on}</span>
                  {payout.location_name && <span className="chip">{payout.location_name}</span>}
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm ml-auto"
                    aria-label={t('Delete')}
                    onClick={() => void catalogueActions.deletePayout(payout.id)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={amount === null} onClick={() => void submit()}>
            {t('Record payment')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
