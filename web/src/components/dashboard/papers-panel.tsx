'use client';

import { useState } from 'react';

import { papersApi } from '@/lib/api/papers';
import { apiErrorMessage } from '@/lib/api/http';
import { todayKey } from '@/lib/calendar/calendar-date';
import { downloadBlob } from '@/lib/export/xlsx';
import { useI18n } from '@/lib/i18n';
import { Alert } from '@/components/ui/bits';

/**
 * The papers desk: an income statement for a person, a CSV for their
 * accountant. Both are drawn from the same worked days the calendar shows —
 * the PDF opens by saying exactly that, because a figure without its source
 * named is how documents start lying.
 */
export function PapersPanel() {
  const { t, lang } = useI18n();

  const year = todayKey().slice(0, 4);
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(todayKey());
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pull = (kind: 'pdf' | 'csv') => {
    setBusy(kind);
    setError(null);

    const call =
      kind === 'pdf'
        ? // The statement exists in the two languages it can be shown in; an
          // English UI still hands over a Ukrainian paper, because the bank
          // clerk it is for reads Ukrainian, not the UI.
          papersApi.incomePdf(from, to, lang === 'ru' ? 'ru' : 'ua')
        : // Same rule as the statement above: the spreadsheet is read by an
          // accountant here, not by the interface.
          papersApi.accountantCsv(from, to, lang === 'ru' ? 'ru' : 'ua');

    void call
      .then((blob) =>
        downloadBlob(
          kind === 'pdf' ? `income-${from}-${to}.pdf` : `income-${from}-${to}.csv`,
          blob,
        ),
      )
      .catch((caught) => setError(apiErrorMessage(caught)))
      .finally(() => setBusy(null));
  };

  return (
    <section className="card reveal p-4">
      <h2 className="mb-1 text-[0.98rem] font-bold">{t('Income papers')}</h2>
      <p className="mb-3 text-[0.82rem] text-muted">
        {t(
          'A statement of what these months came to, built from your own records — and saying so on the first line.',
        )}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-[0.78rem] text-muted">
          {t('From')}
          <input
            type="date"
            className="field-input"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-[0.78rem] text-muted">
          {t('To')}
          <input
            type="date"
            className="field-input"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>

        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() => pull('pdf')}
        >
          {busy === 'pdf' ? t('Preparing…') : t('Income statement (PDF)')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => pull('csv')}
        >
          {busy === 'csv' ? t('Preparing…') : t('CSV for an accountant')}
        </button>
      </div>

      {error !== null && (
        <div className="mt-3">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      <p className="mt-3 text-[0.75rem] text-muted">
        {t('The PDF says on it that it is self-reported. That is not a weakness — a paper that pretends otherwise is worth less.')}
      </p>
    </section>
  );
}
