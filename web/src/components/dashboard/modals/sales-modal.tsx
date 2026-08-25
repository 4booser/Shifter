'use client';

import { useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api/http';
import { SalesPosition } from '@/lib/calendar/models';
import { useI18n } from '@/lib/i18n';
import { catalogueActions } from '@/lib/store/calendar';
import { Alert } from '@/components/ui/bits';
import { Modal } from '@/components/ui/modal';

export function SalesModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: SalesPosition | null;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [percentage, setPercentage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setName(editing?.name ?? '');
    setPrice(editing?.price ?? 0);
    setPercentage(editing?.percentage ?? 0);
  }, [open, editing]);

  const perUnit = (price * percentage) / 100;

  const submit = async () => {
    if (name.trim() === '' || percentage < 0 || percentage > 100) return;

    try {
      await catalogueActions.savePosition({ name: name.trim(), price, percentage }, editing?.id ?? null);
      onClose();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  };

  return (
    <Modal open={open} title={t(editing === null ? 'New sales position' : 'Edit position')} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        {error && <Alert>{error}</Alert>}

        <label>
          <span className="field-label">{t('Name')}</span>
          <input className="field-input" maxLength={60} value={name} placeholder="Hookah" onChange={(event) => setName(event.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">{t('Price per unit')}</span>
            <input type="number" min={0} className="field-input" value={price} onChange={(event) => setPrice(Number(event.target.value) || 0)} />
          </label>
          <label>
            <span className="field-label">{t('Your share, %')}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              className="field-input"
              value={percentage}
              onChange={(event) => setPercentage(Number(event.target.value) || 0)}
            />
          </label>
        </div>

        <p className="field-hint">
          {t('You keep')} <strong className="tabular">{Math.round(perUnit * 100) / 100}</strong> {t('per unit sold.')}
        </p>

        {editing !== null && (
          <p className="field-hint">
            {t('Repricing is safe: days keep the price and percentage they were recorded with, so past earnings do not move.')}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={name.trim() === ''} onClick={() => void submit()}>
            {t(editing === null ? 'Create position' : 'Save changes')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
